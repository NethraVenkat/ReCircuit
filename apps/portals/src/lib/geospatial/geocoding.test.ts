import { expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HeiGitGeocoder } from "./geocoding.server";
import { RoutingService, RoutingStore, Settings } from "./service";
import { syntheticBooking, syntheticInput, syntheticPreparation } from "./fixtures";
import { Verification } from "./contracts";
import { GeocodeAttempt } from "./geocoding";
const query = { tenant: "deccan" as const, address: "PUBLIC TEST LANDMARK", addressFingerprint: "public-test-hash" };
const feature = (layer = "address", confidence = 0.95) => ({ geometry: { type: "Point", coordinates: [8.66, 49.41] }, properties: { label: "PUBLIC TEST LANDMARK", layer, confidence } });
const body = (features: unknown[]) => ({ type: "FeatureCollection", features });
const transport = (features: unknown[]) => vi.fn().mockImplementation(async () => new Response(JSON.stringify(body(features))));
it.each([["address", 0.99], ["locality", 0.2]] as const)("valid %s precision always needs human review", async (layer, confidence) => {
  const provider = new HeiGitGeocoder("unit-only-key", true, [query.address], transport([feature(layer, confidence)]));
  const result = await provider.resolve(query); expect(result.state).toBe("review-required"); expect(result.candidates[0]).toMatchObject({ precision: layer, coordinate: { lon: 8.66, lat: 49.41 }, confidence });
});
it("distinguishes multiple matches and no match without city fallback", async () => {
  expect((await new HeiGitGeocoder("unit", true, [query.address], transport([feature(), feature("street")])).resolve(query)).state).toBe("ambiguous");
  expect(await new HeiGitGeocoder("unit", true, [query.address], transport([])).resolve(query)).toMatchObject({ state: "failed", candidates: [] });
});
it.each([401, 403, 429, 500, 503])("HTTP %i is redacted and has exactly one attempt", async status => {
  const call = vi.fn().mockResolvedValue(new Response("PRIVATE BODY SECRET", { status })), provider = new HeiGitGeocoder("unit-secret", true, [query.address], call);
  await expect(provider.resolve(query)).rejects.toThrow(status === 429 ? "RATE_LIMITED" : "HTTP_" + status); expect(call).toHaveBeenCalledTimes(1);
});
it.each(["not json", JSON.stringify(body([{ ...feature(), geometry: { type: "Point", coordinates: [200, 95] } }])), "{}"])("malformed response is refused without raw details", async text => {
  await expect(new HeiGitGeocoder("unit", true, [query.address], vi.fn().mockResolvedValue(new Response(text))).resolve(query)).rejects.toThrow("GEOCODING_RESPONSE_INVALID");
});
it.each([new Error("network with secret context"), new DOMException("timeout", "TimeoutError")])("network/timeout is redacted without retries", async error => {
  const call = vi.fn().mockRejectedValue(error); await expect(new HeiGitGeocoder("unit", true, [query.address], call).resolve(query)).rejects.toThrow("GEOCODING_NETWORK_OR_TIMEOUT"); expect(call).toHaveBeenCalledTimes(1);
});
it("bounds response bytes, refuses private addresses and never sends key in URL", async () => {
  const call = vi.fn().mockResolvedValue(new Response(" ".repeat(262145))), provider = new HeiGitGeocoder("unit-private-key", true, [query.address], call);
  await expect(provider.resolve({ ...query, address: "PRIVATE CUSTOMER ADDRESS" })).rejects.toThrow("PUBLIC_LOCATIONS_ONLY"); expect(call).not.toHaveBeenCalled();
  await expect(provider.resolve(query)).rejects.toThrow("RESPONSE_LIMIT"); expect(call.mock.calls[0]![0]).not.toContain("unit-private-key"); expect(call.mock.calls[0]![1].headers.Authorization).toBe("unit-private-key");
});
it("caches without refreshing retrieval timestamp, deduplicates, separates tenants/addresses, bounds usage", async () => {
  let now = Date.parse("2026-10-24T00:00:00Z"); const call = transport([feature()]), provider = new HeiGitGeocoder("unit", true, [query.address], call, 4, () => now);
  const [first, duplicate] = await Promise.all([provider.resolve(query), provider.resolve(query)]); expect(duplicate).toEqual(first); expect(call).toHaveBeenCalledTimes(1);
  now += 10000; expect(await provider.resolve(query)).toEqual(first);
  await provider.resolve({ ...query, tenant: "paperplus" }); await provider.resolve({ ...query, addressFingerprint: "changed" }); expect(call).toHaveBeenCalledTimes(3);
  now += 300000; expect((await provider.resolve(query)).retrievedAt).not.toBe(first.retrievedAt);
  await expect(provider.resolve({ ...query, addressFingerprint: "fifth" })).rejects.toThrow("BUDGET"); expect(call).toHaveBeenCalledTimes(4);
});
it("authorized workflow persists review provenance, blocks until review, rejects stale candidates and preserves address", async () => {
  const booking = syntheticBooking("synthetic-stop-000"), before = JSON.stringify(booking), input = syntheticInput(1), address = [booking.addressLine, booking.locality, booking.pincode].join(", ");
  const geocoder = new HeiGitGeocoder("unit", true, [address], transport([feature("locality", 0.2)])), store = new RoutingStore(await fs.mkdtemp(path.join(os.tmpdir(), "routing-geocode-"))), source = { list: async () => [structuredClone(booking)], verification: async () => Verification.parse(syntheticPreparation(booking).verification) };
  const service = new RoutingService(source, store, { configurationId: "synthetic-matrix", matrix: async () => input.matrix }, () => new Date(), geocoder);
  await expect(service.geocode("deccan", { bookingId: "not-owned" })).rejects.toThrow("NOT_FOUND");
  const result = await service.geocode("deccan", { bookingId: booking.id }); expect((await service.preview("deccan", "2026-10-24")).conversions[0]!.eligible).toBe(false);
  const candidate = result.candidates[0]!, review = { bookingId: booking.id, coordinate: candidate.coordinate, serviceSeconds: 60, assumptionVersion: "explicit test", candidateResultId: result.id, candidateId: candidate.id };
  await expect(service.review("deccan", { ...review, coordinate: { lat: 0, lon: 0 } }, "operator")).rejects.toThrow("CORRECTION_REASON_REQUIRED");
  await service.review("deccan", review, "operator"); const saved = (await store.settings("deccan")).reviews[booking.id]!.geocode;
  expect(saved.provider).toBe("heigit-pelias"); expect(saved.precision).toBe("locality"); expect(saved.sourceResultId).toBe(result.id); expect(saved.reviewedBy).toBe("operator"); expect((await service.preview("deccan", "2026-10-24")).conversions[0]!.eligible).toBe(true);
  expect(JSON.stringify(booking)).toBe(before); booking.addressLine += " changed";
  await expect(service.review("deccan", review, "operator")).rejects.toThrow("STALE_OR_INVALID"); expect((await service.preview("deccan", "2026-10-24")).conversions[0]!.eligible).toBe(false);
});
it("reads legacy settings without rewriting them and rejects mixed-tenant nested settings", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "routing-legacy-geocode-")), store = new RoutingStore(directory), input = syntheticInput(1), legacy = { tenant: "deccan" as const, version: 1, createdAt: new Date().toISOString(), vehicles: input.vehicles, reviews: {} };
  await store.append("deccan", "settings", legacy); const filename = path.join(directory, "deccan/settings/00000001.json"), before = await fs.readFile(filename, "utf8");
  expect((await store.settings("deccan")).geocoding).toEqual({}); expect(await fs.readFile(filename, "utf8")).toBe(before);
  expect(Settings.safeParse({ ...legacy, vehicles: [{ ...input.vehicles[0], tenant: "paperplus" }] }).success).toBe(false);
});
it("does not accept inconsistent geocoding success labels or duplicate candidate identities", () => {
  const attempt = { id: "00000000-0000-4000-8000-000000000001", tenant: "deccan", bookingId: "synthetic", addressFingerprint: "hash", provider: "synthetic", providerConfiguration: "v1", retrievedAt: "2026-10-24T00:00:00Z", expiresAt: "2026-10-24T00:05:00Z", state: "review-required", candidates: [] };
  expect(GeocodeAttempt.safeParse(attempt).success).toBe(false);
  const candidate = { id: "same-id", coordinate: { lat: 1, lon: 2 }, label: "SYNTHETIC", precision: "fixture", confidence: null };
  expect(GeocodeAttempt.safeParse({ ...attempt, state: "ambiguous", candidates: [candidate, candidate] }).success).toBe(false);
});

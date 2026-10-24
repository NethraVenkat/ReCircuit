import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { addressFingerprint, Verification } from "./contracts";
import { syntheticBooking, syntheticInput, syntheticPreparation } from "./fixtures";
import { RoutingService, RoutingStore } from "./service";
import { PUBLIC_LANDMARK, PUBLIC_LANDMARK_ADDRESS, PUBLIC_LANDMARK_QUERY, PUBLIC_DOCUMENTATION_COORDINATES, PublicOnlyHeiGitProvider, RegisteredPublicGeocoder } from "./public-pilot.server";

async function scenario() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "recircuit-public-pilot-mocked-")), store = new RoutingStore(directory);
  const booking = { ...syntheticBooking(PUBLIC_LANDMARK.bookingId), addressLine: PUBLIC_LANDMARK.addressLine, locality: PUBLIC_LANDMARK.locality, pincode: PUBLIC_LANDMARK.pincode };
  const coordinate = { lon: 8.7154, lat: 49.4106 }, requests: Array<{ url: string; body: unknown }> = [];
  const transport: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (init?.body !== undefined && typeof init.body !== "string") throw Error("MOCK_EXPECTS_JSON_STRING_BODY");
    const body = init?.body ? JSON.parse(init.body) as unknown : null; requests.push({ url, body });
    if (url.startsWith("https://api.heigit.org/pelias/v1/search?")) return Response.json({ type: "FeatureCollection", features: [{ geometry: { type: "Point", coordinates: [coordinate.lon, coordinate.lat] }, properties: { label: "MOCK transport public landmark candidate", layer: "venue", confidence: 1 } }] });
    if (url === "https://api.heigit.org/openrouteservice/v2/matrix/driving-car") return Response.json({ distances: [[0, 100], [140, 0]], durations: [[0, 10], [14, 0]] });
    if (url === "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson") return Response.json({ features: [{ geometry: { type: "LineString", coordinates: [PUBLIC_DOCUMENTATION_COORDINATES[1]!, coordinate, PUBLIC_DOCUMENTATION_COORDINATES[1]!].map(c => [c.lon, c.lat]) }, properties: { summary: { distance: 240, duration: 24 } } }] });
    throw Error("UNREGISTERED_MOCK_ENDPOINT");
  };
  const geocoder = new RegisteredPublicGeocoder("synthetic-not-a-credential", true, transport), provider = new PublicOnlyHeiGitProvider("synthetic-not-a-credential", true, store, geocoder.configurationId, transport);
  const source = { list: async () => [structuredClone(booking)], verification: async () => Verification.parse(syntheticPreparation(booking).verification) };
  const service = new RoutingService(source, store, provider, () => new Date(), geocoder), depot = { id: "public-ors-docs-depot", coordinate: PUBLIC_DOCUMENTATION_COORDINATES[1]! };
  await service.vehicles("deccan", [{ ...syntheticInput(1).vehicles[0]!, start: depot, end: depot }]);
  return { service, store, source, booking, provider, geocoder, requests, coordinate, directory };
}
it("connects actual public adapters through review, directed matrix, replay, geometry and immutable reload with mocked transport only", async () => {
  const s = await scenario(), before = JSON.stringify(s.booking), attempt = await s.service.geocode("deccan", { bookingId: s.booking.id });
  expect(attempt.state).toBe("review-required"); expect(s.requests).toHaveLength(1);
  expect(new URL(s.requests[0]!.url).searchParams.get("text")).toBe(PUBLIC_LANDMARK_QUERY);
  expect(attempt.addressFingerprint).toBe(addressFingerprint(s.booking));
  const cached = await s.geocoder.resolve({ tenant: "deccan", address: PUBLIC_LANDMARK_ADDRESS, addressFingerprint: addressFingerprint(s.booking) });
  expect(cached.retrievedAt).toBe(attempt.retrievedAt); expect(s.requests).toHaveLength(1);
  await expect(s.service.generate("deccan", "2026-10-24", randomUUID())).rejects.toThrow("NO_ELIGIBLE_PICKUPS");
  await s.service.review("deccan", { bookingId: s.booking.id, candidateResultId: attempt.id, candidateId: attempt.candidates[0]!.id, coordinate: s.coordinate, serviceSeconds: 60, assumptionVersion: "explicit public fixture review" }, "test-operator");
  const key = randomUUID(), saved = await s.service.generate("deccan", "2026-10-24", key);
  expect(saved.independentValidation.valid).toBe(true); expect(saved.current).toBe(true); expect(saved.optimization.solution.metres).toBe(240);
  expect(saved.optimization.solution.routes[0]).toMatchObject({ travelSeconds: 24, serviceSeconds: 60, waitingSeconds: 0, totalSeconds: 84 });
  expect(saved.geometry?.[0]).toMatchObject({ matrixMismatch: false, metres: 240, seconds: 24 }); expect(s.requests).toHaveLength(3);
  expect(s.requests[1]!.body).toMatchObject({ locations: [[8.67842, 49.40664], [8.7154, 49.4106]], metrics: ["distance", "duration"], units: "m" });
  expect((s.requests[2]!.body as { coordinates: number[][] }).coordinates).toEqual([[8.67842, 49.40664], [8.7154, 49.4106], [8.67842, 49.40664]]);
  expect((await s.service.generate("deccan", "2026-10-24", key)).id).toBe(saved.id); expect(s.requests).toHaveLength(3);
  const restarted = new RoutingService(s.source, new RoutingStore(s.directory), new PublicOnlyHeiGitProvider("synthetic-not-a-credential", true, new RoutingStore(s.directory), s.geocoder.configurationId, async () => { throw Error("RELOAD_MUST_NOT_FETCH"); }), () => new Date(), s.geocoder);
  expect(await restarted.read("deccan", saved.id)).toEqual(saved); expect(JSON.stringify(s.booking)).toBe(before);
});
it("refuses private queries and coordinate substitutions before any road request", async () => {
  const s = await scenario();
  await expect(s.geocoder.resolve({ tenant: "deccan", address: "SYNTHETIC private customer address", addressFingerprint: "different" })).rejects.toThrow("REGISTERED_PUBLIC_LOCATION_ONLY"); expect(s.requests).toHaveLength(0);
  const attempt = await s.service.geocode("deccan", { bookingId: s.booking.id });
  await s.service.review("deccan", { bookingId: s.booking.id, candidateResultId: attempt.id, candidateId: attempt.candidates[0]!.id, coordinate: { ...s.coordinate, lon: s.coordinate.lon + 0.001 }, correctionReason: "Test manual substitution remains unapproved for external public pilot", serviceSeconds: 60, assumptionVersion: "corrected fixture" }, "test-operator");
  await expect(s.service.generate("deccan", "2026-10-24", randomUUID())).rejects.toThrow("PUBLIC_TEST_COORDINATES_ONLY");
  await expect(s.provider.geometry([{ lon: 0, lat: 0 }, s.coordinate])).rejects.toThrow("PUBLIC_TEST_COORDINATES_ONLY"); expect(s.requests).toHaveLength(1);
});

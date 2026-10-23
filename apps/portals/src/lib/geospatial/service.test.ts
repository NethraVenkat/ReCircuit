import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { RoutingService, RoutingStore, type BookingSource } from "./service";
import { syntheticBooking, syntheticInput, syntheticPreparation } from "./fixtures";
import { bookingFingerprint, fingerprint, type MatrixSnapshot } from "./contracts";
import type { MatrixProvider, MatrixRequest } from "./providers";
import { authorizeRouting, browserMapConfiguration } from "./authorization.server";
import { verificationFromHousehold } from "./verification-bridge";
import { HeiGitProvider } from "./heigit.server";
import { optimize } from "./optimizer";
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "recircuit-geospatial-")), booking = syntheticBooking("synthetic-stop-000"), base = syntheticInput(1);
  const source: BookingSource = { list: async () => [structuredClone(booking)], verification: async () => syntheticPreparation(booking).verification as Awaited<ReturnType<BookingSource["verification"]>> };
  const provider: MatrixProvider = { matrix: async request => ({ ...base.matrix, nodes: request.nodes, edges: base.matrix.edges }) };
  const store = new RoutingStore(directory), service = new RoutingService(source, store, provider);
  await service.vehicles("deccan", base.vehicles);
  await service.review("deccan", { bookingId: booking.id, coordinate: base.pickups[0]!.coordinate, serviceSeconds: 60, assumptionVersion: "synthetic-reviewed-60s" }, "synthetic-operator");
  return { booking, base, source, store, service, provider, directory };
}
describe("authorized services, persistence and concurrency", () => {
  it("runs booking → conversion → matrix → optimization → independent validation → save → reload without booking mutations", async () => {
    const s = await setup(), before = JSON.stringify(s.booking), key = randomUUID();
    const preview = await s.service.preview("deccan", "2026-10-24"); expect(preview.conversions[0]!.eligible).toBe(true);
    const result = await s.service.generate("deccan", "2026-10-24", key);
    expect(result.independentValidation.valid).toBe(true); expect(result.optimization.solution.metres).toBe(300); expect(result.optimization.solution.routes[0]!.stops[0]!.loadKg).toBe(0.5);
    expect(result.current).toBe(true); expect(result.planningOnly).toBe(true); expect(JSON.stringify(s.booking)).toBe(before);
    const reloaded = new RoutingService(s.source, new RoutingStore(s.directory), s.provider);
    expect(await reloaded.read("deccan", result.id)).toEqual(result); expect((await reloaded.generate("deccan", "2026-10-24", key)).id).toBe(result.id); expect((await reloaded.history("deccan")).length).toBe(1);
    await expect(reloaded.read("paperplus", result.id)).rejects.toThrow("NOT_FOUND");
  });
  it("keeps immutable versions and detects changed coordinates and bookings after save", async () => {
    const s = await setup(), result = await s.service.generate("deccan", "2026-10-24", randomUUID());
    const raw = await fs.readFile(path.join(s.directory, "deccan/proposals/00000001.json"), "utf8");
    await s.service.review("deccan", { bookingId: s.booking.id, coordinate: { lat: 0, lon: 0.002 }, serviceSeconds: 61, assumptionVersion: "explicit-v2" }, "operator");
    expect((await s.service.read("deccan", result.id)).current).toBe(false); expect(await fs.readFile(path.join(s.directory, "deccan/proposals/00000001.json"), "utf8")).toBe(raw);
    await expect(s.service.generate("deccan", "2026-10-24", result.requestKey)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("rejects a source change during a delayed provider request and blocks simultaneous generation", async () => {
    const s = await setup(); let release!: (m: MatrixSnapshot) => void, input!: MatrixRequest;
    const slow = new RoutingService(s.source, s.store, { matrix: async r => { input = r; return new Promise(resolve => { release = resolve; }); } });
    const first = slow.generate("deccan", "2026-10-24", randomUUID());
    while (!release) await new Promise(resolve => setTimeout(resolve, 1));
    await expect(slow.generate("deccan", "2026-10-24", randomUUID())).rejects.toThrow("BUSY");
    s.booking.items[0]!.weightKg = 2; release({ ...s.base.matrix, nodes: input.nodes });
    await expect(first).rejects.toThrow("SOURCE_CHANGED"); expect(await s.service.history("deccan")).toEqual([]);
  });
  it("refuses incomplete, cross-tenant, duplicate IDs, invalid payload and storage failures", async () => {
    const s = await setup(); await expect(s.service.vehicles("paperplus", s.base.vehicles)).rejects.toThrow("TENANT");
    await expect(s.service.review("deccan", { bookingId: "not-owned", coordinate: { lat: 0, lon: 0 }, serviceSeconds: 60, assumptionVersion: "v1" }, "operator")).rejects.toThrow("NOT_FOUND");
    await expect(s.service.review("deccan", { bookingId: s.booking.id, coordinate: { lat: 0, lon: 0 }, serviceSeconds: 60, assumptionVersion: "v1", verification: true }, "operator")).rejects.toThrow();
    s.source.verification = async () => null; await expect(s.service.generate("deccan", "2026-10-24", randomUUID())).rejects.toThrow("NO_ELIGIBLE");
    const bad = path.join(s.directory, "file"); await fs.writeFile(bad, "occupied"); await expect(new RoutingStore(bad).append("deccan", "settings", { tenant: "deccan", version: 1 })).rejects.toThrow();
    s.booking.recyclerId = "paperplus"; await expect(s.service.preview("deccan", "2026-10-24")).rejects.toThrow("SOURCE_IDENTITY");
  });
});
describe("authorization and credentials", () => {
  it("requires flag, exact server tenant, header token and same origin for mutations", () => {
    const request = (headers = {}) => new Request("http://127.0.0.1:3200/api/routing", { method: "POST", headers });
    expect(() => authorizeRouting(request())).toThrow("DISABLED"); vi.stubEnv("ROUTING_ENABLED", "true"); vi.stubEnv("ADMIN_TOKEN", "synthetic-admin"); vi.stubEnv("RECYCLER_ID", "deccan");
    expect(() => authorizeRouting(request())).toThrow("UNAUTHORIZED"); expect(() => authorizeRouting(request({ "x-admin-token": "synthetic-admin", origin: "https://evil.invalid" }))).toThrow("ORIGIN");
    expect(authorizeRouting(request({ "x-admin-token": "synthetic-admin", origin: "http://127.0.0.1:3200" })).tenant).toBe("deccan");
  });
  it("withholds MapTiler browser key until restrictions are verified and origin is exact", () => {
    vi.stubEnv("MAPTILER_API_KEY", "unit-only-public-key"); vi.stubEnv("MAPTILER_ALLOWED_ORIGINS", "http://localhost:3200,http://127.0.0.1:3200");
    expect(browserMapConfiguration("http://localhost:3200")).not.toHaveProperty("key"); vi.stubEnv("MAPTILER_ORIGIN_RESTRICTIONS_VERIFIED", "true");
    expect(browserMapConfiguration("http://localhost:3200").enabled).toBe(true); expect(browserMapConfiguration("http://localhost:3201").enabled).toBe(false); expect(browserMapConfiguration("https://anything.vercel.app").enabled).toBe(false);
  });
  it("HeiGIT key stays in server Authorization; directed units and hard budget are preserved", async () => {
    const transport = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ distances: [[0, 10], [20, 0]], durations: [[0, 1], [2, 0]] }))));
    const provider = new HeiGitProvider("unit-only-server-key", true, transport, 1), input = { tenant: "deccan" as const, nodes: syntheticInput(1).matrix.nodes, departureAssumption: "static" };
    const result = await provider.matrix(input); expect(result.edges[1]![0]).toEqual({ state: "ok", metres: 20, seconds: 2 }); expect(transport.mock.calls[0]![0]).not.toContain("unit-only-server-key"); expect(transport.mock.calls[0]![1].headers.Authorization).toBe("unit-only-server-key");
    await expect(provider.matrix({ ...input, departureAssumption: "changed" })).rejects.toThrow("BUDGET");
  });
});
it("geometry failure preserves the independent stop list and never fabricates a road", async () => {
  const s = await setup(); s.provider.geometry = async () => { throw Error("provider unavailable"); };
  const result = await s.service.generate("deccan", "2026-10-24", randomUUID());
  expect(result.geometry).toBeUndefined(); expect(result.geometryError).toContain("UNAVAILABLE"); expect(result.independentValidation.valid).toBe(true); expect(result.optimization.solution.served).toBe(1);
});
it("material geometry/matrix differences are preserved for disclosure", async () => {
  const s = await setup(); s.provider.geometry = async () => ({ provider: "synthetic-test", geometry: { type: "LineString", coordinates: [[0, 0], [0.001, 0]] }, metres: 9000, seconds: 900, attribution: "SYNTHETIC ONLY" });
  const result = await s.service.generate("deccan", "2026-10-24", randomUUID()); expect(result.geometry?.[0]?.matrixMismatch).toBe(true); expect(result.optimization.solution.metres).toBe(300);
});
it("independent evidence bridge refuses stale, uncertain, mismatched or self-asserted verification", () => {
  const b = syntheticBooking(), record = { request: { id: "synthetic-household", state: "APPROVED" }, plan: { legs: [{ id: "leg", recyclerId: "deccan", bookingReference: b.bookingReference, state: "REQUEST_CONFIRMED" }] }, household: { customer: { addressLine: b.addressLine, locality: b.locality, pincode: b.pincode }, verifications: { leg: { verified: true, independent: true, isUncertain: false, bookingReference: b.bookingReference, observedItems: b.items, observedFeeText: "INR 180", checkedAt: "2026-10-23T00:01:00.000Z" } } } };
  expect(verificationFromHousehold("deccan", b, [record])?.bookingFingerprint).toBe(bookingFingerprint(b));
  const rejected = structuredClone(record); rejected.request.state = "REJECTED"; expect(verificationFromHousehold("deccan", b, [rejected])).toBeNull();
  record.household.verifications.leg.independent = false; expect(verificationFromHousehold("deccan", b, [record])).toBeNull(); record.household.verifications.leg.independent = true;
  b.updatedAt = "2026-10-23T00:02:00.000Z"; expect(verificationFromHousehold("deccan", b, [record])).toBeNull();
});
it("records actual bounded synthetic benchmark measurements", async () => {
  const rows = [1, 4, 7, 20, 50].map(size => { const input = syntheticInput(size, size > 7 ? 4 : 1), start = performance.now(), heapBefore = process.memoryUsage().heapUsed, result = optimize(input); return { size, elapsedMs: performance.now() - start, heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore, evaluations: result.evaluations, limit: result.evaluationLimit, served: result.solution.served, metres: result.solution.metres, status: result.status, fingerprint: fingerprint(input) }; });
  const directory = process.env.ROUTING_BENCHMARK_DIR;
  if (directory) await fs.writeFile(path.join(directory, "benchmark-" + Date.now() + ".json"), JSON.stringify(rows, null, 2), { flag: "wx" });
  expect(rows.every(r => r.evaluations <= r.limit)).toBe(true);
});

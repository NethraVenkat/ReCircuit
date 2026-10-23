import { afterEach, expect, it, vi } from "vitest";
import { syntheticBooking, syntheticInput, syntheticPreparation } from "./fixtures";
import { bookingToPickup, validateInput } from "./contracts";
import { optimize } from "./optimizer";
import { validateProposal, compare } from "./validator";
import { PrivateRoadProvider } from "./providers";
import { HeiGitProvider } from "./heigit.server";
import { confirmedSlotWindow } from "./windows";
import { GET, POST } from "../../app/api/routing/route";
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it("ambiguity and unknown capacity/service duration are explicit blockers", () => {
  const b = syntheticBooking(), prep = syntheticPreparation(b);
  expect(bookingToPickup(b, { ...prep, geocode: { ...prep.geocode, state: "ambiguous", coordinate: null } }).eligible).toBe(false);
  expect(bookingToPickup(b, { ...prep, serviceSeconds: null }).eligible).toBe(false);
  const input = syntheticInput(); input.vehicles[0]!.capacityKg = NaN; expect(() => validateInput(input)).toThrow();
});
it("multi-vehicle capacity, initial load, materials and unreachable return depots constrain feasibility", () => {
  const input = syntheticInput(4, 2); input.vehicles.forEach(v => { v.capacityKg = 1; });
  const result = optimize(input); expect(result.solution.served).toBe(4); expect(result.solution.routes.length).toBe(2); expect(validateProposal(input, result.solution).valid).toBe(true);
  input.vehicles.forEach(v => { v.initialLoadKg = 1; }); expect(optimize(input).solution.served).toBe(0);
  input.vehicles.forEach(v => { v.initialLoadKg = 0; v.materials = ["paper"]; }); expect(optimize(input).solution.served).toBe(0);
  const single = syntheticInput(1); single.matrix.edges[1]![0] = { state: "unreachable" }; expect(optimize(single).solution.served).toBe(0);
});
it("hard windows bind completion; requested preferences do not become confirmation, including overnight", () => {
  expect(confirmedSlotWindow("2026-10-24 (23:30–00:30 IST)", "2026-10-24")).toEqual({ start: 84600, end: 88200 });
  expect(confirmedSlotWindow("tomorrow morning", "2026-10-24")).toBeNull(); expect(confirmedSlotWindow("2026-02-30 (10:00–12:00 IST)", "2026-10-24")).toBeNull();
  const input = syntheticInput(1); input.vehicles[0]!.operatingWindow = { start: 85000, end: 90000 }; input.pickups[0]!.confirmedWindow = { start: 86000, end: 87000 };
  expect(optimize(input).solution.served).toBe(1); input.pickups[0]!.confirmedWindow.end = 86001; expect(optimize(input).solution.served).toBe(0);
  input.pickups[0]!.confirmedWindow = null; input.pickups[0]!.requestedWindow = "unavailable preferred time"; expect(optimize(input).solution.served).toBe(1);
});
it("provider matrix batching counts all elements and preserves ordered identifiers", async () => {
  const request = { tenant: "deccan" as const, nodes: syntheticInput(17).matrix.nodes, departureAssumption: "static" };
  const transport = vi.fn().mockImplementation((url: string) => { const q = new URL(url).searchParams, sources = q.get("sources")!.split(";"), destinations = q.get("destinations")!.split(";"); return Promise.resolve(new Response(JSON.stringify({ code: "Ok", distances: sources.map(() => destinations.map(() => 1)), durations: sources.map(() => destinations.map(() => 2)) }))); });
  const provider = new PrivateRoadProvider({ origin: "https://private.example", allowedOrigins: ["https://private.example"], enabled: true, profile: "driving", ttlSeconds: 1 }, transport);
  const matrix = await provider.matrix(request); expect(matrix.nodes).toEqual(request.nodes); expect(transport).toHaveBeenCalledTimes(4); expect(provider.accounting.elementsRequested).toBe(18 * 18);
  await provider.matrix({ ...request, departureAssumption: "new departure" }); expect(transport).toHaveBeenCalledTimes(8);
});
it("timeout and 429 fail without a successful matrix or uncontrolled retry", async () => {
  const provider = new HeiGitProvider("unit-only", true, vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")), 1);
  await expect(provider.matrix({ tenant: "deccan", nodes: syntheticInput(1).matrix.nodes, departureAssumption: "static" })).rejects.toThrow("timeout"); expect(provider.accounting.httpAttempts).toBe(1);
  const limited = new HeiGitProvider("unit-only", true, vi.fn().mockResolvedValue(new Response("", { status: 429 })), 1);
  await expect(limited.matrix({ tenant: "deccan", nodes: syntheticInput(1).matrix.nodes, departureAssumption: "static" })).rejects.toThrow("RATE_LIMITED"); expect(limited.accounting.httpAttempts).toBe(1);
});
it("failed or partial matrix never becomes a valid zero edge", async () => {
  const provider = new HeiGitProvider("unit-only", true, vi.fn().mockResolvedValue(new Response(JSON.stringify({ distances: [[0]], durations: [[0]] }))), 1);
  await expect(provider.matrix({ tenant: "deccan", nodes: syntheticInput(1).matrix.nodes, departureAssumption: "static" })).rejects.toThrow("PARTIAL");
});
it("negative planned improvement stays negative and equal scope is required", () => {
  const result = optimize(syntheticInput(1)); const longer = structuredClone(result.solution); longer.metres *= 2;
  expect(compare(longer, result.solution).reductionPercent).toBe(-100); expect(compare(longer, { ...result.solution, routes: [] }).comparable).toBe(false);
});
it("feature flag and missing authentication fail server-side before source access", async () => {
  vi.stubEnv("ROUTING_ENABLED", "false"); expect((await GET(new Request("http://127.0.0.1:3200/api/routing?date=2026-10-24"))).status).toBe(503);
  vi.stubEnv("ROUTING_ENABLED", "true"); vi.stubEnv("ADMIN_TOKEN", "unit-only-admin"); vi.stubEnv("RECYCLER_ID", "deccan");
  expect((await GET(new Request("http://127.0.0.1:3200/api/routing?date=2026-10-24"))).status).toBe(401);
  expect((await POST(new Request("http://127.0.0.1:3200/api/routing", { method: "POST", headers: { "x-admin-token": "unit-only-admin", origin: "https://bad.invalid" }, body: "{}" }))).status).toBe(403);
});
it("rejects oversized streamed bodies before parsing or accessing storage", async () => {
  vi.stubEnv("ROUTING_ENABLED", "true"); vi.stubEnv("ADMIN_TOKEN", "unit-only-admin"); vi.stubEnv("RECYCLER_ID", "deccan");
  const response = await POST(new Request("http://127.0.0.1:3200/api/routing", { method: "POST", headers: { "x-admin-token": "unit-only-admin", origin: "http://127.0.0.1:3200", "content-type": "application/json" }, body: new Uint8Array(70000) }));
  expect(response.status).toBe(400); expect((await response.json()).error).toBe("PAYLOAD_LIMIT");
});

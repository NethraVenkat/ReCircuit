import { describe, expect, it, vi } from "vitest";
import { bookingToPickup, Coordinate, Matrix, ServiceDate, validateInput } from "./contracts";
import { optimize } from "./optimizer";
import { compare, validateProposal } from "./validator";
import { PrivateRoadProvider, SyntheticGeocoder, SyntheticMatrixProvider } from "./providers";
import { syntheticBooking, syntheticInput, syntheticPreparation } from "./fixtures";

describe("booking conversion boundary", () => {
  it("is stable, pure, total-row kilograms and preserves preference", () => {
    const b = syntheticBooking(), p = syntheticPreparation(b), before = JSON.stringify(b);
    const a = bookingToPickup(b, p); expect(a).toEqual(bookingToPickup(b, p)); expect(JSON.stringify(b)).toBe(before);
    expect(a.eligible && a.pickup.loadKg).toBe(0.5); expect(a.eligible && a.pickup.requestedWindow).toBe(b.preferredSlot);
  });
  it.each(["CANCELLED", "PICKED_UP", "WEIGHED"])("excludes lifecycle %s", status => { const b = syntheticBooking(); b.status = status as typeof b.status; expect(bookingToPickup(b, syntheticPreparation(b)).eligible).toBe(false); });
  it.each(["verification", "geocode", "serviceSeconds"])("missing %s is not zero or readiness", field => { const b = syntheticBooking(), p = syntheticPreparation(b); expect(bookingToPickup(b, { ...p, [field]: null }).eligible).toBe(false); });
  it("rejects mismatched tenant, stale verification and missing weight/category", () => {
    const b = syntheticBooking(), p = syntheticPreparation(b); expect(bookingToPickup(b, { ...p, tenant: "paperplus" }).eligible).toBe(false);
    b.items[0]!.weightKg = undefined; expect(bookingToPickup(b, p).eligible).toBe(false);
    b.items[0]!.weightKg = 0.5; b.items[0]!.category = undefined; expect(bookingToPickup(b, syntheticPreparation(b)).eligible).toBe(false);
  });
  it("calendar, timezone, units and coordinate ranges validate", () => {
    expect(ServiceDate.safeParse("2026-02-30").success).toBe(false); expect(Coordinate.safeParse({ lat: 100, lon: 0 }).success).toBe(false);
    const b = syntheticBooking(); expect(bookingToPickup(b, { ...syntheticPreparation(b), timezone: "UTC" }).eligible).toBe(false);
    b.items[0]!.weightKg = NaN; expect(bookingToPickup(b, syntheticPreparation(b)).eligible).toBe(false);
  });
});
describe("optimizer and independent replay", () => {
  it.each([0, 1, 4, 7, 20, 50])("conserves %i pickups deterministically within bounds", n => {
    const input = syntheticInput(n, n > 7 ? 4 : 1), before = JSON.stringify(input), result = optimize(input);
    expect(validateProposal(input, result.solution)).toEqual({ valid: true, errors: [] });
    expect(result.evaluations).toBeLessThanOrEqual(result.evaluationLimit); expect(optimize(input)).toEqual(result); expect(JSON.stringify(input)).toBe(before);
    expect(result.solution.served + result.solution.unassigned.length).toBe(n);
    expect(result.solution.served).toBeGreaterThanOrEqual(result.baseline.served);
  });
  it("matches a separate exhaustive directed-cycle oracle on four stops", () => {
    const input = syntheticInput(), permutations = (ids: number[]): number[][] => ids.length ? ids.flatMap(id => permutations(ids.filter(n => n !== id)).map(p => [id, ...p])) : [[]];
    const costs = permutations([1, 2, 3, 4]).map(order => [0, ...order, 0].slice(1).reduce((sum, node, i) => { const edge = input.matrix.edges[[0, ...order][i]!]![node]!; return sum + (edge.state === "ok" ? edge.metres : Infinity); }, 0));
    const result = optimize(input); expect(result.solution.metres).toBe(Math.min(...costs)); expect(result.status).toBe("proven-optimum");
  });
  it("rejects deliberately corrupted totals, duplicate stops, capacity and window claims", () => {
    const input = syntheticInput(2), result = optimize(input); const corrupt = structuredClone(result.solution); corrupt.routes[0]!.metres++;
    expect(validateProposal(input, corrupt).valid).toBe(false);
    corrupt.routes[0]!.pickupIds.push(corrupt.routes[0]!.pickupIds[0]!); expect(validateProposal(input, corrupt).valid).toBe(false);
    input.vehicles[0]!.capacityKg = 0.5; expect(validateProposal(input, result.solution).valid).toBe(false);
    input.pickups[0]!.confirmedWindow = { start: 0, end: 1 }; expect(optimize(input).solution.unassigned.length).toBeGreaterThan(0);
  });
  it("recomputes waiting and cumulative pickup loads by hand", () => {
    const input = syntheticInput(1); input.pickups[0]!.confirmedWindow = { start: 36100, end: 36200 };
    const route = optimize(input).solution.routes[0]!; expect(route.stops[0]).toEqual({ pickupId: input.pickups[0]!.id, arrival: 36013, serviceStart: 36100, departure: 36160, loadKg: 0.5 });
    expect(route.waitingSeconds).toBe(87); expect(route.totalSeconds).toBe(177); expect(route.metres).toBe(300);
  });
  it("excludes unreachable/incompatible pickups; ownership cannot be bypassed", () => {
    const input = syntheticInput(1); input.matrix.edges[0]![1] = { state: "unreachable" }; expect(optimize(input).solution.served).toBe(0);
    input.pickups[0]!.tenant = "paperplus"; expect(() => validateInput(input)).toThrow();
  });
  it("does not publish a comparison for different service scope or zero percentage baseline", () => {
    const input = syntheticInput(1), result = optimize(input); expect(compare(result.solution, { routes: [], unassigned: [], served: 0, metres: 0 }).comparable).toBe(false);
    expect(compare({ routes: [], unassigned: [], served: 0, metres: 0 }, { routes: [], unassigned: [], served: 0, metres: 0 }).reductionPercent).toBeNull();
  });
});
describe("provider boundary", () => {
  const request = { tenant: "deccan" as const, nodes: syntheticInput(1).matrix.nodes, departureAssumption: "static" };
  const config = { origin: "https://routing.internal.example", allowedOrigins: ["https://routing.internal.example"], enabled: true, profile: "driving" as const, ttlSeconds: 60 };
  it("synthetic providers cannot resolve arbitrary addresses or invent a matrix", async () => {
    expect((await new SyntheticGeocoder({}).resolve({ tenant: "deccan", address: "private customer", addressFingerprint: "x" })).state).toBe("unavailable");
    await expect(new SyntheticMatrixProvider({}).matrix(request)).rejects.toThrow("NOT_REGISTERED");
  });
  it("disabled and unsafe origins make no call", async () => {
    const transport = vi.fn(); await expect(new PrivateRoadProvider({ ...config, enabled: false }, transport).matrix(request)).rejects.toThrow("DISABLED"); expect(transport).not.toHaveBeenCalled();
    expect(() => new PrivateRoadProvider({ ...config, origin: "https://router.project-osrm.org", allowedOrigins: ["https://router.project-osrm.org"] })).toThrow();
  });
  it("keeps direction, null unreachable, exact mapping, in-flight dedup and cache", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "Ok", distances: [[0, 10], [null, 0]], durations: [[0, 2], [null, 0]] })));
    const provider = new PrivateRoadProvider(config, transport); const [a, b] = await Promise.all([provider.matrix(request), provider.matrix(request)]);
    expect(a).toEqual(b); expect(a.edges[1]![0]).toEqual({ state: "unreachable" }); expect(transport).toHaveBeenCalledTimes(1); await provider.matrix(request); expect(transport).toHaveBeenCalledTimes(1);
    expect(provider.accounting.elementsRequested).toBe(4); expect(String(transport.mock.calls[0]![0])).toContain("0,0;0.001,0");
  });
  it.each([{ code: "Ok", distances: [[0]], durations: [[0]] }, { code: "Ok", distances: [[0, 1], [1, 0]], durations: [[0, 1], [1, 0]], fallback_speed_cells: [[0, 1]] }])("rejects partial or fallback response", async body => {
    await expect(new PrivateRoadProvider(config, vi.fn().mockResolvedValue(new Response(JSON.stringify(body)))).matrix(request)).rejects.toThrow();
  });
  it("rate-limit retry amplification is bounded and long Retry-After is deferred", async () => {
    const transport = vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 429, headers: { "Retry-After": "0" } })));
    await expect(new PrivateRoadProvider(config, transport).matrix(request)).rejects.toThrow("429"); expect(transport).toHaveBeenCalledTimes(2);
    await expect(new PrivateRoadProvider(config, vi.fn().mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "3600" } }))).matrix(request)).rejects.toThrow("DEFERRED");
  });
  it("rejects malformed matrix dimensions and invalid units", () => { const m = syntheticInput().matrix; m.edges[0] = []; expect(Matrix.safeParse(m).success).toBe(false); });
});

import { expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { HeiGitProvider } from "./heigit.server";
import { syntheticBooking, syntheticInput, syntheticPreparation } from "./fixtures";
import { bookingToPickup, type PlanningInput } from "./contracts";
import { optimize, type Calculation } from "./optimizer";
import { compare, validateProposal } from "./validator";
import { SyntheticGeocoder } from "./providers";

const request = { tenant: "deccan" as const, nodes: syntheticInput(1).matrix.nodes, departureAssumption: "audit-static" };
it.each([401, 403, 429, 500, 503])("HeiGIT HTTP %i fails with one attempt and no retry", async status => {
  const transport = vi.fn().mockResolvedValue(new Response("not retained", { status }));
  const provider = new HeiGitProvider("unit-only-key", true, transport);
  await expect(provider.matrix(request)).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(1); expect(provider.accounting.httpAttempts).toBe(1);
});
it.each(["not-json", "{}", '{"distances":[[0,-1],[1,0]],"durations":[[0,1],[1,0]]}', '{"distances":[[0,null],[1,0]],"durations":[[0,1],[1,0]]}'])("rejects malformed/partial provider response %s", async body => {
  const provider = new HeiGitProvider("unit-only-key", true, vi.fn().mockResolvedValue(new Response(body)));
  await expect(provider.matrix(request)).rejects.toThrow();
});
it.each([new Error("network failure"), new DOMException("aborted", "AbortError")])("network/abort failures do not retry", async failure => {
  const transport = vi.fn().mockRejectedValue(failure), provider = new HeiGitProvider("unit-only-key", true, transport);
  await expect(provider.matrix(request)).rejects.toThrow(); expect(transport).toHaveBeenCalledTimes(1);
});
it("preserves lon/lat order, directed indices, in-flight dedup and clone isolation", async () => {
  const transport = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ distances: [[0, 17], [31, 0]], durations: [[0, 3], [7, 0]] })));
  const provider = new HeiGitProvider("unit-only-key", true, transport), input = structuredClone(request);
  input.nodes[0]!.coordinate = { lon: 8.66, lat: 49.41 };
  const [a, b] = await Promise.all([provider.matrix(input), provider.matrix(input)]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(JSON.parse(transport.mock.calls[0]![1].body).locations[0]).toEqual([8.66, 49.41]);
  expect(a.edges[0]![1]).toEqual({ state: "ok", metres: 17, seconds: 3 });
  a.nodes[0]!.id = "corrupted-caller-copy"; expect(b.nodes[0]!.id).toBe(input.nodes[0]!.id);
  expect((await provider.matrix(input)).nodes[0]!.id).toBe(input.nodes[0]!.id);
  expect(provider.accounting.elementsRequested).toBe(4);
});

it.each(["DRAFT", "REJECTED", "DECLINED", "CANCELLED", "PICKED_UP", "WEIGHED"])("excludes unsupported/completed lifecycle %s", status => {
  const b = syntheticBooking(); b.status = status as typeof b.status;
  expect(bookingToPickup(b, syntheticPreparation(b)).eligible).toBe(false);
});
it.each([NaN, Infinity, -1, 0])("rejects invalid total-row weight %s", weight => {
  const b = syntheticBooking(); b.items[0]!.weightKg = weight;
  expect(bookingToPickup(b, syntheticPreparation(b)).eligible).toBe(false);
});
it("an address update invalidates reviewed coordinates and preserves source", () => {
  const b = syntheticBooking(), prep = syntheticPreparation(b); b.addressLine += " changed";
  const result = bookingToPickup(b, { ...prep, verification: syntheticPreparation(b).verification });
  expect(!result.eligible && result.reasons).toContain("COORDINATE_REVIEW_REQUIRED");
});
it("synthetic coordinate matches require review and unknown addresses get no fallback", async () => {
  const provider = new SyntheticGeocoder({ "deccan:PUBLIC SYNTHETIC": { lat: 1, lon: 2 } });
  expect(await provider.resolve({ tenant: "deccan", address: "PUBLIC SYNTHETIC", addressFingerprint: "audit" })).toMatchObject({ state: "review-required", candidates: [{ coordinate: { lat: 1, lon: 2 } }] });
  expect(await provider.resolve({ tenant: "paperplus", address: "PUBLIC SYNTHETIC", addressFingerprint: "audit" })).toMatchObject({ state: "unavailable", candidates: [] });
});

const corruptions: Array<[string, (input: PlanningInput, calculation: Calculation) => void]> = [
  ["duplicate pickup", (_, c) => c.routes[0]!.pickupIds.push(c.routes[0]!.pickupIds[0]!)],
  ["missing pickup", (_, c) => { c.routes = []; c.served = 0; c.metres = 0; }],
  ["wrong tenant", i => { i.pickups[0]!.tenant = "paperplus"; }],
  ["material incompatibility", i => { i.vehicles[0]!.materials = ["paper"]; }],
  ["capacity overflow", i => { i.vehicles[0]!.capacityKg = 0.1; }],
  ["wrong depot", i => { i.vehicles[0]!.end = { id: "unknown-depot", coordinate: { lat: 1, lon: 1 } }; }],
  ["unreachable leg", i => { i.matrix.edges[0]![1] = { state: "unreachable" }; }],
  ["arrival", (_, c) => { c.routes[0]!.stops[0]!.arrival++; }],
  ["service", (_, c) => { c.routes[0]!.stops[0]!.departure++; }],
  ["window", i => { i.pickups[0]!.confirmedWindow = { start: 0, end: 1 }; }],
  ["distance", (_, c) => { c.metres++; }],
  ["duration", (_, c) => { c.routes[0]!.totalSeconds++; }],
];
it.each(corruptions)("independent validator rejects %s", (_, corrupt) => {
  const input = syntheticInput(1), result = optimize(input); corrupt(input, result.solution);
  expect(validateProposal(input, result.solution).valid).toBe(false);
});

it.each([1, 2, 3, 4, 5, 6, 7])("matches independent exhaustive asymmetric oracle for %i stops", size => {
  const input = syntheticInput(size);
  input.matrix.edges = input.matrix.nodes.map((_, i) => input.matrix.nodes.map((__, j) => ({ state: "ok", metres: i === j ? 0 : ((i * 17 + j * 31 + i * j * 7) % 89) + 1, seconds: i === j ? 0 : 1 })));
  let best = Infinity;
  // Deliberately independent enumerator: no production evaluator/scheduler calls.
  const visit = (remaining: number[], previous: number, distance: number) => {
    if (!remaining.length) { const edge = input.matrix.edges[previous]![0]!; if (edge.state === "ok") best = Math.min(best, distance + edge.metres); return; }
    for (const next of remaining) { const edge = input.matrix.edges[previous]![next]!; if (edge.state === "ok") visit(remaining.filter(n => n !== next), next, distance + edge.metres); }
  };
  visit(Array.from({ length: size }, (_, i) => i + 1), 0, 0);
  const result = optimize(input); expect(result.solution.metres).toBe(best); expect(result.status).toBe("proven-optimum");
  expect(validateProposal(input, result.solution).valid).toBe(true);
});
it("compares equal/zero/negative and changed service scopes without fabricated savings", () => {
  const result = optimize(syntheticInput(1));
  expect(compare(result.solution, result.solution).reductionPercent).toBe(0);
  expect(compare({ ...result.solution, metres: 600 }, result.solution).reductionPercent).toBe(-100);
  expect(compare(result.solution, { routes: [], unassigned: [], metres: 0, served: 0 }).comparable).toBe(false);
  expect(compare({ routes: [], unassigned: [], metres: 0, served: 0 }, { routes: [], unassigned: [], metres: 0, served: 0 }).reductionPercent).toBeNull();
});

it("does not count budget-blocked requests as provider usage", async () => {
  const provider = new HeiGitProvider("unit-only-key", true, vi.fn().mockImplementation(async () => new Response(JSON.stringify({ distances: [[0, 1], [1, 0]], durations: [[0, 1], [1, 0]] }))), 1);
  await provider.matrix(request);
  await expect(provider.matrix({ ...request, departureAssumption: "changed" })).rejects.toThrow("BUDGET");
  await expect(provider.geometry(request.nodes.map(n => n.coordinate))).rejects.toThrow("BUDGET");
  expect(provider.accounting.httpAttempts).toBe(1);
  expect(provider.accounting.elementsRequested).toBe(4);
  expect(provider.accounting.geometryRequests).toBe(0);
});

it("gives a specific exclusion for unsupported material combinations", () => {
  const input = syntheticInput(1); input.vehicles[0]!.materials = ["newspaper"];
  expect(optimize(input).solution.unassigned[0]!.reason).toBe("NO_COMPATIBLE_VEHICLE_MATERIAL");
});

it("measures offline conversion, optimization and independent replay at supported sizes", async () => {
  const transport = vi.spyOn(globalThis, "fetch");
  try {
    const rows = [0, 1, 4, 7, 20, 50].map(size => {
      const input = syntheticInput(size, size > 7 ? 4 : 1), start = performance.now();
      const conversions = input.pickups.map(p => { const booking = syntheticBooking(p.id); return bookingToPickup(booking, syntheticPreparation(booking)); });
      const converted = performance.now(), result = optimize(input), optimized = performance.now(), replay = validateProposal(input, result.solution), validated = performance.now();
      expect(conversions.every(c => c.eligible)).toBe(true); expect(replay.valid).toBe(true);
      return { stops: size, vehicles: input.vehicles.length, conversionMs: converted - start, optimizationMs: optimized - converted, independentReplayMs: validated - optimized, served: result.solution.served, unassigned: result.solution.unassigned.length, metres: result.solution.metres, evaluations: result.evaluations, status: result.status, feasible: replay.valid, httpRequests: 0, matrixElementsRequested: 0 };
    });
    expect(transport).not.toHaveBeenCalled();
    if (process.env.ROUTING_BENCHMARK_DIR) await fs.writeFile(path.join(process.env.ROUTING_BENCHMARK_DIR, "audit-performance-" + Date.now() + ".json"), JSON.stringify({ at: new Date().toISOString(), rows }, null, 2), { flag: "wx" });
  } finally { transport.mockRestore(); }
});

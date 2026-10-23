import { RouteCalculation, validateInput, type PlanningInput } from "./contracts";
import type { Calculation } from "./optimizer";

/** Independent replay: intentionally does not import optimizer scheduling/evaluation code. */
export function validateProposal(raw: PlanningInput, proposal: Calculation): { valid: boolean; errors: string[] } {
  const errors: string[] = []; let input: PlanningInput;
  const shape = RouteCalculation.safeParse(proposal); if (!shape.success) return { valid: false, errors: ["INVALID_PROPOSAL_SHAPE"] };
  try { input = validateInput(raw); } catch { return { valid: false, errors: ["INVALID_INPUT"] }; }
  const seen = new Set<string>(), usedVehicles = new Set<string>(); let totalMetres = 0, served = 0;
  const near = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) < 0.000001;
  for (const route of proposal.routes) {
    const v = input.vehicles.find(v => v.id === route.vehicleId);
    if (!v || usedVehicles.has(route.vehicleId)) { errors.push("VEHICLE_INVALID_OR_DUPLICATED"); continue; }
    usedVehicles.add(v.id);
    let time = v.operatingWindow.start, load = v.initialLoadKg, prev = v.start.id, distance = 0, travel = 0, service = 0, waiting = 0;
    if (route.stops.length !== route.pickupIds.length || !route.pickupIds.length) errors.push("STOP_COUNT");
    for (const [i, id] of [...route.pickupIds, v.end.id].entries()) {
      const row = input.matrix.nodes.findIndex(n => n.id === prev), col = input.matrix.nodes.findIndex(n => n.id === id), edge = input.matrix.edges[row]?.[col];
      if (!edge || edge.state !== "ok") { errors.push("INVALID_EDGE"); break; }
      time += edge.seconds; travel += edge.seconds; distance += edge.metres;
      if (i < route.pickupIds.length) {
        const p = input.pickups.find(p => p.id === id);
        if (!p || seen.has(id)) { errors.push("PICKUP_UNKNOWN_OR_DUPLICATED"); break; }
        seen.add(id); served++;
        if (p.materials.some(m => !v.materials.includes(m))) errors.push("INCOMPATIBLE_MATERIAL");
        const arrival = time, start = Math.max(time, p.confirmedWindow?.start ?? time);
        waiting += start - time; service += p.serviceSeconds; time = start + p.serviceSeconds; load += p.loadKg;
        if (load > v.capacityKg) errors.push("CAPACITY");
        if (p.confirmedWindow && time > p.confirmedWindow.end) errors.push("CONFIRMED_WINDOW");
        const reported = route.stops[i];
        if (!reported || reported.pickupId !== id || !near(reported.arrival, arrival) || !near(reported.serviceStart, start) || !near(reported.departure, time) || !near(reported.loadKg, load)) errors.push("STOP_SCHEDULE_OR_LOAD");
      }
      prev = id;
    }
    if (time > v.operatingWindow.end) errors.push("OPERATING_HOURS");
    for (const [reported, actual] of [[route.metres, distance], [route.travelSeconds, travel], [route.serviceSeconds, service], [route.waitingSeconds, waiting], [route.totalSeconds, time - v.operatingWindow.start], [route.endTime, time]]) if (!near(reported!, actual!)) errors.push("ROUTE_TOTAL");
    totalMetres += distance;
  }
  for (const exclusion of proposal.unassigned) { if (!exclusion.reason || !input.pickups.some(p => p.id === exclusion.pickupId) || seen.has(exclusion.pickupId)) errors.push("INVALID_UNASSIGNED"); seen.add(exclusion.pickupId); }
  if (seen.size !== input.pickups.length || input.pickups.some(p => !seen.has(p.id))) errors.push("PICKUP_CONSERVATION");
  if (!near(proposal.metres, totalMetres) || proposal.served !== served) errors.push("PROPOSAL_TOTAL");
  return { valid: errors.length === 0, errors };
}

export function compare(proposal: Calculation, baseline: Calculation): { comparable: boolean; deltaMetres: number | null; reductionPercent: number | null; reason: string } {
  const scope = (c: Calculation) => c.routes.flatMap(r => r.pickupIds).sort().join("|");
  if (scope(proposal) !== scope(baseline)) return { comparable: false, deltaMetres: null, reductionPercent: null, reason: "Different served pickup scope; no headline reduction" };
  const delta = baseline.metres - proposal.metres;
  return { comparable: true, deltaMetres: delta, reductionPercent: baseline.metres === 0 ? null : delta / baseline.metres * 100, reason: baseline.metres === 0 ? "Zero baseline; percentage undefined" : "Planned distance comparison, not distance driven" };
}

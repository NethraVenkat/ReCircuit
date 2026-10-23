import { fingerprint, validateInput, type PlanningInput, type RoutingVehicle, type RoutingPickup } from "./contracts";

export interface Stop { pickupId: string; arrival: number; serviceStart: number; departure: number; loadKg: number }
export interface ProposedRoute { vehicleId: string; pickupIds: string[]; stops: Stop[]; metres: number; travelSeconds: number; serviceSeconds: number; waitingSeconds: number; totalSeconds: number; endTime: number }
export interface Calculation { routes: ProposedRoute[]; unassigned: Array<{ pickupId: string; reason: string }>; metres: number; served: number }
export interface Optimization { inputFingerprint: string; algorithm: string; status: "proven-optimum" | "heuristic-feasible" | "no-feasible-solution-found"; solution: Calculation; baseline: Calculation; evaluations: number; evaluationLimit: number; objective: string }

function evaluate(input: PlanningInput, vehicle: RoutingVehicle, ids: string[]): ProposedRoute | null {
  const index = new Map(input.matrix.nodes.map((n, i) => [n.id, i]));
  let from = vehicle.start.id, clock = vehicle.operatingWindow.start, load = vehicle.initialLoadKg, metres = 0, travel = 0, service = 0, waiting = 0;
  const stops: Stop[] = [];
  for (const id of [...ids, vehicle.end.id]) {
    const edge = input.matrix.edges[index.get(from)!]?.[index.get(id)!];
    if (!edge || edge.state !== "ok") return null;
    clock += edge.seconds; metres += edge.metres; travel += edge.seconds;
    if (stops.length < ids.length) {
      const pickup = input.pickups.find(p => p.id === id)!;
      if (!pickup || pickup.materials.some(m => !vehicle.materials.includes(m)) || load + pickup.loadKg > vehicle.capacityKg) return null;
      const arrival = clock, start = Math.max(clock, pickup.confirmedWindow?.start ?? clock);
      // Binding windows constrain completion of service, not the requested preference.
      clock = start + pickup.serviceSeconds;
      if (pickup.confirmedWindow && clock > pickup.confirmedWindow.end) return null;
      waiting += start - arrival; service += pickup.serviceSeconds; load += pickup.loadKg;
      stops.push({ pickupId: id, arrival, serviceStart: start, departure: clock, loadKg: load });
    }
    from = id;
  }
  if (clock > vehicle.operatingWindow.end) return null;
  return { vehicleId: vehicle.id, pickupIds: ids, stops, metres, travelSeconds: travel, serviceSeconds: service, waitingSeconds: waiting, totalSeconds: clock - vehicle.operatingWindow.start, endTime: clock };
}
function calculation(input: PlanningInput, orders: string[][]): Calculation | null {
  const routes: ProposedRoute[] = [];
  for (const [i, order] of orders.entries()) { if (!order.length) continue; const route = evaluate(input, input.vehicles[i]!, order); if (!route) return null; routes.push(route); }
  const served = routes.flatMap(r => r.pickupIds);
  return { routes, served: served.length, metres: routes.reduce((n, r) => n + r.metres, 0), unassigned: input.pickups.filter(p => !served.includes(p.id)).map(p => {
    const compatible = input.vehicles.filter(v => p.materials.every(m => v.materials.includes(m)));
    const reason = !input.vehicles.length ? "NO_PLANNING_VEHICLES" : !compatible.length ? "NO_COMPATIBLE_VEHICLE_MATERIAL" : compatible.every(v => p.loadKg + v.initialLoadKg > v.capacityKg) ? "PICKUP_LOAD_EXCEEDS_AVAILABLE_CAPACITY" : "NO_FEASIBLE_INSERTION_WITHIN_SEARCH_LIMIT";
    return { pickupId: p.id, reason };
  }) };
}
function better(a: Calculation, b: Calculation): boolean { return a.served > b.served || a.served === b.served && a.metres < b.metres; }
function insertion(input: PlanningInput, pickups: RoutingPickup[], cheapest: boolean, count: () => boolean): Calculation {
  const orders: string[][] = input.vehicles.map(() => []);
  for (const pickup of pickups) {
    let chosen: { vehicle: number; order: string[]; cost: number } | null = null;
    for (const [i, vehicle] of input.vehicles.entries()) {
      const order = orders[i]!;
      for (let position = cheapest ? 0 : order.length; position <= order.length; position++) {
        if (!count()) break;
        const candidate = [...order.slice(0, position), pickup.id, ...order.slice(position)], route = evaluate(input, vehicle, candidate);
        if (route && (!chosen || route.metres - (evaluate(input, vehicle, order)?.metres ?? 0) < chosen.cost)) chosen = { vehicle: i, order: candidate, cost: route.metres - (evaluate(input, vehicle, order)?.metres ?? 0) };
        if (chosen && !cheapest) break;
      }
      if (chosen && !cheapest) break;
    }
    if (chosen) orders[chosen.vehicle] = chosen.order;
  }
  return calculation(input, orders)!;
}
/** No network/storage/clock effects. Maximum 50 pickups, 8 vehicles, bounded evaluations. */
export function optimize(raw: PlanningInput): Optimization {
  const input = validateInput(raw), limit = 20000; let evaluations = 0;
  const count = () => { if (evaluations >= limit) return false; evaluations++; return true; };
  const sorted = [...input.pickups].sort((a, b) => a.id.localeCompare(b.id));
  const baseline = insertion(input, sorted, false, count);
  let solution = baseline, exact = false;
  for (const order of [sorted, [...sorted].reverse(), [...sorted].sort((a, b) => (a.confirmedWindow?.end ?? Infinity) - (b.confirmedWindow?.end ?? Infinity) || a.id.localeCompare(b.id))]) {
    const candidate = insertion(input, order, true, count); if (better(candidate, solution)) solution = candidate;
  }
  if (input.vehicles.length === 1 && sorted.length <= 7) {
    let exhausted = true;
    const visit = (prefix: string[], remaining: string[]) => {
      if (!remaining.length) { if (!count()) { exhausted = false; return; } const c = calculation(input, [prefix]); if (c && better(c, solution)) solution = c; return; }
      for (const id of remaining) visit([...prefix, id], remaining.filter(n => n !== id));
    };
    visit([], sorted.map(p => p.id)); exact = exhausted && solution.served === sorted.length;
  }
  return { inputFingerprint: fingerprint(input), algorithm: "deterministic-insertion-exact7-v1", status: exact ? "proven-optimum" : solution.served ? "heuristic-feasible" : "no-feasible-solution-found", solution, baseline, evaluations, evaluationLimit: limit, objective: "Maximize served pickups, then minimize directed metres. Stable ID tie breaking. No unserved-scope savings claim." };
}

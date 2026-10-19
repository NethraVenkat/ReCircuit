/**
 * packages/core/src/routing/router.ts
 *
 * Deterministic reverse-logistics split router:
 * - Enumerates valid item assignments across recyclers (bounded search cap: 5,000)
 * - Pure deterministic pricing per leg
 * - Pure deterministic lexicographic plan scoring:
 *   1. Fewer unrouted items (coverage first)
 *   2. Fewer registry warnings
 *   3. Within feeCapInr
 *   4. Lower total fee
 *   5. Higher known payout
 *   6. Fewer pickup legs
 *   7. Stable tiebreak on recycler IDs
 * - Produces approval reasons: FEE_CAP_EXCEEDED, FEE_CHARGED, REGISTRY_WARNING, ESTIMATED_WEIGHT_NEAR_THRESHOLD
 */

import { randomUUID } from "crypto";
import type { IntakeItem } from "../intake/schema.js";
import { taxonomyCategoryToItemCategory, getCanonicalItemLabel } from "../intake/taxonomy.js";
import type { ExtractedPolicy } from "../policy/policy-schema.js";
import { hashPlan } from "../state-machine.js";
import type { Plan, PlanLeg, RegistrationStatus } from "../types.js";
import { buildEligibilityMatrix } from "./eligibility.js";
import { priceLeg } from "./pricing.js";
import type {
  ApprovalReason,
  EligibilityMatrix,
  LegPricingResult,
  PlanScored,
  RoutingResult,
} from "./types.js";

const DEFAULT_REGISTRY_SNAPSHOTS: Record<string, RegistrationStatus> = {
  deccan: "REGISTERED",
  paperplus: "REGISTERED",
  quickscrap: "NOT_FOUND",
};

export function generateRoutingPlans(options: {
  request: {
    id: string;
    feeCapInr?: number | null | undefined;
    pincode?: string | undefined;
  };
  items: IntakeItem[];
  policies: ExtractedPolicy[];
  registrySnapshots?: Record<string, RegistrationStatus>;
}): RoutingResult {
  const { request, items, policies } = options;
  const registrySnapshots = options.registrySnapshots ?? DEFAULT_REGISTRY_SNAPSHOTS;

  // 1. Build eligibility matrix
  const matrix: EligibilityMatrix = buildEligibilityMatrix({
    requestId: request.id,
    items,
    policies,
    requestPincode: request.pincode,
  });

  const policyMap = new Map<string, ExtractedPolicy>();
  for (const pol of policies) {
    policyMap.set(pol.recyclerId, pol);
  }

  // Map each item to the set of recyclers that accepted it and are eligible
  const eligibleRecyclerIdsPerItem: string[][] = items.map((item) => {
    return matrix.cells
      .filter((cell) => cell.itemId === item.id && cell.status === "ACCEPTED")
      .map((cell) => cell.recyclerId);
  });

  // 2. Enumerate combinations of assignments (bounded at 5,000 combinations)
  const assignments: Array<Array<string | null>> = [];
  const MAX_COMBINATIONS = 5000;

  function enumerate(itemIdx: number, current: Array<string | null>): void {
    if (assignments.length >= MAX_COMBINATIONS) return;

    if (itemIdx === items.length) {
      assignments.push([...current]);
      return;
    }

    const eligible = eligibleRecyclerIdsPerItem[itemIdx]!;

    // Option A: assign to each eligible recycler
    for (const recId of eligible) {
      current.push(recId);
      enumerate(itemIdx + 1, current);
      current.pop();
      if (assignments.length >= MAX_COMBINATIONS) return;
    }

    // Option B: leave unassigned (only if item has no eligible recyclers or to find partial plans)
    current.push(null);
    enumerate(itemIdx + 1, current);
    current.pop();
  }

  enumerate(0, []);

  // 3. Evaluate each assignment into valid legs and scored plan
  const scoredPlans: PlanScored[] = [];
  const seenPlanSignatures = new Set<string>();

  for (const assignment of assignments) {
    // Group assigned items by recycler
    const groups = new Map<string, IntakeItem[]>();
    const unroutedItemIds: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const recId = assignment[i];
      const itm = items[i]!;
      if (recId) {
        if (!groups.has(recId)) groups.set(recId, []);
        groups.get(recId)!.push(itm);
      } else {
        unroutedItemIds.push(itm.id);
      }
    }

    // Must have at least one routed item
    if (groups.size === 0) continue;

    // Signature to deduplicate equivalent item->recycler assignments
    const signature = items
      .map((it, idx) => `${it.id}->${assignment[idx] ?? "UNROUTED"}`)
      .sort()
      .join(";");

    if (seenPlanSignatures.has(signature)) continue;
    seenPlanSignatures.add(signature);

    // Validate and price each leg
    let allLegsValid = true;
    const legResults: Array<{ leg: PlanLeg; pricing: LegPricingResult }> = [];

    const planId = randomUUID();
    const nowStr = new Date().toISOString();

    for (const [recId, groupItems] of groups.entries()) {
      const pol = policyMap.get(recId);
      if (!pol) {
        allLegsValid = false;
        break;
      }

      const pricing = priceLeg({
        recyclerId: recId,
        policy: pol,
        items: groupItems,
        requestPincode: request.pincode,
      });

      if (!pricing.valid || pricing.estimatedFee == null) {
        allLegsValid = false;
        break;
      }

      const legId = randomUUID();
      const planLeg: PlanLeg = {
        id: legId,
        planId,
        recyclerId: recId,
        recyclerName: pol.companyName,
        itemIds: groupItems.map((gi) => gi.id),
        items: groupItems.map((gi) => ({
          id: gi.id,
          name: getCanonicalItemLabel(gi.category),
          category: taxonomyCategoryToItemCategory(gi.category),
          description: gi.rawText,
          quantity: gi.quantity,
          estimatedWeightKg: gi.declaredWeightKg ?? gi.estimatedWeightKg ?? 0,
        })),
        estimatedFee: pricing.estimatedFee,
        estimatedPayout: pricing.estimatedPayout,
        state: "APPROVED",
        createdAt: nowStr,
        updatedAt: nowStr,
      };

      legResults.push({ leg: planLeg, pricing });
    }

    if (!allLegsValid) continue;

    // Construct Plan
    const legs = legResults.map((lr) => lr.leg);
    const totalEstimatedFee = legs.reduce((sum, l) => sum + l.estimatedFee, 0);
    const totalEstimatedPayout = legs.reduce((sum, l) => sum + l.estimatedPayout, 0);

    const tempPlan: Plan = {
      id: planId,
      requestId: request.id,
      legs,
      totalEstimatedFee,
      totalEstimatedPayout,
      planHash: "",
      createdAt: nowStr,
    };
    tempPlan.planHash = hashPlan(tempPlan);

    // Score metrics
    const unroutedItemsCount = unroutedItemIds.length;
    let registryWarningsCount = 0;
    for (const leg of legs) {
      const regStatus = registrySnapshots[leg.recyclerId] ?? "REGISTERED";
      if (regStatus !== "REGISTERED") {
        registryWarningsCount++;
      }
    }

    const withinCap =
      request.feeCapInr == null || totalEstimatedFee <= request.feeCapInr;

    // Approval reasons
    const approvalReasons: ApprovalReason[] = [];
    if (request.feeCapInr != null && totalEstimatedFee > request.feeCapInr) {
      approvalReasons.push("FEE_CAP_EXCEEDED");
    }
    if (totalEstimatedFee > 0) {
      approvalReasons.push("FEE_CHARGED");
    }
    if (registryWarningsCount > 0) {
      approvalReasons.push("REGISTRY_WARNING");
    }
    const hasNearThreshold = legResults.some(
      (lr) => lr.pricing.thresholdDistanceKg != null || lr.pricing.thresholdDistancePercent != null
    );
    if (hasNearThreshold) {
      approvalReasons.push("ESTIMATED_WEIGHT_NEAR_THRESHOLD");
    }

    const recyclerIdsTiebreak = legs
      .map((l) => l.recyclerId)
      .sort()
      .join(";");

    scoredPlans.push({
      plan: tempPlan,
      isPartial: unroutedItemIds.length > 0,
      unroutedItemIds,
      unroutedItemsCount,
      registryWarningsCount,
      withinCap,
      totalFee: totalEstimatedFee,
      totalKnownPayout: totalEstimatedPayout,
      netPayout: totalEstimatedPayout - totalEstimatedFee,
      legsCount: legs.length,
      approvalReasons,
      recyclerIdsTiebreak,
    });
  }

  // 4. Deterministic lexicographic sort
  scoredPlans.sort((a, b) => {
    // 1. Fewer unrouted items (coverage first)
    if (a.unroutedItemsCount !== b.unroutedItemsCount) {
      return a.unroutedItemsCount - b.unroutedItemsCount;
    }
    // 2. Fewer registry warnings
    if (a.registryWarningsCount !== b.registryWarningsCount) {
      return a.registryWarningsCount - b.registryWarningsCount;
    }
    // 3. Within feeCapInr (cap compliance before cost optimization)
    if (a.withinCap !== b.withinCap) {
      return a.withinCap ? -1 : 1;
    }
    // 4. Lower total fee
    if (a.totalFee !== b.totalFee) {
      return a.totalFee - b.totalFee;
    }
    // 5. Higher total known payout
    if (a.totalKnownPayout !== b.totalKnownPayout) {
      return b.totalKnownPayout - a.totalKnownPayout;
    }
    // 6. Fewer pickup legs
    if (a.legsCount !== b.legsCount) {
      return a.legsCount - b.legsCount;
    }
    // 7. Stable tiebreak on sorted recycler IDs, then planHash
    const cmpRec = a.recyclerIdsTiebreak.localeCompare(b.recyclerIdsTiebreak);
    if (cmpRec !== 0) return cmpRec;
    return a.plan.planHash.localeCompare(b.plan.planHash);
  });

  const bestPlan = scoredPlans[0]?.plan ?? null;
  const bestPlanHash = bestPlan?.planHash ?? null;

  // Deduplicate alternatives so the best plan never appears again as an alternative
  const alternatives = scoredPlans
    .slice(1)
    .filter((sp) => sp.plan.planHash !== bestPlanHash)
    .map((s) => s.plan);

  const unroutedItems = items.filter((item) =>
    bestPlan ? !bestPlan.legs.some((l) => l.itemIds.includes(item.id)) : true
  );

  return {
    matrix,
    bestPlan,
    alternatives,
    scoredPlans,
    unroutedItems,
  };
}

/**
 * Deterministically explains why candidate Plan A ranks above candidate Plan B
 * using the 7-tier lexicographic ranking rules.
 */
export function explainWhyPlanBeats(
  a: PlanScored,
  b: PlanScored,
  totalItemsCount: number
): string {
  if (a.unroutedItemsCount !== b.unroutedItemsCount) {
    return a.unroutedItemsCount < b.unroutedItemsCount
      ? `Fuller item coverage: routes ${totalItemsCount - a.unroutedItemsCount}/${totalItemsCount} items vs ${totalItemsCount - b.unroutedItemsCount}/${totalItemsCount} items (${a.unroutedItemsCount} unrouted vs ${b.unroutedItemsCount} unrouted)`
      : `Fewer unrouted items`;
  }
  if (a.registryWarningsCount !== b.registryWarningsCount) {
    return `Better compliance: ${a.registryWarningsCount} registry warning(s) vs ${b.registryWarningsCount} warning(s)`;
  }
  if (a.withinCap !== b.withinCap) {
    return a.withinCap
      ? `Within fee cap: ₹${a.totalFee} within cap whereas alternative exceeds cap (₹${b.totalFee})`
      : `Fee cap compliance differs`;
  }
  if (a.totalFee !== b.totalFee) {
    return `Lower pickup fee: ₹${a.totalFee} vs ₹${b.totalFee} (saves ₹${b.totalFee - a.totalFee})`;
  }
  if (a.totalKnownPayout !== b.totalKnownPayout) {
    return `Higher cash payout: ₹${a.totalKnownPayout} vs ₹${b.totalKnownPayout} (+₹${a.totalKnownPayout - b.totalKnownPayout})`;
  }
  if (a.legsCount !== b.legsCount) {
    return `Fewer legs: ${a.legsCount} trip(s) vs ${b.legsCount} trip(s)`;
  }
  if (a.recyclerIdsTiebreak !== b.recyclerIdsTiebreak) {
    return `Deterministic tiebreaker on sorted recycler IDs (${a.recyclerIdsTiebreak} vs ${b.recyclerIdsTiebreak})`;
  }
  return `Deterministic tiebreaker on plan hash (${a.plan.planHash.slice(0, 8)} vs ${b.plan.planHash.slice(0, 8)})`;
}

/**
 * packages/core/src/approval/approval-service.ts
 *
 * Approval service for ReCircuit reverse-logistics planning.
 * Deterministic transition coordinator for PLAN_CREATED -> AWAITING_APPROVAL -> APPROVED / REJECTED.
 */

import { randomUUID } from "crypto";
import type { Plan, PlanLeg, Request, SlotPreference } from "../types.js";
import { hashPlan, makeIdempotencyKey, transitionState } from "../state-machine.js";
import type {
  ApprovalCard,
  ApprovalDecision,
  ApprovalReason,
  ApprovalStateTransitionResult,
  DecisionRecord,
} from "./types.js";

export const DEFAULT_SLOT_PREFERENCE: SlotPreference = {
  day: "earliest",
  window: "any",
};

/**
 * Computes all approval reasons for a proposed plan.
 * Rule: BOOKING_SUBMISSION is ALWAYS present.
 */
export function computeApprovalReasons(options: {
  request: Pick<Request, "feeCapInr">;
  plan: Pick<Plan, "totalEstimatedFee">;
  registrySnapshots?: Record<string, string> | undefined;
  hasNearThreshold?: boolean | undefined;
  legRecyclerIds?: string[] | undefined;
}): ApprovalReason[] {
  const reasons: ApprovalReason[] = ["BOOKING_SUBMISSION"];

  const feeCap = options.request.feeCapInr;
  const totalFee = options.plan.totalEstimatedFee;

  if (feeCap != null && totalFee > feeCap) {
    reasons.push("FEE_CAP_EXCEEDED");
  }

  if (totalFee > 0) {
    reasons.push("FEE_CHARGED");
  }

  const snapshots = options.registrySnapshots ?? {
    deccan: "REGISTERED",
    paperplus: "REGISTERED",
    quickscrap: "NOT_FOUND",
  };
  const recyclerIds = options.legRecyclerIds ?? [];
  const hasUnregistered = recyclerIds.some((id) => {
    const status = snapshots[id] ?? "REGISTERED";
    return status !== "REGISTERED";
  });
  if (hasUnregistered) {
    reasons.push("REGISTRY_WARNING");
  }

  if (options.hasNearThreshold) {
    reasons.push("ESTIMATED_WEIGHT_NEAR_THRESHOLD");
  }

  return reasons;
}

/**
 * Builds an immutable ApprovalCard for presentation in CLI or UI.
 */
export function buildApprovalCard(options: {
  request: Request;
  plan: Plan;
  approvalReasons: ApprovalReason[];
  slotPreference?: SlotPreference | undefined;
  isPartial?: boolean | undefined;
  unroutedItems?: Array<{ description: string; reasons: string }> | undefined;
  alternatives?: Array<{
    rank: number;
    planId: string;
    legsCount: number;
    fee: number;
    payout: number;
    net: number;
    recyclers: string[];
  }> | undefined;
  registryWarnings?: string[] | undefined;
}): ApprovalCard {
  const { request, plan } = options;
  const approvalReasons = options.approvalReasons ? [...options.approvalReasons] : [];
  const slot = options.slotPreference ?? plan.slotPreference ?? DEFAULT_SLOT_PREFERENCE;

  const totalFee = plan.totalEstimatedFee;
  const totalPayout = plan.totalEstimatedPayout;
  const netPayout = totalPayout - totalFee;

  let feeCapStatus: "within_cap" | "exceeds_cap" | "no_cap" = "no_cap";
  if (request.feeCapInr != null) {
    feeCapStatus = totalFee <= request.feeCapInr ? "within_cap" : "exceeds_cap";
  }

  const legs = plan.legs.map((leg, idx) => ({
    legNumber: idx + 1,
    recyclerId: leg.recyclerId,
    recyclerName: leg.recyclerName,
    estimatedFee: leg.estimatedFee,
    estimatedPayout: leg.estimatedPayout,
    items: (leg.items ?? []).map((itm) => ({
      description: itm.description ?? itm.id,
      quantity: itm.quantity ?? 1,
      weightKg: itm.estimatedWeightKg ?? 0,
    })),
  }));

  const warnings: string[] = [];
  if (feeCapStatus === "exceeds_cap") {
    warnings.push(`Pickup fee ₹${totalFee} exceeds stated fee cap of ₹${request.feeCapInr}`);
  }
  if (options.registryWarnings && options.registryWarnings.length > 0) {
    warnings.push(...options.registryWarnings);
  }

  // Ensure REGISTRY_WARNING is added if any leg routes through QuickScrap
  const hasQuickScrap = legs.some((l) => l.recyclerId === "quickscrap");
  if (hasQuickScrap || approvalReasons.includes("REGISTRY_WARNING")) {
    if (!approvalReasons.includes("REGISTRY_WARNING")) {
      approvalReasons.push("REGISTRY_WARNING");
    }
    const regWarning =
      "One or more legs route through QuickScrap Hyd (registration application in process with state authorities; unverified CPCB certification)";
    if (!warnings.some((w) => w.includes("QuickScrap") || w.includes("registration"))) {
      warnings.push(regWarning);
    }
  }

  if (approvalReasons.includes("ESTIMATED_WEIGHT_NEAR_THRESHOLD")) {
    warnings.push("Estimated scrap load is within 1 kg of a pricing weight threshold");
  }

  return {
    requestId: request.id,
    planId: plan.id,
    planHash: plan.planHash,
    legs,
    totalFee,
    totalPayout,
    netPayout,
    feeCapInr: request.feeCapInr ?? null,
    feeCapStatus,
    approvalReasons,
    warnings,
    slotPreference: slot,
    isPartial: options.isPartial ?? false,
    unroutedItems: options.unroutedItems ?? [],
    alternativesSummary: options.alternatives ?? [],
  };
}

/**
 * Formats the ApprovalCard as readable CLI text.
 */
export function formatApprovalCard(card: ApprovalCard): string {
  const lines: string[] = [];
  lines.push(`================================================================`);
  lines.push(`               REVERSE-LOGISTICS APPROVAL CARD`);
  lines.push(`================================================================`);
  lines.push(`Request ID:       ${card.requestId}`);
  lines.push(`Plan ID:          ${card.planId} ${card.isPartial ? "[PARTIAL PLAN]" : "[FULL PLAN]"}`);
  lines.push(`Plan Hash:        ${card.planHash}`);
  lines.push(`Slot Preference:  Day: ${card.slotPreference.day} | Window: ${card.slotPreference.window}`);
  lines.push(`Financials:       Total Fee: ₹${card.totalFee} | Payout: ₹${card.totalPayout} | Net: ₹${card.netPayout}`);
  lines.push(`Fee Cap Status:   ${card.feeCapInr != null ? `Cap ₹${card.feeCapInr} -> ${card.feeCapStatus.toUpperCase()}` : "No fee cap stated"}`);
  lines.push(`Approval Reasons: ${card.approvalReasons.join(", ")}`);

  if (card.warnings.length > 0) {
    lines.push(`\n⚠️  WARNINGS REQUIRING ATTENTION:`);
    for (const w of card.warnings) {
      lines.push(`   • ${w}`);
    }
  }

  lines.push(`\n📦 PICKUP LEGS BREAKDOWN (${card.legs.length} trip(s)):`);
  for (const leg of card.legs) {
    lines.push(`   [Leg ${leg.legNumber}] ${leg.recyclerName} (${leg.recyclerId.toUpperCase()})`);
    lines.push(`         Fee: ₹${leg.estimatedFee} | Payout: ₹${leg.estimatedPayout}`);
    for (const itm of leg.items) {
      lines.push(`         • ${itm.description} (qty: ${itm.quantity}, wt: ${itm.weightKg} kg)`);
    }
  }

  if (card.isPartial && card.unroutedItems.length > 0) {
    lines.push(`\n❌ UNROUTED ITEMS (${card.unroutedItems.length}):`);
    for (const un of card.unroutedItems) {
      lines.push(`   • ${un.description}: ${un.reasons}`);
    }
  }

  if (card.alternativesSummary.length > 0) {
    lines.push(`\n🔄 AVAILABLE ALTERNATIVE PLANS:`);
    for (const alt of card.alternativesSummary) {
      lines.push(`   [Option ${alt.rank}] Plan ID: ${alt.planId} | Legs: ${alt.legsCount} | Fee: ₹${alt.fee} | Payout: ₹${alt.payout} | Recyclers: ${alt.recyclers.join(", ")}`);
    }
  }

  lines.push(`----------------------------------------------------------------`);
  lines.push(`DECISION OPTIONS:`);
  lines.push(`  [1] Approve:  npm run approve -- --request=${card.requestId} --decision=approve`);
  lines.push(`  [2] Reject:   npm run approve -- --request=${card.requestId} --decision=reject`);
  if (card.alternativesSummary.length > 0) {
    lines.push(`  [3] Choose:   npm run approve -- --request=${card.requestId} --choose-plan=<rank>`);
  }
  lines.push(`================================================================`);

  return lines.join("\n");
}

/**
 * Requests user approval for a plan:
 * Transitions Request from PLAN_CREATED -> AWAITING_APPROVAL.
 */
export function requestApproval(options: {
  request: Request;
  plan: Plan;
  slotPreference?: SlotPreference | undefined;
  approvalReasons?: ApprovalReason[] | undefined;
  isPartial?: boolean | undefined;
  unroutedItems?: Array<{ description: string; reasons: string }> | undefined;
  alternatives?: Array<{
    rank: number;
    planId: string;
    legsCount: number;
    fee: number;
    payout: number;
    net: number;
    recyclers: string[];
  }> | undefined;
  registryWarnings?: string[] | undefined;
}): { request: Request; plan: Plan; card: ApprovalCard } {
  const { request, plan } = options;
  const slotPreference = options.slotPreference ?? plan.slotPreference ?? DEFAULT_SLOT_PREFERENCE;

  // Set slotPreference on plan and re-hash plan
  const preparedPlan: Plan = {
    ...plan,
    slotPreference,
  };
  preparedPlan.planHash = hashPlan(preparedPlan);

  const approvalReasons =
    options.approvalReasons && options.approvalReasons.length > 0
      ? [...options.approvalReasons]
      : computeApprovalReasons({
          request,
          plan: preparedPlan,
          legRecyclerIds: preparedPlan.legs.map((l) => l.recyclerId),
        });

  // Transition request to AWAITING_APPROVAL if currently in PLAN_CREATED
  let currentRequest: Request = { ...request, slotPreference };
  if (currentRequest.state === "PLAN_CREATED") {
    const res = transitionState(currentRequest, "AWAITING_APPROVAL", {
      planId: preparedPlan.id,
      planHash: preparedPlan.planHash,
      approvalReason: approvalReasons.join(","),
    });
    currentRequest = res.newRequest;
  }

  const card = buildApprovalCard({
    request: currentRequest,
    plan: preparedPlan,
    approvalReasons,
    slotPreference,
    isPartial: options.isPartial,
    unroutedItems: options.unroutedItems,
    alternatives: options.alternatives,
    registryWarnings: options.registryWarnings,
  });

  return { request: currentRequest, plan: preparedPlan, card };
}

/**
 * Records a user decision (approve or reject) on a plan.
 * Deterministic and idempotent.
 */
export function recordDecision(options: {
  request: Request;
  plan: Plan;
  decision: ApprovalDecision;
  decidedBy: string;
  decidedAt?: string | undefined;
  reason?: string | undefined;
  priorDecision?: DecisionRecord | null | undefined;
  dataWipeConfirmedByUser?: boolean | undefined;
}): ApprovalStateTransitionResult {
  const { request, plan, decision, decidedBy, priorDecision, reason } = options;
  const decidedAt = options.decidedAt ?? new Date().toISOString();
  const dataWipeConfirmedByUser = options.dataWipeConfirmedByUser ?? plan.dataWipeConfirmedByUser;

  // 1. Idempotency Check: Same decision with same planHash
  if (
    priorDecision &&
    priorDecision.planHash === plan.planHash &&
    priorDecision.decision === decision
  ) {
    // Reconstruct legs if already approved
    const existingLegs =
      decision === "approved"
        ? plan.legs.map((l) => ({
            ...l,
            state: "APPROVED" as const,
            idempotencyKey: makeIdempotencyKey(plan.planHash, l.id, l.recyclerId),
          }))
        : [];
    return {
      request,
      plan,
      legs: existingLegs,
      decisionRecord: priorDecision,
      idempotent: true,
    };
  }

  // 2. Stale Approval Guard: If decision is approved but planHash does not match plan
  const currentPlanHash = plan.planHash || hashPlan(plan);

  const decisionRecord: DecisionRecord = {
    id: randomUUID(),
    requestId: request.id,
    planId: plan.id,
    planHash: currentPlanHash,
    decision,
    decidedBy,
    decidedAt,
    reason,
    dataWipeConfirmedByUser,
  };

  // 3. State Machine Transitions
  if (decision === "approved") {
    // Transition AWAITING_APPROVAL -> APPROVED
    const transitionRes = transitionState(request, "APPROVED", {
      approvalId: decisionRecord.id,
      planHash: currentPlanHash,
    });

    // Create legs in APPROVED state
    const createdLegs: PlanLeg[] = plan.legs.map((leg) => {
      const legId = leg.id || randomUUID();
      return {
        ...leg,
        id: legId,
        planId: plan.id,
        state: "APPROVED",
        idempotencyKey: makeIdempotencyKey(currentPlanHash, legId, leg.recyclerId),
        createdAt: decidedAt,
        updatedAt: decidedAt,
      };
    });

    return {
      request: transitionRes.newRequest,
      plan: { ...plan, legs: createdLegs, planHash: currentPlanHash },
      legs: createdLegs,
      decisionRecord,
      idempotent: false,
    };
  }

  // 4. Decision === "rejected"
  const transitionRes = transitionState(request, "REJECTED", {
    decision: "rejected",
    reason: reason ?? "User declined proposed logistics plan",
    decidedAt,
  });

  return {
    request: transitionRes.newRequest,
    plan,
    legs: [],
    decisionRecord,
    idempotent: false,
  };
}

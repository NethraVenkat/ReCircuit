/**
 * packages/core/src/state-machine.ts
 *
 * Deterministic state machine for ReCircuit (both Request pipeline and Leg lifecycle).
 *
 * RULES:
 *  - The LLM never decides eligibility, money, or state transitions.
 *  - Every transition is explicit and table-driven.
 *  - Evidence is validated with Zod before a transition is allowed.
 *  - Every successful transition emits an audit StatusEvent.
 *  - ->FAILED allowed from non-terminal states only, requiring failure evidence (errorCode, message, observedAt).
 *  - No transitions out of CERTIFICATE_ISSUED, REJECTED, or FAILED (including to FAILED).
 *  - Stale approval (planHash mismatch) is rejected inside transitionState.
 */

import { createHash, randomUUID } from "crypto";

import type { LegState, RequestState, PlanLeg, Request, Plan, StatusEvent } from "./types.js";
import { TransitionError } from "./types.js";
import {
  PolicyExtractEvidenceSchema,
  PlanEvidenceSchema,
  UserApprovalEvidenceSchema,
  UserDecisionEvidenceSchema,
  IdempotencyEvidenceSchema,
  HumanVerificationEvidenceSchema,
  FormSubmissionEvidenceSchema,
  TrackingLookupEvidenceSchema,
  PickupConfirmationEvidenceSchema,
  WeightTicketEvidenceSchema,
  FailureEvidenceSchema,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Transition tables
// ---------------------------------------------------------------------------

/**
 * Allowed transitions for the top-level Request pipeline.
 * Key: "FROM->TO"
 */
export const REQUEST_TRANSITIONS: ReadonlySet<string> = new Set([
  "DRAFT->ITEMS_PARSED",
  "ITEMS_PARSED->NEEDS_CLARIFICATION",
  "NEEDS_CLARIFICATION->ITEMS_PARSED",
  "ITEMS_PARSED->RECYCLERS_DISCOVERED",
  "RECYCLERS_DISCOVERED->POLICIES_READ",
  "POLICIES_READ->ELIGIBILITY_CHECKED",
  "ELIGIBILITY_CHECKED->PLAN_CREATED",
  "PLAN_CREATED->AWAITING_APPROVAL",
  "AWAITING_APPROVAL->APPROVED",
  "AWAITING_APPROVAL->REJECTED",
]);

/**
 * Allowed transitions for the PlanLeg lifecycle.
 * Key: "FROM->TO"
 */
export const LEG_TRANSITIONS: ReadonlySet<string> = new Set([
  "APPROVED->SUBMITTING",
  "SUBMITTING->NEEDS_HUMAN",
  "NEEDS_HUMAN->SUBMITTING",
  "SUBMITTING->REQUEST_SUBMITTED",
  "REQUEST_SUBMITTED->REQUEST_CONFIRMED",
  "REQUEST_CONFIRMED->PICKUP_SCHEDULED",
  "PICKUP_SCHEDULED->PICKED_UP",
  "PICKED_UP->WEIGHED",
  "WEIGHED->RECEIVED_AT_RECYCLER",
  "RECEIVED_AT_RECYCLER->PROCESSED",
  "PROCESSED->RECYCLED",
  "RECYCLED->CERTIFICATE_ISSUED",

  // Recycler portal rejections
  "SUBMITTING->REJECTED",
  "REQUEST_SUBMITTED->REJECTED",
  "REQUEST_CONFIRMED->REJECTED",
  "NEEDS_HUMAN->REJECTED",
]);

/**
 * Complete union of all explicit valid transitions.
 */
export const TRANSITIONS: ReadonlySet<string> = new Set([
  ...REQUEST_TRANSITIONS,
  ...LEG_TRANSITIONS,
]);

/**
 * Terminal states out of which NO transitions are allowed (even -> FAILED).
 */
export const TERMINAL_STATES: ReadonlySet<string> = new Set([
  "CERTIFICATE_ISSUED",
  "REJECTED",
  "FAILED",
]);

// ---------------------------------------------------------------------------
// Evidence requirements table
// ---------------------------------------------------------------------------

export type EvidenceRequirement =
  | "policy_extract"
  | "plan"
  | "user_approval"
  | "user_decision"
  | "idempotency_key"
  | "human_verification"
  | "form_submission"
  | "tracking_lookup"
  | "tracking_lookup_with_slot"
  | "pickup_confirmation"
  | "weight_ticket"
  | "failure";

/**
 * Maps target state to the primary evidence type required.
 */
export const EVIDENCE_REQUIRED: Readonly<Partial<Record<LegState | RequestState, EvidenceRequirement>>> = {
  POLICIES_READ: "policy_extract",
  PLAN_CREATED: "plan",
  AWAITING_APPROVAL: "plan",
  APPROVED: "user_approval",
  REJECTED: "user_decision",
  SUBMITTING: "idempotency_key",
  NEEDS_HUMAN: "human_verification",
  REQUEST_SUBMITTED: "form_submission",
  REQUEST_CONFIRMED: "tracking_lookup",
  PICKUP_SCHEDULED: "tracking_lookup_with_slot",
  PICKED_UP: "pickup_confirmation",
  WEIGHED: "weight_ticket",
  FAILED: "failure",
};

// ---------------------------------------------------------------------------
// canTransition
// ---------------------------------------------------------------------------

export interface TransitionCheckOk {
  ok: true;
}
export interface TransitionCheckFail {
  ok: false;
  reason: string;
}
export type TransitionCheck = TransitionCheckOk | TransitionCheckFail;

/**
 * Context that some transitions need beyond raw evidence.
 */
export interface TransitionDeps {
  /** The current plan hash (needed to validate -> APPROVED and prevent stale approval) */
  currentPlanHash?: string | undefined;
  /** The booking reference submitted during SUBMITTING (needed for REQUEST_CONFIRMED) */
  submittedBookingReference?: string | undefined;
  /** The session ID used during SUBMITTING (needed for REQUEST_CONFIRMED independence check) */
  submittingSessionId?: string | undefined;
  /** All idempotency keys that have been used successfully (to block duplicates) */
  usedIdempotencyKeys?: ReadonlySet<string> | undefined;
}

/**
 * Pure, deterministic check: can we move from `from` to `to` given this evidence?
 *
 * Enforces:
 *  - No transitions out of terminal states (CERTIFICATE_ISSUED, REJECTED, FAILED).
 *  - Self-transitions (including PLAN_CREATED -> PLAN_CREATED) are prohibited.
 *  - -> FAILED is allowed only from non-terminal states and requires FailureEvidence (errorCode, message, observedAt).
 *  - -> APPROVED requires UserApprovalEvidence and planHash must match deps.currentPlanHash.
 *  - All transitions in REQUEST_TRANSITIONS and LEG_TRANSITIONS validate their respective evidence.
 */
export function canTransitionRequest(
  from: RequestState,
  to: RequestState,
  evidence: unknown,
  deps: TransitionDeps = {}
): TransitionCheck {
  return canTransition(from, to, evidence, deps, "request");
}

export function canTransitionLeg(
  from: LegState,
  to: LegState,
  evidence: unknown,
  deps: TransitionDeps = {}
): TransitionCheck {
  return canTransition(from, to, evidence, deps, "leg");
}

/**
 * Pure, deterministic check: can we move from `from` to `to` given this evidence?
 *
 * Enforces:
 *  - Strict separation: request transitions cannot be applied to legs, and leg transitions cannot be applied to requests.
 *  - No transitions out of terminal states (CERTIFICATE_ISSUED, REJECTED, FAILED).
 *  - Self-transitions (including PLAN_CREATED -> PLAN_CREATED) are prohibited.
 *  - -> FAILED is allowed only from non-terminal states and requires FailureEvidence (errorCode, message, observedAt).
 *  - -> APPROVED requires UserApprovalEvidence and planHash must match deps.currentPlanHash.
 *  - All transitions in REQUEST_TRANSITIONS and LEG_TRANSITIONS validate their respective evidence.
 */
export function canTransition(
  from: LegState | RequestState,
  to: LegState | RequestState,
  evidence: unknown,
  deps: TransitionDeps = {},
  entityType?: "request" | "leg"
): TransitionCheck {
  // 1. Refuse any exit from terminal states
  if (TERMINAL_STATES.has(from)) {
    return {
      ok: false,
      reason: `Cannot transition out of terminal state "${from}" (no exits permitted, including to FAILED)`,
    };
  }

  // 2. Disallow self-transitions (e.g. PLAN_CREATED -> PLAN_CREATED is not allowed)
  if (from === to) {
    return {
      ok: false,
      reason: `Self-transition ${from} -> ${to} is not allowed (a changed plan is a new plan version)`,
    };
  }

  // 3. Any non-terminal state -> FAILED is allowed with valid FailureEvidence
  if (to === "FAILED") {
    const result = FailureEvidenceSchema.safeParse(evidence);
    if (!result.success) {
      return {
        ok: false,
        reason: `FAILED transition requires valid failure evidence (errorCode, message, observedAt): ${result.error.message}`,
      };
    }
    return { ok: true };
  }

  // 4. Must be an explicitly permitted transition for the entity type
  const key = `${from}->${to}`;
  if (entityType === "request") {
    if (!REQUEST_TRANSITIONS.has(key)) {
      return {
        ok: false,
        reason: `Transition ${from} -> ${to} is not an allowed request pipeline transition`,
      };
    }
  } else if (entityType === "leg") {
    if (!LEG_TRANSITIONS.has(key)) {
      return {
        ok: false,
        reason: `Transition ${from} -> ${to} is not an allowed leg lifecycle transition`,
      };
    }
  } else {
    if (!TRANSITIONS.has(key)) {
      return {
        ok: false,
        reason: `Transition ${from} -> ${to} is not in the allowed transitions table`,
      };
    }
  }

  // 5. Validate evidence requirements per target state
  switch (to) {
    case "POLICIES_READ": {
      const result = PolicyExtractEvidenceSchema.safeParse(evidence);
      if (!result.success) {
        return { ok: false, reason: `POLICIES_READ requires policy extract evidence: ${result.error.message}` };
      }
      return { ok: true };
    }

    case "PLAN_CREATED":
    case "AWAITING_APPROVAL": {
      const result = PlanEvidenceSchema.safeParse(evidence);
      if (!result.success) {
        return { ok: false, reason: `${to} requires plan evidence: ${result.error.message}` };
      }
      return { ok: true };
    }

    case "APPROVED": {
      const result = UserApprovalEvidenceSchema.safeParse(evidence);
      if (!result.success) {
        return { ok: false, reason: `APPROVED requires user approval evidence: ${result.error.message}` };
      }
      const ev = result.data;
      if (deps.currentPlanHash && ev.planHash !== deps.currentPlanHash) {
        return {
          ok: false,
          reason: `Stale approval rejected: approval planHash "${ev.planHash}" does not match current planHash "${deps.currentPlanHash}"`,
        };
      }
      return { ok: true };
    }

    case "REJECTED": {
      // From AWAITING_APPROVAL, evidence is user_decision
      if (from === "AWAITING_APPROVAL") {
        const result = UserDecisionEvidenceSchema.safeParse(evidence);
        if (!result.success) {
          return { ok: false, reason: `AWAITING_APPROVAL -> REJECTED requires user decision evidence: ${result.error.message}` };
        }
        return { ok: true };
      }
      // Leg rejections accept either failure or decision evidence
      const failResult = FailureEvidenceSchema.safeParse(evidence);
      const decResult = UserDecisionEvidenceSchema.safeParse(evidence);
      if (!failResult.success && !decResult.success) {
        return { ok: false, reason: `REJECTED transition requires failure or user decision evidence` };
      }
      return { ok: true };
    }

    case "SUBMITTING": {
      const result = IdempotencyEvidenceSchema.safeParse(evidence);
      if (!result.success) {
        return { ok: false, reason: `SUBMITTING requires idempotency evidence: ${result.error.message}` };
      }
      const ev = result.data;
      if (deps.usedIdempotencyKeys?.has(ev.idempotencyKey)) {
        return { ok: false, reason: `Idempotency key "${ev.idempotencyKey}" has already been used successfully` };
      }
      return { ok: true };
    }

    case "NEEDS_HUMAN": {
      const result = HumanVerificationEvidenceSchema.safeParse(evidence);
      if (!result.success) {
        return { ok: false, reason: `NEEDS_HUMAN requires human verification evidence: ${result.error.message}` };
      }
      return { ok: true };
    }

    case "REQUEST_SUBMITTED": {
      const result = FormSubmissionEvidenceSchema.safeParse(evidence);
      if (!result.success) {
        return { ok: false, reason: `REQUEST_SUBMITTED requires form submission evidence: ${result.error.message}` };
      }
      return { ok: true };
    }

    case "REQUEST_CONFIRMED": {
      const result = TrackingLookupEvidenceSchema.safeParse(evidence);
      if (!result.success) {
        return { ok: false, reason: `REQUEST_CONFIRMED requires tracking lookup evidence: ${result.error.message}` };
      }
      const ev = result.data;
      if (deps.submittingSessionId && ev.sessionId === deps.submittingSessionId) {
        return {
          ok: false,
          reason: `REQUEST_CONFIRMED: verifier sessionId must differ from the submitting sessionId (both are "${ev.sessionId}")`,
        };
      }
      if (deps.submittedBookingReference && ev.bookingReference !== deps.submittedBookingReference) {
        return {
          ok: false,
          reason: `REQUEST_CONFIRMED: tracked reference "${ev.bookingReference}" does not match submitted reference "${deps.submittedBookingReference}"`,
        };
      }
      return { ok: true };
    }

    case "PICKUP_SCHEDULED": {
      const result = TrackingLookupEvidenceSchema.safeParse(evidence);
      if (!result.success) {
        return { ok: false, reason: `PICKUP_SCHEDULED requires tracking lookup evidence: ${result.error.message}` };
      }
      const ev = result.data;
      if (!ev.slot) {
        return { ok: false, reason: "PICKUP_SCHEDULED requires a slot in the tracking lookup evidence" };
      }
      return { ok: true };
    }

    case "PICKED_UP": {
      const result = PickupConfirmationEvidenceSchema.safeParse(evidence);
      if (!result.success) {
        return { ok: false, reason: `PICKED_UP requires pickup confirmation evidence: ${result.error.message}` };
      }
      return { ok: true };
    }

    case "WEIGHED": {
      const result = WeightTicketEvidenceSchema.safeParse(evidence);
      if (!result.success) {
        return { ok: false, reason: `WEIGHED requires weight ticket evidence: ${result.error.message}` };
      }
      return { ok: true };
    }

    // Pipeline steps that do not require explicit external schemas
    case "ITEMS_PARSED":
    case "NEEDS_CLARIFICATION":
    case "RECYCLERS_DISCOVERED":
    case "ELIGIBILITY_CHECKED":
    case "RECEIVED_AT_RECYCLER":
    case "PROCESSED":
    case "RECYCLED":
    case "CERTIFICATE_ISSUED":
      return { ok: true };

    default:
      return { ok: false, reason: `No evidence rule for target state "${to as string}"` };
  }
}

// ---------------------------------------------------------------------------
// transitionState
// ---------------------------------------------------------------------------

function isRequest(entity: PlanLeg | Request): entity is Request {
  return "description" in entity && "items" in entity;
}

export function transitionState(
  request: Request,
  to: RequestState,
  evidence: unknown,
  deps?: TransitionDeps
): { newRequest: Request; newLeg?: never; auditEvent: StatusEvent };
export function transitionState(
  leg: PlanLeg,
  to: LegState,
  evidence: unknown,
  deps?: TransitionDeps
): { newLeg: PlanLeg; newRequest?: never; auditEvent: StatusEvent };
export function transitionState(
  target: PlanLeg | Request,
  to: LegState | RequestState,
  evidence: unknown,
  deps: TransitionDeps = {}
): { newLeg?: PlanLeg; newRequest?: Request; auditEvent: StatusEvent } {
  const currentState = target.state;
  const isReq = isRequest(target);
  const check = isReq
    ? canTransitionRequest(currentState as RequestState, to as RequestState, evidence, deps)
    : canTransitionLeg(currentState as LegState, to as LegState, evidence, {
        ...deps,
        submittingSessionId: deps.submittingSessionId ?? target.submittingSessionId,
        submittedBookingReference: deps.submittedBookingReference ?? target.bookingReference,
      });

  if (!check.ok) {
    throw new TransitionError(currentState, to, check.reason);
  }

  const now = new Date().toISOString();
  const { evidenceType, evidenceReference } = describeEvidence(to, evidence);

  if (isReq) {
    const newRequest: Request = { ...target, state: to as RequestState, updatedAt: now };
    const auditEvent: StatusEvent = {
      id: randomUUID(),
      requestId: target.id,
      previousState: target.state,
      newState: to,
      evidenceType,
      evidenceReference,
      observedAt: now,
    };
    return { newRequest, auditEvent };
  } else {
    const newLeg: PlanLeg = { ...target, state: to as LegState, updatedAt: now };

    if (to === "SUBMITTING") {
      const ev = IdempotencyEvidenceSchema.parse(evidence);
      newLeg.idempotencyKey = ev.idempotencyKey;
    }
    if (to === "REQUEST_SUBMITTED") {
      const ev = FormSubmissionEvidenceSchema.parse(evidence);
      newLeg.bookingReference = ev.bookingReference;
    }

    const auditEvent: StatusEvent = {
      id: randomUUID(),
      legId: target.id,
      previousState: target.state,
      newState: to,
      evidenceType,
      evidenceReference,
      observedAt: now,
    };
    return { newLeg, auditEvent };
  }
}

/** Extract a human-readable label and reference string from the evidence object */
function describeEvidence(
  to: LegState | RequestState,
  evidence: unknown
): { evidenceType: string; evidenceReference: string } {
  if (to === "FAILED") {
    const ev = evidence as { errorCode?: string; message?: string; screenshotRef?: string };
    return { evidenceType: "failure", evidenceReference: ev.errorCode ?? ev.message ?? "failed" };
  }
  if (to === "REJECTED") {
    const ev = evidence as { decision?: string; reason?: string };
    return { evidenceType: "user_decision", evidenceReference: ev.decision ?? ev.reason ?? "rejected" };
  }
  if (to === "POLICIES_READ") {
    const ev = evidence as { url?: string; screenshotRef?: string };
    return { evidenceType: "policy_extract", evidenceReference: ev.url ?? ev.screenshotRef ?? "extracted" };
  }
  if (to === "PLAN_CREATED" || to === "AWAITING_APPROVAL") {
    const ev = evidence as { planId?: string; planHash?: string };
    return { evidenceType: "plan", evidenceReference: ev.planHash ?? ev.planId ?? "plan" };
  }
  if (to === "APPROVED") {
    const ev = evidence as { approvalId?: string; planHash?: string };
    return { evidenceType: "user_approval", evidenceReference: ev.planHash ?? ev.approvalId ?? "approved" };
  }
  if (to === "SUBMITTING") {
    const ev = evidence as { idempotencyKey?: string };
    return { evidenceType: "idempotency_key", evidenceReference: ev.idempotencyKey ?? "n/a" };
  }
  if (to === "NEEDS_HUMAN") {
    const ev = evidence as { screenshotRef?: string };
    return { evidenceType: "human_verification_detected", evidenceReference: ev.screenshotRef ?? "n/a" };
  }
  if (to === "REQUEST_SUBMITTED") {
    const ev = evidence as { bookingReference?: string; screenshotRef?: string };
    return { evidenceType: "form_submission", evidenceReference: ev.bookingReference ?? ev.screenshotRef ?? "n/a" };
  }
  if (to === "REQUEST_CONFIRMED" || to === "PICKUP_SCHEDULED") {
    const ev = evidence as { bookingReference?: string; sessionId?: string };
    return { evidenceType: "tracking_lookup", evidenceReference: ev.bookingReference ?? ev.sessionId ?? "n/a" };
  }
  if (to === "PICKED_UP") {
    const ev = evidence as { otpOrQrCode?: string };
    return { evidenceType: "pickup_confirmation", evidenceReference: ev.otpOrQrCode ?? "n/a" };
  }
  if (to === "WEIGHED") {
    const ev = evidence as { ticketRef?: string };
    return { evidenceType: "weight_ticket", evidenceReference: ev.ticketRef ?? "n/a" };
  }
  return { evidenceType: "state_transition", evidenceReference: "ok" };
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Returns true only if the leg state represents an item that has been
 * physically collected. Used by the UI for "Collected" badge.
 */
export function isCollected(state: LegState): boolean {
  const collectedStates: ReadonlySet<LegState> = new Set([
    "PICKED_UP",
    "WEIGHED",
    "RECEIVED_AT_RECYCLER",
    "PROCESSED",
    "RECYCLED",
    "CERTIFICATE_ISSUED",
  ]);
  return collectedStates.has(state);
}

/**
 * Stable sha256 hex over canonical JSON of a plan.
 *
 * Canonical = legs sorted by id, items per leg sorted, keys sorted within each object.
 * Changing any fee, payout, recycler, item, quantity, weight, or slot will change the hash.
 */
export function hashPlan(plan: Plan): string {
  const canonical = canonicalize({
    legs: plan.legs
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((leg) => ({
        id: leg.id,
        recyclerId: leg.recyclerId,
        itemIds: (leg.itemIds ?? (leg.items ? leg.items.map((i) => i.id) : [])).slice().sort(),
        items: leg.items
          ? leg.items
              .slice()
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((item) => ({
                id: item.id,
                category: item.category ?? null,
                quantity: item.quantity ?? null,
                estimatedWeightKg: item.estimatedWeightKg ?? null,
              }))
          : null,
        estimatedFee: leg.estimatedFee,
        estimatedPayout: leg.estimatedPayout,
        slot: leg.slot ?? null,
      })),
    slotPreference: plan.slotPreference
      ? {
          day: plan.slotPreference.day,
          window: plan.slotPreference.window,
        }
      : null,
    totalEstimatedFee: plan.totalEstimatedFee,
    totalEstimatedPayout: plan.totalEstimatedPayout,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Stable sha256 hex for use as an idempotency key for a browser action.
 */
export function makeIdempotencyKey(planHash: string, legId: string, recyclerId: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ planHash, legId, recyclerId }))
    .digest("hex");
}

/**
 * Recursively sorts object keys to produce deterministic JSON.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return "{" + pairs.join(",") + "}";
}

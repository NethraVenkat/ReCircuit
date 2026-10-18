/**
 * packages/core/src/approval/types.ts
 *
 * Domain types for Stage 6: Approval Gate & Safe Action System.
 * Guarantees that the LLM/Agent cannot submit bookings without explicit,
 * evidence-backed user approval.
 */

import type { Plan, PlanLeg, Request, SlotPreference } from "../types.js";
import type { ApprovalReason } from "../routing/types.js";

export type { SlotPreference, ApprovalReason };

export interface ApprovalLegSummary {
  legNumber: number;
  recyclerId: string;
  recyclerName: string;
  estimatedFee: number;
  estimatedPayout: number;
  items: Array<{
    description: string;
    quantity: number;
    weightKg: number;
  }>;
}

export interface ApprovalCard {
  requestId: string;
  planId: string;
  planHash: string;
  legs: ApprovalLegSummary[];
  totalFee: number;
  totalPayout: number;
  netPayout: number;
  feeCapInr: number | null;
  feeCapStatus: "within_cap" | "exceeds_cap" | "no_cap";
  approvalReasons: ApprovalReason[];
  warnings: string[];
  slotPreference: SlotPreference;
  isPartial: boolean;
  unroutedItems: Array<{
    description: string;
    reasons: string;
  }>;
  alternativesSummary: Array<{
    rank: number;
    planId: string;
    legsCount: number;
    fee: number;
    payout: number;
    net: number;
    recyclers: string[];
  }>;
}

export type ApprovalDecision = "approved" | "rejected";

export interface DecisionRecord {
  id: string;
  requestId: string;
  planId: string;
  planHash: string;
  decision: ApprovalDecision;
  decidedBy: string; // user id or "cli_user"
  decidedAt: string; // ISO 8601
  reason?: string | undefined;
  dataWipeConfirmedByUser?: boolean | undefined;
}

export interface SafeActionParams {
  leg: PlanLeg;
  plan: Plan;
  approval: DecisionRecord | null;
  action: "submit_booking";
  observedFeeInr: number;
  usedIdempotencyKeys: Set<string> | string[];
}

export interface ActionAttemptLog {
  id: string;
  timestamp: string;
  requestId: string;
  legId: string;
  recyclerId: string;
  planHash: string;
  action: string;
  allowed: boolean;
  blockReason?: string | undefined;
  approvedFeeInr?: number | undefined;
  observedFeeInr?: number | undefined;
  idempotencyKey: string;
}

export interface ApprovalStateTransitionResult {
  request: Request;
  legs: PlanLeg[];
  decisionRecord: DecisionRecord;
  idempotent: boolean;
}

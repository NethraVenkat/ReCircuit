import type { Request as PickupRequest, Plan, Item, EligibilityMatrix, ApprovalCard, ValidatedIntakeResult, PlanScored } from "@recircuit/core";
import type { PolicyView } from "./policy-presentation";
export interface VerificationView {
  verified: boolean; independent: boolean; bookingReference: string; observedStatus: string;
  observedItems: Array<{ name: string; quantity?: number; weightKg?: number }>;
  observedFeeText?: string; checkedAt: string; verificationQuality?: string; isUncertain?: boolean; error?: string;
}
export interface DetailView {
  request: PickupRequest; items: Item[]; plan: Plan | null; approval?: { decision?: string; decidedAt?: string; planHash?: string };
  updatedAt: string; auditEvents: Array<{ id: string; newState: string; previousState: string; observedAt: string; legId?: string }>;
  household?: { humanHandoffs?: Record<string, { sessionId: string; screenshotRef: string; expiresAt: string }>; choices?: PlanScored[]; customer: { fullName: string; phone: string; addressLine: string; locality: string; pincode: string }; intakeResult: ValidatedIntakeResult; matrix: EligibilityMatrix; approvalCard: ApprovalCard; policyMode: string; policies: PolicyView[]; verifications?: Record<string, VerificationView>; handoff?: string; bookingError?: string; verificationError?: string };
}

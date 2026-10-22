import type { Request as PickupRequest, Plan, Item, EligibilityMatrix, ApprovalCard, ValidatedIntakeResult, PlanScored } from "@recircuit/core";
export interface VerificationView {
  verified: boolean; independent: boolean; bookingReference: string; observedStatus: string;
  observedItems: Array<{ name: string; quantity?: number; weightKg?: number }>;
  observedFeeText?: string; checkedAt: string; verificationQuality?: string; isUncertain?: boolean; error?: string;
}
export interface DetailView {
  request: PickupRequest; items: Item[]; plan: Plan | null; approval?: { decision?: string; decidedAt?: string; planHash?: string };
  updatedAt: string; auditEvents: Array<{ id: string; newState: string; previousState: string; observedAt: string; legId?: string }>;
  household?: { choices?: PlanScored[]; customer: { fullName: string; phone: string; addressLine: string; locality: string; pincode: string }; intakeResult: ValidatedIntakeResult; matrix: EligibilityMatrix; approvalCard: ApprovalCard; policyMode: string; policies: Array<{ name: string; url: string; quotes: string[]; status: string; retrievedAt?: string; extractionPath?: string }>; verifications?: Record<string, VerificationView>; handoff?: string; bookingError?: string; verificationError?: string };
}

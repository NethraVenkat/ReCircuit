import type { PlanLeg, Plan, Request, StatusEvent } from "@recircuit/core";

export interface VerifierOptions {
  headless?: boolean;
  timeoutMs?: number;
  portalBaseUrl?: string;
  evidenceDir?: string;
}

export interface ObservedConsignmentItem {
  name: string;
  quantity?: number | undefined;
  weightKg?: number | undefined;
}

export interface VerifierResult {
  verified: boolean;
  bookingReference: string;
  observedStatus: string;
  verifyingSessionId: string;
  submittingSessionId: string;
  screenshotRef?: string | undefined;
  trackingUrl: string;
  observedItems: ObservedConsignmentItem[];
  observedFeeText?: string | undefined;
  pickupOtp?: string | undefined;
  isSimulatedDownstream?: boolean | undefined;
  isUncertain?: boolean | undefined;
  verificationQuality?: "COMPLETE" | "INCOMPLETE_FIELDS" | "UNCERTAIN" | undefined;
  error?: string | undefined;
  errorCode?: string | undefined;
  auditEvent?: StatusEvent | undefined;
}

export interface LegVerificationContext {
  leg: PlanLeg;
  plan: Plan;
  request?: Request | undefined;
  expectedReference?: string | undefined;
}

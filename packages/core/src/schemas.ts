/**
 * packages/core/src/schemas.ts
 *
 * Zod schemas for all evidence types used in state transitions.
 * These are the source of truth for evidence validation — the LLM never
 * decides validity; this deterministic layer does.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Evidence schemas
// ---------------------------------------------------------------------------

export const PolicyExtractEvidenceSchema = z.object({
  url: z.string().url(),
  screenshotRef: z.string().min(1),
  extractedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  sessionId: z.string().min(1),
});

export const PlanEvidenceSchema = z.object({
  planId: z.string().uuid(),
  planHash: z.string().min(64).max(64), // sha256 hex
  approvalReason: z.string().min(1),
});

export const UserApprovalEvidenceSchema = z.object({
  approvalId: z.string().uuid(),
  planHash: z.string().min(64).max(64),
});

export const IdempotencyEvidenceSchema = z.object({
  idempotencyKey: z.string().min(1),
  priorSuccessfulUse: z.literal(false),
});

export const HumanVerificationEvidenceSchema = z.object({
  screenshotRef: z.string().min(1),
  liveViewUrl: z.string().url(),
});

export const FormSubmissionEvidenceSchema = z.object({
  screenshotRef: z.string().min(1),
  url: z.string().url(),
  bookingReference: z.string().min(1),
});

export const TrackingLookupEvidenceSchema = z.object({
  bookingReference: z.string().min(1),
  sessionId: z.string().min(1),
  slot: z.string().optional(),
});

export const PickupConfirmationEvidenceSchema = z.object({
  otpOrQrCode: z.string().min(1),
  confirmedAt: z.string().min(1),
});

export const WeightTicketEvidenceSchema = z.object({
  weightKg: z.number().positive(),
  ticketRef: z.string().min(1),
  weighedAt: z.string().min(1),
});

export const FailureEvidenceSchema = z.object({
  errorCode: z.string().min(1),
  message: z.string().min(1),
  observedAt: z.string().min(1),
  reason: z.string().optional(),
  details: z.string().optional(),
  screenshotRef: z.string().optional(),
});

export const UserDecisionEvidenceSchema = z.object({
  decision: z.string().min(1),
  reason: z.string().optional(),
  decidedAt: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Named type exports (inferred from schemas)
// ---------------------------------------------------------------------------

export type PolicyExtractEvidence = z.infer<typeof PolicyExtractEvidenceSchema>;
export type PlanEvidence = z.infer<typeof PlanEvidenceSchema>;
export type UserApprovalEvidence = z.infer<typeof UserApprovalEvidenceSchema>;
export type UserDecisionEvidence = z.infer<typeof UserDecisionEvidenceSchema>;
export type IdempotencyEvidence = z.infer<typeof IdempotencyEvidenceSchema>;
export type HumanVerificationEvidence = z.infer<typeof HumanVerificationEvidenceSchema>;
export type FormSubmissionEvidence = z.infer<typeof FormSubmissionEvidenceSchema>;
export type TrackingLookupEvidence = z.infer<typeof TrackingLookupEvidenceSchema>;
export type PickupConfirmationEvidence = z.infer<typeof PickupConfirmationEvidenceSchema>;
export type WeightTicketEvidence = z.infer<typeof WeightTicketEvidenceSchema>;
export type FailureEvidence = z.infer<typeof FailureEvidenceSchema>;


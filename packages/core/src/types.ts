/**
 * packages/core/src/types.ts
 *
 * All domain types for ReCircuit.
 * Zero network I/O — pure value types only.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

/** States a Request can be in (top-level pipeline) */
export type RequestState =
  | "DRAFT"
  | "ITEMS_PARSED"
  | "NEEDS_CLARIFICATION"
  | "RECYCLERS_DISCOVERED"
  | "POLICIES_READ"
  | "ELIGIBILITY_CHECKED"
  | "PLAN_CREATED"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "FAILED";

/** All possible states for a PlanLeg (individual recycler booking) */
export type LegState =
  | "APPROVED"
  | "SUBMITTING"
  | "NEEDS_HUMAN"
  | "REQUEST_SUBMITTED"
  | "REQUEST_CONFIRMED"
  | "PICKUP_SCHEDULED"
  | "PICKED_UP"
  | "WEIGHED"
  | "RECEIVED_AT_RECYCLER"
  | "PROCESSED"
  | "RECYCLED"
  | "CERTIFICATE_ISSUED"
  | "REJECTED"
  | "FAILED";

/** Hazard classification for items */
export type HazardClass =
  | "NON_HAZARDOUS"
  | "BATTERY"
  | "CRT"
  | "FLUORESCENT"
  | "TONER"
  | "RADIOACTIVE"
  | "UNKNOWN";

/** Item categories */
export type ItemCategory =
  | "ELECTRONICS"
  | "BATTERIES"
  | "PAPER"
  | "PLASTIC"
  | "METAL"
  | "GLASS"
  | "TEXTILES"
  | "HAZARDOUS"
  | "OTHER";

/** Recycler registration status at snapshot time */
export type RegistrationStatus = "REGISTERED" | "NOT_FOUND" | "EXPIRED" | "SUSPENDED";

/** Canonical Recycler identifiers */
export type RecyclerId = "deccan" | "paperplus" | "quickscrap";

// ---------------------------------------------------------------------------
// Evidence types
// ---------------------------------------------------------------------------

/** Evidence that a recycler policy was actually read from a live session */
export interface PolicyExtractEvidence {
  url: string;
  screenshotRef: string;
  extractedAt: string; // ISO 8601
  sessionId: string;
}

/** Evidence that a plan was created and is ready for approval */
export interface PlanEvidence {
  planId: string;
  planHash: string;
  approvalReason: string;
}

/** Evidence that the user approved a specific plan hash */
export interface UserApprovalEvidence {
  approvalId: string;
  planHash: string; // must match the current plan's hash
}

/** Evidence used to gate SUBMITTING: idempotency key must not yet have been used successfully */
export interface IdempotencyEvidence {
  idempotencyKey: string;
  priorSuccessfulUse: false; // must be false
}

/** Evidence that human verification was detected during automation */
export interface HumanVerificationEvidence {
  screenshotRef: string;
  liveViewUrl: string;
}

/** Evidence that a form was submitted to a recycler portal */
export interface FormSubmissionEvidence {
  screenshotRef: string;
  url: string;
  bookingReference: string;
}

/** Evidence from an independent tracking lookup confirming the submission */
export interface TrackingLookupEvidence {
  bookingReference: string; // must equal FormSubmissionEvidence.bookingReference
  sessionId: string;        // must differ from the submitting session
  slot?: string;            // present only for PICKUP_SCHEDULED
}

/** Simulated downstream evidence for PICKED_UP */
export interface PickupConfirmationEvidence {
  otpOrQrCode: string;
  confirmedAt: string; // ISO 8601
}

/** Simulated downstream evidence for WEIGHED */
export interface WeightTicketEvidence {
  weightKg: number;
  ticketRef: string;
  weighedAt: string; // ISO 8601
}

/** Generic failure evidence (used for any -> FAILED transitions) */
export interface FailureEvidence {
  errorCode: string;
  message: string;
  observedAt: string; // ISO 8601
  reason?: string;
  details?: string;
  screenshotRef?: string;
}

/** Evidence that the user made an approval decision (e.g. rejected/declined) */
export interface UserDecisionEvidence {
  decision: string;
  reason?: string;
  decidedAt: string; // ISO 8601
}

/** Union of all evidence types */
export type Evidence =
  | PolicyExtractEvidence
  | PlanEvidence
  | UserApprovalEvidence
  | UserDecisionEvidence
  | IdempotencyEvidence
  | HumanVerificationEvidence
  | FormSubmissionEvidence
  | TrackingLookupEvidence
  | PickupConfirmationEvidence
  | WeightTicketEvidence
  | FailureEvidence;

// ---------------------------------------------------------------------------
// Core domain models
// ---------------------------------------------------------------------------

export interface Item {
  id: string;
  requestId: string;
  category: ItemCategory;
  description: string;
  quantity: number;
  estimatedWeightKg: number;
  confidence: number; // 0–1, LLM parse confidence
  hazardClass: HazardClass;
  createdAt: string;
}

export interface Recycler {
  id: string;
  name: string;
  website: string;
  portalUrl: string;
  registrationStatus: RegistrationStatus;
  snapshotDate: string; // ISO 8601 date
  note?: string;
  createdAt: string;
}

export interface RecyclerPolicy {
  id: string;
  recyclerId: string;
  acceptedCategories: ItemCategory[];
  rejectedCategories: ItemCategory[];
  maxWeightKg?: number;
  feePerKg?: number;
  payoutPerKg?: number;
  termsUrl: string;
  evidence: PolicyExtractEvidence;
  createdAt: string;
}

export interface PlanLegItem {
  id: string;
  category?: ItemCategory;
  description?: string;
  quantity?: number;
  estimatedWeightKg?: number;
}

export interface PlanLeg {
  id: string;
  planId: string;
  recyclerId: string;
  recyclerName: string;
  itemIds: string[];
  items?: PlanLegItem[];
  slot?: string;
  estimatedFee: number;
  estimatedPayout: number;
  state: LegState;
  /** The session that submitted the booking form (set on SUBMITTING) */
  submittingSessionId?: string;
  /** The booking reference returned after form submission */
  bookingReference?: string;
  /** Idempotency key for this submission attempt */
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlotPreference {
  day: string; // 'earliest' | 'YYYY-MM-DD'
  window: "morning" | "afternoon" | "any";
}

export interface Plan {
  id: string;
  requestId: string;
  legs: PlanLeg[];
  totalEstimatedFee: number;
  totalEstimatedPayout: number;
  slotPreference?: SlotPreference;
  /** sha256 hex over canonical JSON of legs + fees + slotPreference */
  planHash: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  requestId: string;
  planId: string;
  planHash: string;
  decision?: "approved" | "rejected";
  approvedBy: string; // user id or "system"
  approvedAt: string;
  slotPreference?: SlotPreference;
}

export interface Request {
  id: string;
  userId: string;
  description: string;
  state: RequestState;
  feeCapInr?: number; // Integer rupees
  slotPreference?: SlotPreference;
  items: Item[];
  createdAt: string;
  updatedAt: string;
}

export interface BrowserAction {
  id: string;
  legId: string;
  actionType: string;
  idempotencyKey: string;
  sessionId: string;
  url: string;
  screenshotRef?: string;
  result: "success" | "failure" | "pending";
  payload?: unknown;
  createdAt: string;
}

export interface StatusEvent {
  id: string;
  legId?: string;
  requestId?: string;
  previousState: LegState | RequestState;
  newState: LegState | RequestState;
  evidenceType: string;
  evidenceReference: string; // e.g. screenshot ref, URL, booking ref
  observedAt: string; // ISO 8601
}

export interface TestRun {
  id: string;
  testCase: string;
  status: "PASS" | "FAIL" | "RUNNING";
  detail: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class TransitionError extends Error {
  constructor(
    public readonly from: LegState | RequestState,
    public readonly to: LegState | RequestState,
    public readonly reason: string
  ) {
    super(`Cannot transition ${from} -> ${to}: ${reason}`);
    this.name = "TransitionError";
  }
}


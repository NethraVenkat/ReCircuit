/**
 * packages/core/src/index.ts
 *
 * Public surface of @recircuit/core.
 * All exports are re-exported from sub-modules so consumers
 * can import from "@recircuit/core" directly.
 */

// Domain types
export type {
  RequestState,
  LegState,
  HazardClass,
  ItemCategory,
  RegistrationStatus,
  RecyclerId,
  Item,
  Recycler,
  RecyclerPolicy,
  PlanLeg,
  Plan,
  Approval,
  Request,
  SlotPreference,
  BrowserAction,
  StatusEvent,
  TestRun,
  Evidence,
  PolicyExtractEvidence,
  PlanEvidence,
  UserApprovalEvidence,
  IdempotencyEvidence,
  HumanVerificationEvidence,
  FormSubmissionEvidence,
  TrackingLookupEvidence,
  PickupConfirmationEvidence,
  WeightTicketEvidence,
  FailureEvidence,
  UserDecisionEvidence,
} from "./types.js";

export { TransitionError } from "./types.js";

// Zod schemas
export {
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

// State machine
export {
  TRANSITIONS,
  REQUEST_TRANSITIONS,
  LEG_TRANSITIONS,
  TERMINAL_STATES,
  EVIDENCE_REQUIRED,
  canTransition,
  canTransitionRequest,
  canTransitionLeg,
  transitionState,
  isCollected,
  hashPlan,
  makeIdempotencyKey,
} from "./state-machine.js";

export type { TransitionCheck, TransitionCheckOk, TransitionCheckFail, TransitionDeps, EvidenceRequirement } from "./state-machine.js";

// Intake & Taxonomy
export * from "./intake/index.js";

// Policy Discovery & Extraction
export * from "./policy/index.js";

// Stage 5: Routing & Pricing
export * from "./routing/index.js";

// Stage 6: Approval Gate & Safe Action System
export type { ApprovalReason } from "./approval/types.js";
export * from "./approval/index.js";



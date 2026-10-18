/**
 * packages/core/src/state-machine.test.ts
 *
 * Vitest tests for the ReRoute state machine (Request pipeline + Leg lifecycle).
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import {
  canTransition,
  transitionState,
  isCollected,
  hashPlan,
  makeIdempotencyKey,
  TRANSITIONS,
  REQUEST_TRANSITIONS,
  LEG_TRANSITIONS,
  TERMINAL_STATES,
  EVIDENCE_REQUIRED,
} from "./state-machine.js";
import { TransitionError } from "./types.js";
import type { PlanLeg, Request, Plan, RequestState, LegState } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLeg(state: LegState = "APPROVED"): PlanLeg {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    planId: randomUUID(),
    recyclerId: randomUUID(),
    recyclerName: "Deccan E-Cycle",
    itemIds: [randomUUID()],
    estimatedFee: 0,
    estimatedPayout: 50,
    state,
    createdAt: now,
    updatedAt: now,
  };
}

function makeRequest(state: RequestState = "DRAFT"): Request {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    userId: "user-123",
    description: "Recycle old Dell laptop",
    state,
    feeCapInr: 200, // INR integer rupees
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

const PLAN_HASH_A = "a".repeat(64);
const PLAN_HASH_B = "b".repeat(64);
const SESSION_SUBMIT = "session-submit-001";
const SESSION_VERIFY = "session-verify-002";
const BOOKING_REF = "DEC-12345";

const idempotencyEvidence = {
  idempotencyKey: "ikey-001",
  priorSuccessfulUse: false as const,
};

const humanVerificationEvidence = {
  screenshotRef: "screenshot://human-captcha.png",
  liveViewUrl: "https://browserbase.io/sessions/abc",
};

const formSubmissionEvidence = {
  screenshotRef: "screenshot://submitted.png",
  url: "https://deccan-ecycle.example.com/book",
  bookingReference: BOOKING_REF,
};

const trackingLookupEvidence = {
  bookingReference: BOOKING_REF,
  sessionId: SESSION_VERIFY,
};

const trackingLookupWithSlotEvidence = {
  bookingReference: BOOKING_REF,
  sessionId: SESSION_VERIFY,
  slot: "2026-11-01T10:00:00+05:30",
};

const pickupConfirmationEvidence = {
  otpOrQrCode: "OTP-987654",
  confirmedAt: new Date().toISOString(),
};

const weightTicketEvidence = {
  weightKg: 4.5,
  ticketRef: "WT-2026-001",
  weighedAt: new Date().toISOString(),
};

const failureEvidence = {
  errorCode: "ERR_PORTAL_500",
  message: "Portal returned 500 internal server error",
  observedAt: new Date().toISOString(),
  reason: "Portal 500",
};

const policyExtractEvidence = {
  url: "https://deccan-ecycle.example.com/policy",
  screenshotRef: "screenshot://policy-extract.png",
  extractedAt: new Date().toISOString(),
  sessionId: "session-policy-01",
};

const planEvidence = {
  planId: randomUUID(),
  planHash: PLAN_HASH_A,
  approvalReason: "Fee cap satisfied",
};

const userApprovalEvidence = {
  approvalId: randomUUID(),
  planHash: PLAN_HASH_A,
};

const userDecisionEvidence = {
  decision: "declined",
  reason: "User rejected fee",
  decidedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Transition Tables Sanity
// ---------------------------------------------------------------------------

describe("State Machine Transition Tables", () => {
  it("contains all expected Request pipeline transitions", () => {
    const expected = [
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
    ];
    for (const t of expected) {
      expect(REQUEST_TRANSITIONS.has(t), `Missing request transition: ${t}`).toBe(true);
      expect(TRANSITIONS.has(t)).toBe(true);
    }
  });

  it("contains all expected Leg lifecycle transitions", () => {
    const expected = [
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
    ];
    for (const t of expected) {
      expect(LEG_TRANSITIONS.has(t), `Missing leg transition: ${t}`).toBe(true);
      expect(TRANSITIONS.has(t)).toBe(true);
    }
  });

  it("contains terminal states", () => {
    expect(TERMINAL_STATES.has("CERTIFICATE_ISSUED")).toBe(true);
    expect(TERMINAL_STATES.has("REJECTED")).toBe(true);
    expect(TERMINAL_STATES.has("FAILED")).toBe(true);
  });

  it("maps evidence requirements correctly", () => {
    expect(EVIDENCE_REQUIRED["POLICIES_READ"]).toBe("policy_extract");
    expect(EVIDENCE_REQUIRED["PLAN_CREATED"]).toBe("plan");
    expect(EVIDENCE_REQUIRED["AWAITING_APPROVAL"]).toBe("plan");
    expect(EVIDENCE_REQUIRED["APPROVED"]).toBe("user_approval");
    expect(EVIDENCE_REQUIRED["SUBMITTING"]).toBe("idempotency_key");
    expect(EVIDENCE_REQUIRED["NEEDS_HUMAN"]).toBe("human_verification");
    expect(EVIDENCE_REQUIRED["REQUEST_SUBMITTED"]).toBe("form_submission");
    expect(EVIDENCE_REQUIRED["REQUEST_CONFIRMED"]).toBe("tracking_lookup");
    expect(EVIDENCE_REQUIRED["PICKUP_SCHEDULED"]).toBe("tracking_lookup_with_slot");
    expect(EVIDENCE_REQUIRED["PICKED_UP"]).toBe("pickup_confirmation");
    expect(EVIDENCE_REQUIRED["WEIGHED"]).toBe("weight_ticket");
    expect(EVIDENCE_REQUIRED["FAILED"]).toBe("failure");
  });
});

// ---------------------------------------------------------------------------
// Explicit Missing & Malformed Evidence Tests (Every Evidence-Required Transition)
// ---------------------------------------------------------------------------

describe("Missing and Malformed Evidence Enforcement", () => {
  // 1. POLICIES_READ -> requires policy_extract
  it("POLICIES_READ fails when evidence is missing", () => {
    const res = canTransition("RECYCLERS_DISCOVERED", "POLICIES_READ", {});
    expect(res.ok).toBe(false);
  });

  it("POLICIES_READ fails when policy_extract evidence is malformed (missing screenshotRef)", () => {
    const res = canTransition("RECYCLERS_DISCOVERED", "POLICIES_READ", {
      url: "https://example.com",
      extractedAt: new Date().toISOString(),
      sessionId: "sess-1",
    });
    expect(res.ok).toBe(false);
  });

  // 2. PLAN_CREATED -> requires plan
  it("PLAN_CREATED fails when evidence is missing", () => {
    const res = canTransition("ELIGIBILITY_CHECKED", "PLAN_CREATED", {});
    expect(res.ok).toBe(false);
  });

  it("PLAN_CREATED fails when plan evidence is malformed (missing planHash)", () => {
    const res = canTransition("ELIGIBILITY_CHECKED", "PLAN_CREATED", {
      planId: randomUUID(),
      approvalReason: "All good",
    });
    expect(res.ok).toBe(false);
  });

  // 3. AWAITING_APPROVAL -> requires plan
  it("AWAITING_APPROVAL fails when evidence is missing", () => {
    const res = canTransition("PLAN_CREATED", "AWAITING_APPROVAL", {});
    expect(res.ok).toBe(false);
  });

  it("AWAITING_APPROVAL fails when plan evidence is malformed (missing planId)", () => {
    const res = canTransition("PLAN_CREATED", "AWAITING_APPROVAL", {
      planHash: PLAN_HASH_A,
    });
    expect(res.ok).toBe(false);
  });

  // 4. APPROVED -> requires user_approval
  it("APPROVED fails when evidence is missing", () => {
    const res = canTransition("AWAITING_APPROVAL", "APPROVED", {});
    expect(res.ok).toBe(false);
  });

  it("APPROVED fails when user_approval evidence is malformed (missing approvalId)", () => {
    const res = canTransition("AWAITING_APPROVAL", "APPROVED", {
      planHash: PLAN_HASH_A,
    }, { currentPlanHash: PLAN_HASH_A });
    expect(res.ok).toBe(false);
  });

  // 5. SUBMITTING -> requires idempotency_key
  it("SUBMITTING fails when evidence is missing", () => {
    const res = canTransition("APPROVED", "SUBMITTING", {});
    expect(res.ok).toBe(false);
  });

  it("SUBMITTING fails when idempotency_key evidence is malformed (empty key)", () => {
    const res = canTransition("APPROVED", "SUBMITTING", {
      idempotencyKey: "",
      priorSuccessfulUse: false,
    });
    expect(res.ok).toBe(false);
  });

  // 6. NEEDS_HUMAN -> requires human_verification
  it("NEEDS_HUMAN fails when evidence is missing", () => {
    const res = canTransition("SUBMITTING", "NEEDS_HUMAN", {});
    expect(res.ok).toBe(false);
  });

  it("NEEDS_HUMAN fails when human_verification evidence is malformed (missing screenshotRef)", () => {
    const res = canTransition("SUBMITTING", "NEEDS_HUMAN", {
      liveViewUrl: "https://browserbase.io/abc",
    });
    expect(res.ok).toBe(false);
  });

  // 7. REQUEST_SUBMITTED -> requires form_submission
  it("REQUEST_SUBMITTED fails when evidence is missing", () => {
    const res = canTransition("SUBMITTING", "REQUEST_SUBMITTED", {});
    expect(res.ok).toBe(false);
  });

  it("REQUEST_SUBMITTED fails when form_submission evidence is malformed (missing bookingReference)", () => {
    const res = canTransition("SUBMITTING", "REQUEST_SUBMITTED", {
      url: "https://example.com/book",
      screenshotRef: "screenshot://submitted.png",
    });
    expect(res.ok).toBe(false);
  });

  // 8. REQUEST_CONFIRMED -> requires tracking_lookup
  it("REQUEST_CONFIRMED fails when evidence is missing", () => {
    const res = canTransition("REQUEST_SUBMITTED", "REQUEST_CONFIRMED", {});
    expect(res.ok).toBe(false);
  });

  it("REQUEST_CONFIRMED fails when tracking_lookup evidence is malformed (missing sessionId)", () => {
    const res = canTransition("REQUEST_SUBMITTED", "REQUEST_CONFIRMED", {
      bookingReference: BOOKING_REF,
    }, { submittingSessionId: SESSION_SUBMIT, submittedBookingReference: BOOKING_REF });
    expect(res.ok).toBe(false);
  });

  // 9. PICKUP_SCHEDULED -> requires tracking_lookup_with_slot
  it("PICKUP_SCHEDULED fails when evidence is missing", () => {
    const res = canTransition("REQUEST_CONFIRMED", "PICKUP_SCHEDULED", {});
    expect(res.ok).toBe(false);
  });

  it("PICKUP_SCHEDULED fails when tracking_lookup_with_slot evidence is malformed (missing slot)", () => {
    const res = canTransition("REQUEST_CONFIRMED", "PICKUP_SCHEDULED", {
      bookingReference: BOOKING_REF,
      sessionId: SESSION_VERIFY,
    });
    expect(res.ok).toBe(false);
  });

  // 10. PICKED_UP -> requires pickup_confirmation
  it("PICKED_UP fails when evidence is missing", () => {
    const res = canTransition("PICKUP_SCHEDULED", "PICKED_UP", {});
    expect(res.ok).toBe(false);
  });

  it("PICKED_UP fails when pickup_confirmation evidence is malformed (missing otpOrQrCode)", () => {
    const res = canTransition("PICKUP_SCHEDULED", "PICKED_UP", {
      confirmedAt: new Date().toISOString(),
    });
    expect(res.ok).toBe(false);
  });

  // 11. WEIGHED -> requires weight_ticket
  it("WEIGHED fails when evidence is missing", () => {
    const res = canTransition("PICKED_UP", "WEIGHED", {});
    expect(res.ok).toBe(false);
  });

  it("WEIGHED fails when weight_ticket evidence is malformed (negative weight)", () => {
    const res = canTransition("PICKED_UP", "WEIGHED", {
      weightKg: -5,
      ticketRef: "WT-001",
      weighedAt: new Date().toISOString(),
    });
    expect(res.ok).toBe(false);
  });

  // 12. FAILED -> requires failure evidence
  it("FAILED fails when evidence is missing", () => {
    const res = canTransition("SUBMITTING", "FAILED", {});
    expect(res.ok).toBe(false);
  });

  it("FAILED fails when failure evidence is malformed (missing message)", () => {
    const res = canTransition("SUBMITTING", "FAILED", {
      errorCode: "ERR_TIMEOUT",
      observedAt: new Date().toISOString(),
    });
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Portal Rejection Transitions
// ---------------------------------------------------------------------------

describe("Portal Rejection Transitions", () => {
  const rejectionDecisionEvidence = {
    decision: "declined",
    reason: "Center does not service this address",
    decidedAt: new Date().toISOString(),
  };
  const rejectionFailureEvidence = {
    errorCode: "PORTAL_REJECTED",
    message: "Center rejected order",
    observedAt: new Date().toISOString(),
  };

  it("SUBMITTING -> REJECTED succeeds with decision evidence", () => {
    const leg = makeLeg("SUBMITTING");
    const { newLeg } = transitionState(leg, "REJECTED", rejectionDecisionEvidence);
    expect(newLeg.state).toBe("REJECTED");
  });

  it("SUBMITTING -> REJECTED fails without evidence", () => {
    const res = canTransition("SUBMITTING", "REJECTED", {});
    expect(res.ok).toBe(false);
  });

  it("REQUEST_SUBMITTED -> REJECTED succeeds with failure evidence", () => {
    const leg = makeLeg("REQUEST_SUBMITTED");
    const { newLeg } = transitionState(leg, "REJECTED", rejectionFailureEvidence);
    expect(newLeg.state).toBe("REJECTED");
  });

  it("REQUEST_SUBMITTED -> REJECTED fails without evidence", () => {
    const res = canTransition("REQUEST_SUBMITTED", "REJECTED", {});
    expect(res.ok).toBe(false);
  });

  it("REQUEST_CONFIRMED -> REJECTED succeeds with decision evidence", () => {
    const leg = makeLeg("REQUEST_CONFIRMED");
    const { newLeg } = transitionState(leg, "REJECTED", rejectionDecisionEvidence);
    expect(newLeg.state).toBe("REJECTED");
  });

  it("REQUEST_CONFIRMED -> REJECTED fails without evidence", () => {
    const res = canTransition("REQUEST_CONFIRMED", "REJECTED", {});
    expect(res.ok).toBe(false);
  });

  it("NEEDS_HUMAN -> REJECTED succeeds with failure evidence", () => {
    const leg = makeLeg("NEEDS_HUMAN");
    const { newLeg } = transitionState(leg, "REJECTED", rejectionFailureEvidence);
    expect(newLeg.state).toBe("REJECTED");
  });

  it("NEEDS_HUMAN -> REJECTED fails without evidence", () => {
    const res = canTransition("NEEDS_HUMAN", "REJECTED", {});
    expect(res.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Request Pipeline Tests
// ---------------------------------------------------------------------------

describe("Request Pipeline Transitions", () => {
  it("DRAFT -> ITEMS_PARSED works and returns an audit event", () => {
    const req = makeRequest("DRAFT");
    const { newRequest, auditEvent } = transitionState(req, "ITEMS_PARSED", {});
    expect(newRequest.state).toBe("ITEMS_PARSED");
    expect(auditEvent.previousState).toBe("DRAFT");
    expect(auditEvent.newState).toBe("ITEMS_PARSED");
    expect(auditEvent.requestId).toBe(req.id);
  });

  it("ITEMS_PARSED -> NEEDS_CLARIFICATION works", () => {
    const req = makeRequest("ITEMS_PARSED");
    const { newRequest } = transitionState(req, "NEEDS_CLARIFICATION", {});
    expect(newRequest.state).toBe("NEEDS_CLARIFICATION");
  });

  it("NEEDS_CLARIFICATION -> ITEMS_PARSED works (loopback)", () => {
    const req = makeRequest("NEEDS_CLARIFICATION");
    const { newRequest } = transitionState(req, "ITEMS_PARSED", {});
    expect(newRequest.state).toBe("ITEMS_PARSED");
  });

  it("ITEMS_PARSED -> RECYCLERS_DISCOVERED works", () => {
    const req = makeRequest("ITEMS_PARSED");
    const { newRequest } = transitionState(req, "RECYCLERS_DISCOVERED", {});
    expect(newRequest.state).toBe("RECYCLERS_DISCOVERED");
  });

  it("RECYCLERS_DISCOVERED -> POLICIES_READ requires policy extract evidence", () => {
    const req = makeRequest("RECYCLERS_DISCOVERED");
    expect(canTransition("RECYCLERS_DISCOVERED", "POLICIES_READ", {}).ok).toBe(false);

    const { newRequest, auditEvent } = transitionState(req, "POLICIES_READ", policyExtractEvidence);
    expect(newRequest.state).toBe("POLICIES_READ");
    expect(auditEvent.evidenceType).toBe("policy_extract");
  });

  it("POLICIES_READ -> ELIGIBILITY_CHECKED works", () => {
    const req = makeRequest("POLICIES_READ");
    const { newRequest } = transitionState(req, "ELIGIBILITY_CHECKED", {});
    expect(newRequest.state).toBe("ELIGIBILITY_CHECKED");
  });

  it("ELIGIBILITY_CHECKED -> PLAN_CREATED requires plan evidence", () => {
    const req = makeRequest("ELIGIBILITY_CHECKED");
    expect(canTransition("ELIGIBILITY_CHECKED", "PLAN_CREATED", {}).ok).toBe(false);

    const { newRequest, auditEvent } = transitionState(req, "PLAN_CREATED", planEvidence);
    expect(newRequest.state).toBe("PLAN_CREATED");
    expect(auditEvent.evidenceType).toBe("plan");
  });

  it("PLAN_CREATED -> PLAN_CREATED is explicitly disallowed (a changed plan is a new plan version)", () => {
    const check = canTransition("PLAN_CREATED", "PLAN_CREATED", planEvidence);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toMatch(/self-transition/i);
    }
  });

  it("PLAN_CREATED -> AWAITING_APPROVAL works with plan evidence", () => {
    const req = makeRequest("PLAN_CREATED");
    const { newRequest } = transitionState(req, "AWAITING_APPROVAL", planEvidence);
    expect(newRequest.state).toBe("AWAITING_APPROVAL");
  });

  it("AWAITING_APPROVAL -> APPROVED works with matching plan hash", () => {
    const req = makeRequest("AWAITING_APPROVAL");
    const { newRequest, auditEvent } = transitionState(req, "APPROVED", userApprovalEvidence, {
      currentPlanHash: PLAN_HASH_A,
    });
    expect(newRequest.state).toBe("APPROVED");
    expect(auditEvent.evidenceType).toBe("user_approval");
  });

  it("AWAITING_APPROVAL -> REJECTED works with user decision evidence", () => {
    const req = makeRequest("AWAITING_APPROVAL");
    const { newRequest, auditEvent } = transitionState(req, "REJECTED", userDecisionEvidence);
    expect(newRequest.state).toBe("REJECTED");
    expect(auditEvent.evidenceType).toBe("user_decision");
  });

  it("AWAITING_APPROVAL -> REJECTED fails without user decision evidence", () => {
    const check = canTransition("AWAITING_APPROVAL", "REJECTED", {});
    expect(check.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stale Approval Enforcement Inside transitionState
// ---------------------------------------------------------------------------

describe("Stale Approval Enforcement Inside transitionState", () => {
  it("transitionState(-> APPROVED) throws TransitionError when user_approval.planHash differs from currentPlanHash", () => {
    const req = makeRequest("AWAITING_APPROVAL");
    const staleApproval = {
      approvalId: randomUUID(),
      planHash: PLAN_HASH_B, // different from currentPlanHash (PLAN_HASH_A)
    };

    expect(() =>
      transitionState(req, "APPROVED", staleApproval, { currentPlanHash: PLAN_HASH_A })
    ).toThrow(TransitionError);

    try {
      transitionState(req, "APPROVED", staleApproval, { currentPlanHash: PLAN_HASH_A });
    } catch (err) {
      expect(err).toBeInstanceOf(TransitionError);
      expect((err as TransitionError).reason).toMatch(/Stale approval rejected/i);
    }
  });

  it("canTransition(AWAITING_APPROVAL, APPROVED) fails with stale planHash", () => {
    const staleApproval = { approvalId: randomUUID(), planHash: PLAN_HASH_B };
    const check = canTransition("AWAITING_APPROVAL", "APPROVED", staleApproval, {
      currentPlanHash: PLAN_HASH_A,
    });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toMatch(/Stale approval rejected/i);
    }
  });

  it("canTransition(AWAITING_APPROVAL, APPROVED) passes with matching planHash", () => {
    const matchingApproval = { approvalId: randomUUID(), planHash: PLAN_HASH_A };
    const check = canTransition("AWAITING_APPROVAL", "APPROVED", matchingApproval, {
      currentPlanHash: PLAN_HASH_A,
    });
    expect(check.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Full Valid Path: Leg APPROVED -> CERTIFICATE_ISSUED
// ---------------------------------------------------------------------------

describe("Leg Lifecycle Full Valid Path", () => {
  it("walks the full happy path with correct evidence and returns audit events", () => {
    let leg = makeLeg("APPROVED");
    const usedKeys = new Set<string>();

    // Step 1: APPROVED -> SUBMITTING
    const r1 = transitionState(leg, "SUBMITTING", idempotencyEvidence, {
      usedIdempotencyKeys: usedKeys,
    });
    expect(r1.newLeg.state).toBe("SUBMITTING");
    expect(r1.auditEvent.previousState).toBe("APPROVED");
    expect(r1.auditEvent.newState).toBe("SUBMITTING");
    leg = r1.newLeg;

    // Step 2: SUBMITTING -> NEEDS_HUMAN (CAPTCHA detected)
    const r2 = transitionState(leg, "NEEDS_HUMAN", humanVerificationEvidence);
    expect(r2.newLeg.state).toBe("NEEDS_HUMAN");
    leg = r2.newLeg;

    // Step 3: NEEDS_HUMAN -> SUBMITTING (resolved)
    const r3 = transitionState(leg, "SUBMITTING", idempotencyEvidence);
    expect(r3.newLeg.state).toBe("SUBMITTING");
    leg = r3.newLeg;

    // Step 4: SUBMITTING -> REQUEST_SUBMITTED
    const r4 = transitionState(leg, "REQUEST_SUBMITTED", formSubmissionEvidence);
    expect(r4.newLeg.state).toBe("REQUEST_SUBMITTED");
    expect(r4.newLeg.bookingReference).toBe(BOOKING_REF);
    leg = r4.newLeg;

    // Step 5: REQUEST_SUBMITTED -> REQUEST_CONFIRMED (independent session)
    const r5 = transitionState(leg, "REQUEST_CONFIRMED", trackingLookupEvidence, {
      submittingSessionId: SESSION_SUBMIT,
      submittedBookingReference: BOOKING_REF,
    });
    expect(r5.newLeg.state).toBe("REQUEST_CONFIRMED");
    leg = r5.newLeg;

    // Step 6: REQUEST_CONFIRMED -> PICKUP_SCHEDULED
    const r6 = transitionState(leg, "PICKUP_SCHEDULED", trackingLookupWithSlotEvidence);
    expect(r6.newLeg.state).toBe("PICKUP_SCHEDULED");
    leg = r6.newLeg;

    // Step 7: PICKUP_SCHEDULED -> PICKED_UP
    const r7 = transitionState(leg, "PICKED_UP", pickupConfirmationEvidence);
    expect(r7.newLeg.state).toBe("PICKED_UP");
    expect(r7.auditEvent.evidenceType).toBe("pickup_confirmation");
    leg = r7.newLeg;

    // Step 8: PICKED_UP -> WEIGHED
    const r8 = transitionState(leg, "WEIGHED", weightTicketEvidence);
    expect(r8.newLeg.state).toBe("WEIGHED");
    expect(r8.auditEvent.evidenceType).toBe("weight_ticket");
    leg = r8.newLeg;

    // Step 9: WEIGHED -> RECEIVED_AT_RECYCLER
    const r9 = transitionState(leg, "RECEIVED_AT_RECYCLER", {});
    expect(r9.newLeg.state).toBe("RECEIVED_AT_RECYCLER");
    leg = r9.newLeg;

    // Step 10: RECEIVED_AT_RECYCLER -> PROCESSED
    const r10 = transitionState(leg, "PROCESSED", {});
    expect(r10.newLeg.state).toBe("PROCESSED");
    leg = r10.newLeg;

    // Step 11: PROCESSED -> RECYCLED
    const r11 = transitionState(leg, "RECYCLED", {});
    expect(r11.newLeg.state).toBe("RECYCLED");
    leg = r11.newLeg;

    // Step 12: RECYCLED -> CERTIFICATE_ISSUED
    const r12 = transitionState(leg, "CERTIFICATE_ISSUED", {});
    expect(r12.newLeg.state).toBe("CERTIFICATE_ISSUED");
    expect(r12.auditEvent.newState).toBe("CERTIFICATE_ISSUED");
  });
});

// ---------------------------------------------------------------------------
// No Exit From Terminal States
// ---------------------------------------------------------------------------

describe("No Exit From Terminal States", () => {
  const terminalStates: (LegState | RequestState)[] = ["CERTIFICATE_ISSUED", "REJECTED", "FAILED"];
  const allTargetStates: (LegState | RequestState)[] = [
    "DRAFT", "ITEMS_PARSED", "APPROVED", "SUBMITTING", "REQUEST_SUBMITTED",
    "REQUEST_CONFIRMED", "PICKUP_SCHEDULED", "PICKED_UP", "WEIGHED",
    "RECEIVED_AT_RECYCLER", "PROCESSED", "RECYCLED", "CERTIFICATE_ISSUED",
    "REJECTED", "FAILED"
  ];

  for (const term of terminalStates) {
    it(`refuses all transitions out of terminal state "${term}" (including to FAILED)`, () => {
      for (const target of allTargetStates) {
        const check = canTransition(term, target, failureEvidence);
        expect(check.ok).toBe(false);
        if (!check.ok) {
          expect(check.reason).toMatch(/Cannot transition out of terminal state/i);
        }
      }
    });

    it(`transitionState throws when starting from terminal state "${term}"`, () => {
      const leg = makeLeg(term as LegState);
      expect(() => transitionState(leg, "FAILED", failureEvidence)).toThrow(TransitionError);
    });
  }
});

// ---------------------------------------------------------------------------
// -> FAILED Transitions and Failure Evidence
// ---------------------------------------------------------------------------

describe("-> FAILED Transitions and Failure Evidence", () => {
  it("requires errorCode, message, observedAt in FailureEvidence", () => {
    // Missing required fields
    expect(canTransition("SUBMITTING", "FAILED", {}).ok).toBe(false);
    expect(canTransition("SUBMITTING", "FAILED", { reason: "Something failed" }).ok).toBe(false);
    expect(canTransition("SUBMITTING", "FAILED", { errorCode: "ERR_1" }).ok).toBe(false);
    expect(canTransition("SUBMITTING", "FAILED", { errorCode: "ERR_1", message: "fail" }).ok).toBe(false);

    // Complete failure evidence passes
    const check = canTransition("SUBMITTING", "FAILED", failureEvidence);
    expect(check.ok).toBe(true);
  });

  it("allows non-terminal states to transition to FAILED with valid failure evidence", () => {
    const nonTerminalStates: LegState[] = [
      "APPROVED", "SUBMITTING", "NEEDS_HUMAN", "REQUEST_SUBMITTED",
      "REQUEST_CONFIRMED", "PICKUP_SCHEDULED", "PICKED_UP", "WEIGHED",
      "RECEIVED_AT_RECYCLER", "PROCESSED", "RECYCLED"
    ];
    for (const state of nonTerminalStates) {
      const check = canTransition(state, "FAILED", failureEvidence);
      expect(check.ok, `State ${state} should allow -> FAILED`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid Jumps
// ---------------------------------------------------------------------------

describe("Invalid Jumps", () => {
  it("rejects REQUEST_SUBMITTED -> PICKED_UP (not in table)", () => {
    const check = canTransition("REQUEST_SUBMITTED", "PICKED_UP", pickupConfirmationEvidence);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toMatch(/not in the allowed transitions table/i);
    }
  });

  it("rejects APPROVED -> REQUEST_CONFIRMED (skips intermediate steps)", () => {
    const check = canTransition("APPROVED", "REQUEST_CONFIRMED", trackingLookupEvidence);
    expect(check.ok).toBe(false);
  });

  it("transitionState throws TransitionError for invalid jumps", () => {
    const leg = makeLeg("REQUEST_SUBMITTED");
    expect(() => transitionState(leg, "PICKED_UP", pickupConfirmationEvidence)).toThrow(TransitionError);
  });
});

// ---------------------------------------------------------------------------
// Independent Session Verification
// ---------------------------------------------------------------------------

describe("REQUEST_CONFIRMED session independence and reference matching", () => {
  it("fails when verifier sessionId equals submitting sessionId", () => {
    const check = canTransition(
      "REQUEST_SUBMITTED",
      "REQUEST_CONFIRMED",
      { bookingReference: BOOKING_REF, sessionId: SESSION_SUBMIT },
      { submittingSessionId: SESSION_SUBMIT, submittedBookingReference: BOOKING_REF }
    );
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toMatch(/sessionId must differ/i);
    }
  });

  it("fails when tracked reference differs from submitted reference", () => {
    const check = canTransition(
      "REQUEST_SUBMITTED",
      "REQUEST_CONFIRMED",
      { bookingReference: "DEC-99999", sessionId: SESSION_VERIFY },
      { submittingSessionId: SESSION_SUBMIT, submittedBookingReference: BOOKING_REF }
    );
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toMatch(/does not match submitted reference/i);
    }
  });

  it("succeeds when session is independent and reference matches", () => {
    const check = canTransition(
      "REQUEST_SUBMITTED",
      "REQUEST_CONFIRMED",
      { bookingReference: BOOKING_REF, sessionId: SESSION_VERIFY },
      { submittingSessionId: SESSION_SUBMIT, submittedBookingReference: BOOKING_REF }
    );
    expect(check.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Idempotency Deduplication
// ---------------------------------------------------------------------------

describe("Idempotency Key Deduplication", () => {
  it("rejects a duplicate successful idempotency key", () => {
    const usedKeys = new Set<string>(["ikey-used"]);
    const check = canTransition("APPROVED", "SUBMITTING", {
      idempotencyKey: "ikey-used",
      priorSuccessfulUse: false,
    }, { usedIdempotencyKeys: usedKeys });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toMatch(/already been used/i);
    }
  });

  it("allows a fresh idempotency key", () => {
    const usedKeys = new Set<string>(["ikey-used"]);
    const check = canTransition("APPROVED", "SUBMITTING", {
      idempotencyKey: "ikey-fresh",
      priorSuccessfulUse: false,
    }, { usedIdempotencyKeys: usedKeys });
    expect(check.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isCollected (TC4 invariant)
// ---------------------------------------------------------------------------

describe("isCollected helper", () => {
  it("returns false for all pre-collection states", () => {
    expect(isCollected("APPROVED")).toBe(false);
    expect(isCollected("SUBMITTING")).toBe(false);
    expect(isCollected("NEEDS_HUMAN")).toBe(false);
    expect(isCollected("REQUEST_SUBMITTED")).toBe(false);
    expect(isCollected("REQUEST_CONFIRMED")).toBe(false);
    expect(isCollected("PICKUP_SCHEDULED")).toBe(false);
    expect(isCollected("REJECTED")).toBe(false);
    expect(isCollected("FAILED")).toBe(false);
  });

  it("returns true only for PICKED_UP and subsequent states", () => {
    expect(isCollected("PICKED_UP")).toBe(true);
    expect(isCollected("WEIGHED")).toBe(true);
    expect(isCollected("RECEIVED_AT_RECYCLER")).toBe(true);
    expect(isCollected("PROCESSED")).toBe(true);
    expect(isCollected("RECYCLED")).toBe(true);
    expect(isCollected("CERTIFICATE_ISSUED")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hashPlan and makeIdempotencyKey
// ---------------------------------------------------------------------------

describe("hashPlan and makeIdempotencyKey", () => {
  it("hashPlan is stable regardless of key order in legs", () => {
    const now = new Date().toISOString();
    const leg1: PlanLeg = {
      id: "leg-1",
      planId: "p-1",
      recyclerId: "r-1",
      recyclerName: "Deccan",
      itemIds: ["i-1", "i-2"],
      estimatedFee: 0,
      estimatedPayout: 250,
      state: "APPROVED",
      createdAt: now,
      updatedAt: now,
    };
    const leg2: PlanLeg = {
      id: "leg-2",
      planId: "p-1",
      recyclerId: "r-2",
      recyclerName: "PaperPlus",
      itemIds: ["i-3"],
      estimatedFee: 0,
      estimatedPayout: 96,
      state: "APPROVED",
      createdAt: now,
      updatedAt: now,
    };

    const p1: Plan = {
      id: "p-1",
      requestId: "req-1",
      legs: [leg1, leg2],
      totalEstimatedFee: 0,
      totalEstimatedPayout: 346,
      planHash: "",
      createdAt: now,
    };
    const p2: Plan = {
      ...p1,
      legs: [leg2, leg1],
    };

    expect(hashPlan(p1)).toBe(hashPlan(p2));
  });

  it("hashPlan changes when a fee changes", () => {
    const now = new Date().toISOString();
    const leg: PlanLeg = {
      id: "leg-1",
      planId: "p-1",
      recyclerId: "r-1",
      recyclerName: "Deccan",
      itemIds: ["i-1"],
      estimatedFee: 0,
      estimatedPayout: 250,
      state: "APPROVED",
      createdAt: now,
      updatedAt: now,
    };
    const p1: Plan = {
      id: "p-1",
      requestId: "req-1",
      legs: [leg],
      totalEstimatedFee: 0,
      totalEstimatedPayout: 250,
      planHash: "",
      createdAt: now,
    };
    const p2: Plan = {
      ...p1,
      legs: [{ ...leg, estimatedFee: 180 }],
      totalEstimatedFee: 180,
    };

    expect(hashPlan(p1)).not.toBe(hashPlan(p2));
  });

  it("makeIdempotencyKey generates deterministic sha256 hex", () => {
    const k1 = makeIdempotencyKey(PLAN_HASH_A, "leg-1", "r-1");
    const k2 = makeIdempotencyKey(PLAN_HASH_A, "leg-1", "r-1");
    const k3 = makeIdempotencyKey(PLAN_HASH_A, "leg-2", "r-1");
    expect(k1).toHaveLength(64);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});

// ---------------------------------------------------------------------------
// Request.feeCapInr
// ---------------------------------------------------------------------------

describe("Request model feeCapInr", () => {
  it("stores feeCapInr as integer rupees", () => {
    const req = makeRequest("DRAFT");
    expect(req.feeCapInr).toBe(200);
    expect(Number.isInteger(req.feeCapInr)).toBe(true);
  });
});

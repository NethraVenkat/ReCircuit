/**
 * packages/core/src/approval/approval.test.ts
 *
 * Comprehensive Vitest suite for Stage 6: Approval Gate & Safe Action System.
 * Tests cover all 10 mandated scenarios and safety invariants.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import type { Plan, PlanLeg, Request } from "../types.js";
import { hashPlan, transitionState } from "../state-machine.js";
import {
  computeApprovalReasons,
  buildApprovalCard,
  formatApprovalCard,
  requestApproval,
  recordDecision,
  DEFAULT_SLOT_PREFERENCE,
} from "./approval-service.js";
import {
  assertActionAllowed,
  clearActionLogs,
  getActionLogEntries,
  SafeActionBlockedError,
  FeeChangedReapprovalRequiredError,
} from "./safe-action.js";

function createMockRequest(overrides?: Partial<Request>): Request {
  return {
    id: "req-" + randomUUID().slice(0, 8),
    userId: "user-123",
    description: "Recycling test request",
    state: "PLAN_CREATED",
    feeCapInr: 200,
    items: [
      {
        id: "item-1",
        requestId: "req-1",
        description: "Old Laptop",
        category: "ELECTRONICS",
        hazardClass: "NON_HAZARDOUS",
        quantity: 1,
        estimatedWeightKg: 2.2,
        confidence: 0.95,
        createdAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockPlan(requestId: string, overrides?: Partial<Plan>): Plan {
  const legs: PlanLeg[] = [
    {
      id: "leg-1",
      planId: "plan-1",
      recyclerId: "deccan",
      recyclerName: "Deccan E-Cycle Solutions",
      state: "APPROVED",
      estimatedFee: 180,
      estimatedPayout: 250,
      itemIds: ["item-1"],
      items: [
        {
          id: "item-1",
          description: "Dell Laptop",
          quantity: 1,
          estimatedWeightKg: 2.2,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const planBase: Plan = {
    id: randomUUID(),
    requestId,
    legs,
    totalEstimatedFee: 180,
    totalEstimatedPayout: 250,
    planHash: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  };

  planBase.planHash = hashPlan(planBase);
  return planBase;
}

describe("Stage 6: Approval Gate & Safe Action System", () => {
  it.each([
    ["legs", (p: Plan): void => { p.legs[0]!.recyclerId = "paperplus"; }],
    ["items", (p: Plan): void => { p.legs[0]!.items![0]!.quantity = 7; }],
    ["fees", (p: Plan): void => { p.legs[0]!.estimatedFee = 181; }],
    ["payouts", (p: Plan): void => { p.legs[0]!.estimatedPayout = 251; }],
    ["slotPreference", (p: Plan): void => { p.slotPreference = { day: "tomorrow", window: "afternoon" }; }],
    ["dataWipeConfirmedByUser", (p: Plan): void => { p.dataWipeConfirmedByUser = false; }],
  ] as const)("rejects changed %s even with an unchanged cached hash", (_field, mutate) => {
    const request = createMockRequest();
    const approved = recordDecision({
      request: { ...request, state: "AWAITING_APPROVAL" },
      plan: createMockPlan(request.id),
      decision: "approved", decidedBy: "user", dataWipeConfirmedByUser: true,
    });
    const altered = structuredClone(approved.plan);
    mutate(altered);
    expect(altered.planHash).toBe(approved.plan.planHash);
    expect(hashPlan(altered)).not.toBe(approved.plan.planHash);
    expect(() => assertActionAllowed({
      leg: approved.legs[0]!, plan: altered, approval: approved.decisionRecord,
      action: "submit_booking", observedFeeInr: 180,
    })).toThrow(/stale approval/i);
  });

  beforeEach(() => {
    clearActionLogs();
  });

  // Scenario 1: Clean plan within fee cap still requires approval (BOOKING_SUBMISSION)
  it("Scenario 1: clean plan within fee cap still requires approval (BOOKING_SUBMISSION)", () => {
    const request = createMockRequest({ feeCapInr: 200 });
    const plan = createMockPlan(request.id, { totalEstimatedFee: 100 });

    const reasons = computeApprovalReasons({
      request,
      plan,
      legRecyclerIds: ["deccan"],
    });

    expect(reasons).toContain("BOOKING_SUBMISSION");
    expect(reasons).not.toContain("FEE_CAP_EXCEEDED");
    // Even if fee is 0, BOOKING_SUBMISSION is always present
    const freePlan = createMockPlan(request.id, { totalEstimatedFee: 0 });
    const freeReasons = computeApprovalReasons({
      request,
      plan: freePlan,
      legRecyclerIds: ["deccan"],
    });
    expect(freeReasons).toEqual(["BOOKING_SUBMISSION"]);
  });

  // Scenario 2: Fee cap exceeded requires approval with FEE_CAP_EXCEEDED
  it("Scenario 2: fee cap exceeded requires approval with FEE_CAP_EXCEEDED", () => {
    const request = createMockRequest({ feeCapInr: 150 });
    const plan = createMockPlan(request.id, { totalEstimatedFee: 180 });

    const reasons = computeApprovalReasons({
      request,
      plan,
      legRecyclerIds: ["deccan"],
    });

    expect(reasons).toContain("BOOKING_SUBMISSION");
    expect(reasons).toContain("FEE_CAP_EXCEEDED");
    expect(reasons).toContain("FEE_CHARGED");

    const card = buildApprovalCard({
      request,
      plan,
      approvalReasons: reasons,
    });
    expect(card.feeCapStatus).toBe("exceeds_cap");
    expect(card.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Pickup fee ₹180 exceeds stated fee cap of ₹150"),
      ])
    );
  });

  // Scenario 3: Approve transitions AWAITING_APPROVAL -> APPROVED and creates legs
  it("Scenario 3: approve transitions AWAITING_APPROVAL -> APPROVED and creates legs", () => {
    const request = createMockRequest({ state: "PLAN_CREATED" });
    const plan = createMockPlan(request.id);

    // First transition to AWAITING_APPROVAL
    const { request: awaitingReq, plan: readyPlan } = requestApproval({
      request,
      plan,
      approvalReasons: ["BOOKING_SUBMISSION"],
    });
    expect(awaitingReq.state).toBe("AWAITING_APPROVAL");

    // Approve the plan
    const result = recordDecision({
      request: awaitingReq,
      plan: readyPlan,
      decision: "approved",
      decidedBy: "user_alice",
      decidedAt: "2026-10-18T10:00:00.000Z",
    });

    expect(result.request.state).toBe("APPROVED");
    expect(result.decisionRecord.decision).toBe("approved");
    expect(result.decisionRecord.decidedBy).toBe("user_alice");
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]!.state).toBe("APPROVED");
    expect(result.legs[0]!.idempotencyKey).toBeDefined();
    expect(result.idempotent).toBe(false);
  });

  // Scenario 4: Reject transitions AWAITING_APPROVAL -> REJECTED and creates no legs
  it("Scenario 4: reject transitions AWAITING_APPROVAL -> REJECTED and creates no legs", () => {
    const request = createMockRequest({ state: "PLAN_CREATED" });
    const plan = createMockPlan(request.id);

    const { request: awaitingReq, plan: readyPlan } = requestApproval({
      request,
      plan,
      approvalReasons: ["BOOKING_SUBMISSION", "FEE_CAP_EXCEEDED"],
    });

    const result = recordDecision({
      request: awaitingReq,
      plan: readyPlan,
      decision: "rejected",
      decidedBy: "user_bob",
      reason: "Fee ₹180 exceeds my budget",
    });

    expect(result.request.state).toBe("REJECTED");
    expect(result.decisionRecord.decision).toBe("rejected");
    expect(result.decisionRecord.reason).toBe("Fee ₹180 exceeds my budget");
    expect(result.legs).toHaveLength(0);
    expect(result.idempotent).toBe(false);
  });

  // Scenario 5: Browser action refuses to submit without valid approval
  it("Scenario 5: browser action refuses to submit without valid approval", () => {
    const request = createMockRequest();
    const plan = createMockPlan(request.id);
    const leg = plan.legs[0]!;

    // Attempt action with null approval
    expect(() => {
      assertActionAllowed({
        leg,
        plan,
        approval: null,
        action: "submit_booking",
        observedFeeInr: leg.estimatedFee,
      });
    }).toThrow(SafeActionBlockedError);

    try {
      assertActionAllowed({
        leg,
        plan,
        approval: null,
        action: "submit_booking",
        observedFeeInr: leg.estimatedFee,
      });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SafeActionBlockedError);
      if (err instanceof SafeActionBlockedError) {
        expect(err.code).toBe("NO_USER_APPROVAL");
        expect(err.attemptLog.allowed).toBe(false);
        expect(err.attemptLog.blockReason).toContain("No valid approved user decision found");
      }
    }

    // Check action log has recorded the attempt
    const logs = getActionLogEntries();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[logs.length - 1]!.allowed).toBe(false);
  });

  // Scenario 6: Browser action refuses when plan changes (planHash mismatch / stale approval)
  it("Scenario 6: browser action refuses when plan changes (planHash mismatch / stale approval)", () => {
    const request = createMockRequest();
    const originalPlan = createMockPlan(request.id);
    const leg = originalPlan.legs[0]!;

    // Record approval on original plan
    const { decisionRecord } = recordDecision({
      request: { ...request, state: "AWAITING_APPROVAL" },
      plan: originalPlan,
      decision: "approved",
      decidedBy: "user_alice",
      dataWipeConfirmedByUser: true,
    });

    // Modified plan (different fee changes planHash)
    const modifiedPlan: Plan = {
      ...originalPlan,
      totalEstimatedFee: 250,
      planHash: "modified-stale-hash-12345",
    };

    expect(() => {
      assertActionAllowed({
        leg,
        plan: modifiedPlan,
        approval: decisionRecord,
        action: "submit_booking",
        observedFeeInr: leg.estimatedFee,
      });
    }).toThrow(SafeActionBlockedError);

    try {
      assertActionAllowed({
        leg,
        plan: modifiedPlan,
        approval: decisionRecord,
        action: "submit_booking",
        observedFeeInr: leg.estimatedFee,
      });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(SafeActionBlockedError);
      if (err instanceof SafeActionBlockedError) {
        expect(err.code).toBe("STALE_APPROVAL_PLAN_CHANGED");
        expect(err.attemptLog.blockReason).toContain("Stale approval");
      }
    }
  });

  // Scenario 7: Browser action refuses when fee on page exceeds approved fee (FEE_CHANGED_REAPPROVAL_REQUIRED)
  it("Scenario 7: browser action refuses when fee on page exceeds approved fee (FEE_CHANGED_REAPPROVAL_REQUIRED)", () => {
    const request = createMockRequest();
    const plan = createMockPlan(request.id, { totalEstimatedFee: 180 });
    const leg: PlanLeg = { ...plan.legs[0]!, estimatedFee: 180 };

    const { decisionRecord, plan: approvedPlan } = recordDecision({
      request: { ...request, state: "AWAITING_APPROVAL" },
      plan,
      decision: "approved",
      decidedBy: "user_alice",
      dataWipeConfirmedByUser: true,
    });

    // Portal unexpectedly demands ₹220 instead of approved ₹180
    expect(() => {
      assertActionAllowed({
        leg,
        plan: approvedPlan,
        approval: decisionRecord,
        action: "submit_booking",
        observedFeeInr: 220,
      });
    }).toThrow(FeeChangedReapprovalRequiredError);

    try {
      assertActionAllowed({
        leg,
        plan: approvedPlan,
        approval: decisionRecord,
        action: "submit_booking",
        observedFeeInr: 220,
      });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(FeeChangedReapprovalRequiredError);
      if (err instanceof FeeChangedReapprovalRequiredError) {
        expect(err.code).toBe("FEE_CHANGED_REAPPROVAL_REQUIRED");
        expect(err.message).toContain("Observed fee ₹220 differs from approved fee ₹180");
        expect(err.attemptLog.observedFeeInr).toBe(220);
        expect(err.attemptLog.approvedFeeInr).toBe(180);
      }
    }
  });

  // Scenario 8: Duplicate approval is idempotent
  it("Scenario 8: duplicate approval is idempotent", () => {
    const request = createMockRequest();
    const plan = createMockPlan(request.id);

    const firstResult = recordDecision({
      request: { ...request, state: "AWAITING_APPROVAL" },
      plan,
      decision: "approved",
      decidedBy: "user_alice",
      decidedAt: "2026-10-18T10:00:00.000Z",
    });
    expect(firstResult.idempotent).toBe(false);

    // Call recordDecision again with identical parameters and priorDecision
    const secondResult = recordDecision({
      request: firstResult.request,
      plan,
      decision: "approved",
      decidedBy: "user_alice",
      priorDecision: firstResult.decisionRecord,
    });

    expect(secondResult.idempotent).toBe(true);
    expect(secondResult.decisionRecord.id).toBe(firstResult.decisionRecord.id);
    expect(secondResult.legs).toHaveLength(firstResult.legs.length);
  });

  // Scenario 9: Choosing an alternative plan updates the plan and invalidates prior approval
  it("Scenario 9: choosing an alternative plan updates the plan and invalidates prior approval", () => {
    const request = createMockRequest();
    const planA = createMockPlan(request.id, { totalEstimatedFee: 180 });
    const planBId = randomUUID();
    const planBLegId = randomUUID();
    const planB = createMockPlan(request.id, {
      id: planBId,
      totalEstimatedFee: 199,
      legs: [
        {
          id: planBLegId,
          planId: planBId,
          recyclerId: "quickscrap",
          recyclerName: "QuickScrap Hyd",
          state: "APPROVED",
          estimatedFee: 199,
          estimatedPayout: 200,
          itemIds: ["item-1"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    // User originally approved Plan A
    const approvalA = recordDecision({
      request: { ...request, state: "AWAITING_APPROVAL" },
      plan: planA,
      decision: "approved",
      decidedBy: "user_alice",
      dataWipeConfirmedByUser: true,
    });

    // User then decides to choose Plan B
    const _approvalCardB = buildApprovalCard({
      request,
      plan: planB,
      approvalReasons: ["BOOKING_SUBMISSION"],
    });

    // The prior approval for Plan A must NOT permit action on Plan B
    expect(() => {
      assertActionAllowed({
        leg: planB.legs[0]!,
        plan: planB,
        approval: approvalA.decisionRecord, // Stale approval from Plan A!
        action: "submit_booking",
        observedFeeInr: 199,
      });
    }).toThrow(SafeActionBlockedError);

    // Re-approving Plan B creates a new valid decision for Plan B
    const approvalB = recordDecision({
      request: { ...request, state: "AWAITING_APPROVAL" },
      plan: planB,
      decision: "approved",
      decidedBy: "user_alice",
      dataWipeConfirmedByUser: true,
    });

    const allowedAction = assertActionAllowed({
      leg: planB.legs[0]!,
      plan: approvalB.plan,
      approval: approvalB.decisionRecord,
      action: "submit_booking",
      observedFeeInr: 199,
    });

    expect(allowedAction.allowed).toBe(true);
  });

  // Scenario 10: Action log records blocked attempts with reason
  it("Scenario 10: action log records blocked attempts with reason", () => {
    clearActionLogs();
    const request = createMockRequest();
    const plan = createMockPlan(request.id);
    const leg = plan.legs[0]!;

    // Block 1: Leg in invalid state (e.g. FAILED)
    const cancelledLeg: PlanLeg = { ...leg, state: "FAILED" };
    expect(() => {
      assertActionAllowed({
        leg: cancelledLeg,
        plan,
        approval: null,
        action: "submit_booking",
        observedFeeInr: 180,
      });
    }).toThrow(SafeActionBlockedError);

    // Block 2: Reused idempotency key
    const usedKey = "used-key-123";
    const approvalRecord = {
      id: "appr-1",
      requestId: request.id,
      planId: plan.id,
      planHash: plan.planHash,
      decision: "approved" as const,
      decidedBy: "user",
      decidedAt: new Date().toISOString(),
      dataWipeConfirmedByUser: true,
    };
    const legWithKey: PlanLeg = { ...leg, idempotencyKey: usedKey };
    assertActionAllowed({ leg: legWithKey, plan, approval: approvalRecord, action: "submit_booking", observedFeeInr: 180 });
    expect(() => {
      assertActionAllowed({
        leg: legWithKey,
        plan,
        approval: approvalRecord,
        action: "submit_booking",
        observedFeeInr: 180,
      });
    }).toThrow(SafeActionBlockedError);

    const logEntries = getActionLogEntries();
    expect(logEntries).toHaveLength(3);
    expect(logEntries[0]!.allowed).toBe(false);
    expect(logEntries[0]!.blockReason).toContain('Leg state "FAILED" is not APPROVED or SUBMITTING');
    expect(logEntries[2]!.allowed).toBe(false);
    expect(logEntries[2]!.blockReason).toContain('Idempotency key "used-key-123" has already been used');
  });

  // Extra invariant tests: SlotPreference changes hashPlan, formatApprovalCard output
  it("slotPreference canonicalization changes planHash and invalidates approval", () => {
    const request = createMockRequest();
    const plan = createMockPlan(request.id, {
      slotPreference: { day: "earliest", window: "morning" },
    });
    const hash1 = hashPlan(plan);

    const planAfternoon = {
      ...plan,
      slotPreference: { day: "earliest", window: "afternoon" as const },
    };
    const hash2 = hashPlan(planAfternoon);

    expect(hash1).not.toBe(hash2);

    // Approval on morning slot cannot be used for afternoon slot
    const approvalMorning = recordDecision({
      request: { ...request, state: "AWAITING_APPROVAL" },
      plan: { ...plan, planHash: hash1 },
      decision: "approved",
      decidedBy: "user",
      dataWipeConfirmedByUser: true,
    });

    const afternoonLeg = planAfternoon.legs[0]!;
    expect(() => {
      assertActionAllowed({
        leg: afternoonLeg,
        plan: { ...planAfternoon, planHash: hash2 },
        approval: approvalMorning.decisionRecord,
        action: "submit_booking",
        observedFeeInr: afternoonLeg.estimatedFee,
      });
    }).toThrow(SafeActionBlockedError);
  });

  it("formatApprovalCard formats clear CLI approval card", () => {
    const request = createMockRequest({ feeCapInr: 150 });
    const plan = createMockPlan(request.id, { totalEstimatedFee: 180, totalEstimatedPayout: 346 });
    const card = buildApprovalCard({
      request,
      plan,
      approvalReasons: ["BOOKING_SUBMISSION", "FEE_CAP_EXCEEDED"],
      slotPreference: DEFAULT_SLOT_PREFERENCE,
      alternatives: [
        {
          rank: 2,
          planId: "alt-plan-2",
          legsCount: 1,
          fee: 199,
          payout: 200,
          net: 1,
          recyclers: ["quickscrap"],
        },
      ],
    });

    const formatted = formatApprovalCard(card);
    expect(formatted).toContain("REVERSE-LOGISTICS APPROVAL CARD");
    expect(formatted).toContain("Total Fee: ₹180");
    expect(formatted).toContain("Payout: ₹346");
    expect(formatted).toContain("Net: ₹166");
    expect(formatted).toContain("EXCEEDS_CAP");
    expect(formatted).toContain("BOOKING_SUBMISSION, FEE_CAP_EXCEEDED");
    expect(formatted).toContain("Deccan E-Cycle Solutions (DECCAN)");
    expect(formatted).toContain("Option 2");
    expect(formatted).toContain("npm run approve -- --request=");
  });

  // Stage 7 Fix Test: Caller cannot bypass idempotency check by passing an empty list
  it("caller cannot bypass idempotency check by passing an empty list: assertActionAllowed loads from action store", () => {
    clearActionLogs();
    const request = createMockRequest();
    const plan = createMockPlan(request.id);
    const leg = plan.legs[0]!;

    const approval = {
      id: "appr-1",
      requestId: request.id,
      planId: plan.id,
      planHash: plan.planHash,
      decision: "approved" as const,
      decidedBy: "user",
      decidedAt: new Date().toISOString(),
      dataWipeConfirmedByUser: true,
    };

    // First call succeeds and writes to action store
    const res = assertActionAllowed({
      leg,
      plan,
      approval,
      action: "submit_booking",
      observedFeeInr: 180,
    });
    expect(res.allowed).toBe(true);

    // Second call: caller passes an empty list attempting to bypass store
    expect(() => {
      assertActionAllowed({
        leg,
        plan,
        approval,
        action: "submit_booking",
        observedFeeInr: 180,
      });
    }).toThrow(SafeActionBlockedError);

    try {
      assertActionAllowed({
        leg,
        plan,
        approval,
        action: "submit_booking",
        observedFeeInr: 180,
      });
    } catch (err) {
      expect((err as SafeActionBlockedError).code).toBe("IDEMPOTENCY_KEY_REUSED");
    }
  });

  // Stage 6 Fix Test 2: Data wipe unconfirmed blocks laptop booking
  it("data wipe unconfirmed: user did not confirm data wipe -> plan has laptop -> blocked with DATA_WIPE_NOT_CONFIRMED", () => {
    const request = createMockRequest();
    const plan = createMockPlan(request.id);
    const leg = plan.legs[0]!; // Contains "Dell Laptop"

    // Approval without data wipe confirmation
    const unconfirmedApproval = {
      id: "appr-no-wipe",
      requestId: request.id,
      planId: plan.id,
      planHash: plan.planHash,
      decision: "approved" as const,
      decidedBy: "user",
      decidedAt: new Date().toISOString(),
      dataWipeConfirmedByUser: false,
    };

    expect(() => {
      assertActionAllowed({
        leg,
        plan,
        approval: unconfirmedApproval,
        action: "submit_booking",
        observedFeeInr: 180,
      });
    }).toThrow(SafeActionBlockedError);

    try {
      assertActionAllowed({
        leg,
        plan,
        approval: unconfirmedApproval,
        action: "submit_booking",
        observedFeeInr: 180,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(SafeActionBlockedError);
      if (err instanceof SafeActionBlockedError) {
        expect(err.code).toBe("DATA_WIPE_NOT_CONFIRMED");
        expect(err.attemptLog.blockReason).toContain("Data-wipe destruction declaration required");
      }
    }
  });

  // Stage 6 Fix Test 3: Data wipe confirmed allows laptop booking
  it("data wipe confirmed: user confirms data wipe -> plan has laptop -> allowed", () => {
    const request = createMockRequest();
    const plan = createMockPlan(request.id);
    const leg = plan.legs[0]!;

    const confirmedApproval = {
      id: "appr-wipe-ok",
      requestId: request.id,
      planId: plan.id,
      planHash: plan.planHash,
      decision: "approved" as const,
      decidedBy: "user",
      decidedAt: new Date().toISOString(),
      dataWipeConfirmedByUser: true,
    };

    const res = assertActionAllowed({
      leg,
      plan,
      approval: confirmedApproval,
      action: "submit_booking",
      observedFeeInr: 180,
    });
    expect(res.allowed).toBe(true);
    expect(res.idempotencyKey).toBeTruthy();
  });

  // Stage 6 Fix Test 4: Approval card shows REGISTRY_WARNING for QuickScrap plans
  it("approval card shows REGISTRY_WARNING for QuickScrap plans", () => {
    const request = createMockRequest();
    const quickScrapLeg: PlanLeg = {
      id: "leg-qs",
      planId: "p-qs",
      recyclerId: "quickscrap",
      recyclerName: "QuickScrap Hyd",
      estimatedFee: 199,
      estimatedPayout: 200,
      state: "APPROVED",
      itemIds: ["item-1"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const qsPlan = createMockPlan(request.id, {
      legs: [quickScrapLeg],
      totalEstimatedFee: 199,
    });

    const reasons = computeApprovalReasons({
      request,
      plan: qsPlan,
      legRecyclerIds: ["quickscrap"],
    });
    expect(reasons).toContain("REGISTRY_WARNING");

    const card = buildApprovalCard({
      request,
      plan: qsPlan,
      approvalReasons: reasons,
    });
    expect(card.approvalReasons).toContain("REGISTRY_WARNING");
    expect(card.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("QuickScrap Hyd"),
      ])
    );
  });

  // Stage 6 Fix Test 5: Stale approval returns request to AWAITING_APPROVAL
  it("stale approval returns request to AWAITING_APPROVAL via state machine", () => {
    const request = createMockRequest({ state: "APPROVED" });
    const plan = createMockPlan(request.id);

    // Transition from APPROVED back to AWAITING_APPROVAL
    const result = transitionState(request, "AWAITING_APPROVAL", {
      planId: plan.id,
      planHash: plan.planHash,
      approvalReason: "FEE_CHANGED_REAPPROVAL_REQUIRED: Observed fee drift on portal",
    });

    expect(result.newRequest.state).toBe("AWAITING_APPROVAL");
    expect(result.auditEvent.previousState).toBe("APPROVED");
    expect(result.auditEvent.newState).toBe("AWAITING_APPROVAL");
  });
});

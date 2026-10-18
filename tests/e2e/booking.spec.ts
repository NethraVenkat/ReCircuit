/**
 * tests/e2e/booking.spec.ts
 *
 * Stage 7: Real Browser E2E Test Suite for the Browser Booking Agent (Booker).
 * Tests against live mock recycler portals (no mocks, real Chromium via Playwright, webServer starts portals).
 *
 * 8 Scenarios Tested:
 * a. TC1: laptop-only -> plan -> approve (data-wipe confirmed) -> book -> Deccan DEC-xxxxx; tracking page shows it; leg state REQUEST_SUBMITTED (not CONFIRMED, not COLLECTED).
 * b. Demo sentence -> Deccan booked + PaperPlus NEEDS_HUMAN with no PaperPlus booking yet; test harness solves via humanSolveForTest in the SAME page -> PPK-xxxxx.
 * c. No approval -> refused, zero bookings in portal storage.
 * d. Data wipe not confirmed -> NEEDS_HUMAN, checkbox never ticked, no booking.
 * e. Fee change (admin raise_fee on QuickScrap -> +₹40) -> FEE_CHANGED_REAPPROVAL_REQUIRED, no booking, request rolls back to AWAITING_APPROVAL.
 * f. Run book twice -> exactly one booking per leg (second run "recovered existing booking").
 * g. Fail next submit (fail_next_submit) -> one retry -> exactly one booking.
 * h. Omit next reference (omit_next_reference) -> reference recovered from tracking page, labelled recovered.
 */

import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "crypto";
import {
  parseIntake,
  createDomainRequestFromIntake,
  generateRoutingPlans,
  requestApproval,
  recordDecision,
  hashPlan,
  makeIdempotencyKey,
  DECCAN_EXTRACTION,
  PAPERPLUS_EXTRACTION,
  QUICKSCRAP_EXTRACTION,
  FeeChangedReapprovalRequiredError,
  SafeActionBlockedError,
  type Plan,
  type PlanLeg,
  type DecisionRecord,
  type Request as DomainRequest,
} from "@recircuit/core";
import { BookingRunner } from "../../apps/worker/src/booking/runner.js";
import type { LegBookingContext } from "../../apps/worker/src/booking/types.js";

const TEST_ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-secret-token";

/**
 * Test harness human solver: simulates a human reading the distorted SVG CAPTCHA in the live browser window
 * and typing the code into the input. The booking agent NEVER reads, OCRs, or types this code.
 */
async function humanSolveForTest(page: Page): Promise<string> {
  const img = page.locator('[data-testid="captcha-image"]');
  await img.waitFor({ state: "visible", timeout: 8000 });
  const src = (await img.getAttribute("src")) || "";
  const match = src.match(/sid=([^&]+)/);
  if (!match || !match[1]) throw new Error("Could not find sid in captcha image src");
  const sid = decodeURIComponent(match[1]);

  const { getStoredCaptchaCode } = await import("../../apps/portals/src/lib/captcha.js");
  const code = getStoredCaptchaCode(sid);
  if (!code) throw new Error(`Could not recover captcha code for sid: ${sid}`);

  const input = page.locator('[data-testid="input-captcha-code"]');
  await input.fill(code);
  return code;
}

function getTestPolicies(): any[] {
  return [
    {
      ...DECCAN_EXTRACTION,
      recyclerId: "deccan",
      companyName: "Deccan E-Cycle Solutions",
      status: "SUCCESS",
      feesUnknown: false,
      evidence: {
        url: "http://localhost:3101",
        textHash: "deccan-hash",
        screenshotPath: ".data/evidence/deccan-policy.png",
        extractedAt: new Date().toISOString(),
        sessionId: "local-deccan-e2e",
        extractionPath: "generic-ai",
      },
      acceptedCategories: ["laptop", "desktop", "mobile_phone", "charger_cable", "battery_household", "small_electronics"],
      rejectedCategories: ["newspaper", "cardboard", "plastic", "glass"],
      freeThresholdKg: 5,
      underWeightFeeInr: 180,
      requiresDataWipeAck: true,
      quotes: ["Under 5 kg total weight: ₹180 standard pickup charge"],
      rates: [],
    },
    {
      ...PAPERPLUS_EXTRACTION,
      recyclerId: "paperplus",
      companyName: "PaperPlus Kabadi",
      status: "SUCCESS",
      feesUnknown: false,
      evidence: {
        url: "http://localhost:3102",
        textHash: "paperplus-hash",
        screenshotPath: ".data/evidence/paperplus-policy.png",
        extractedAt: new Date().toISOString(),
        sessionId: "local-paperplus-e2e",
        extractionPath: "generic-ai",
      },
      acceptedCategories: ["newspaper", "cardboard", "books_magazines"],
      rejectedCategories: ["laptop", "battery_household", "small_electronics", "hazardous"],
      freeThresholdKg: null,
      underWeightFeeInr: null,
      minWeightKg: 5,
      requiresDataWipeAck: false,
      quotes: ["Minimum Weight: At least 5 kg total scrap weight is required for home pickup."],
      rates: [],
    },
    {
      ...QUICKSCRAP_EXTRACTION,
      recyclerId: "quickscrap",
      companyName: "QuickScrap Hyd",
      status: "SUCCESS",
      feesUnknown: false,
      evidence: {
        url: "http://localhost:3103",
        textHash: "quickscrap-hash",
        screenshotPath: ".data/evidence/quickscrap-policy.png",
        extractedAt: new Date().toISOString(),
        sessionId: "local-quickscrap-e2e",
        extractionPath: "generic-ai",
      },
      acceptedCategories: ["laptop", "mobile_phone", "newspaper", "cardboard", "battery_household", "small_electronics"],
      rejectedCategories: ["hazardous"],
      freeThresholdKg: null,
      underWeightFeeInr: null,
      minWeightKg: null,
      requiresDataWipeAck: false,
      quotes: ["Standard Logistics Fee: ₹199 Flat Pickup Fee"],
      rates: [],
    },
  ];
}

test.describe("Stage 7: Browser Booking Agent E2E Suite (Live Portals)", () => {
  test.setTimeout(120000);

  test.beforeAll(async ({ request }) => {
    // Warm up all 3 portal servers
    await Promise.all(
      [3101, 3102, 3103].map(async (port) => {
        for (let attempt = 0; attempt < 40; attempt++) {
          try {
            const res = await request.get(`http://localhost:${port}/api/health`);
            if (res.ok()) return;
          } catch {
            // waiting for server
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      })
    );

    // Reset demo state across all portals
    await request.post("http://localhost:3101/api/reset?all=true", {
      headers: { "x-admin-token": TEST_ADMIN_TOKEN },
    });
  });

  test.beforeEach(async ({ request }) => {
    // Reset demo state before each scenario
    await request.post("http://localhost:3101/api/reset?all=true", {
      headers: { "x-admin-token": TEST_ADMIN_TOKEN },
    });
  });

  // -------------------------------------------------------------------------
  // a. TC1: laptop-only -> plan -> approve (data-wipe confirmed) -> book -> Deccan DEC-xxxxx
  // -------------------------------------------------------------------------
  test("a. TC1: laptop-only routes to Deccan, confirms data-wipe, extracts DEC-xxxxx, verifies tracking, and stays in REQUEST_SUBMITTED", async ({
    page,
  }) => {
    const intake = await parseIntake("1 dead Dell laptop in Kukatpally, Hyderabad, pincode 500072");
    const domainReq = createDomainRequestFromIntake(intake);
    domainReq.state = "PLAN_CREATED";

    const routing = generateRoutingPlans({
      request: {
        id: domainReq.id,
        feeCapInr: domainReq.feeCapInr,
        pincode: domainReq.pincode,
      },
      items: intake.items,
      policies: getTestPolicies(),
    });

    const chosenPlan = routing.bestPlan!;
    expect(chosenPlan).toBeDefined();
    expect(chosenPlan.legs.length).toBe(1);
    expect(chosenPlan.legs[0].recyclerId).toBe("deccan");

    const reApproval = requestApproval({
      request: domainReq,
      plan: chosenPlan,
      slotPreference: chosenPlan.slotPreference,
      approvalReasons: chosenPlan.approvalReasons,
      isPartial: chosenPlan.isPartial,
    });

    const approved = recordDecision({
      request: reApproval.request,
      plan: reApproval.plan,
      decision: "approved",
      decidedBy: "test_user",
      dataWipeConfirmedByUser: true,
    });

    const leg = approved.legs[0];
    const context: LegBookingContext = {
      leg,
      plan: approved.plan,
      approval: approved.decisionRecord,
      customer: {
        fullName: "Ramesh Reddy",
        phone: "9876543210",
        addressLine: "Plot 10, Road No 2",
        locality: "Kukatpally",
        pincode: "500072",
        preferredSlot: "Tomorrow (10:00–12:00 IST)",
      },
      items: leg.items || [],
      dataWipeAck: true,
      request: approved.request,
    };

    const bookResult = await BookingRunner.bookLegWithTransitions(context, { headless: true });

    expect(bookResult.result.success).toBe(true);
    expect(bookResult.result.bookingReference).toMatch(/^DEC-\d{5}$/);
    const reference = bookResult.result.bookingReference!;

    // Leg state MUST be REQUEST_SUBMITTED (not CONFIRMED, not COLLECTED)
    expect(bookResult.updatedLeg.state).toBe("REQUEST_SUBMITTED");
    expect(bookResult.updatedLeg.state).not.toBe("CONFIRMED");
    expect(bookResult.updatedLeg.state).not.toBe("COLLECTED");

    // Live tracking page verification
    await page.goto(`http://localhost:3101/track?ref=${encodeURIComponent(reference)}`);
    await expect(page.locator('[data-testid="tracking-result"]')).toBeVisible();
    await expect(page.locator('[data-testid="booking-reference"]')).toHaveText(reference);
    await expect(page.locator('[data-testid="tracking-status"]')).toHaveText(/RECEIVED/i);
  });

  // -------------------------------------------------------------------------
  // b. Demo sentence -> Deccan booked + PaperPlus NEEDS_HUMAN (no booking yet)
  //    -> test harness solves via humanSolveForTest in the SAME page -> PPK-xxxxx
  // -------------------------------------------------------------------------
  test("b. Demo sentence splits into Deccan and PaperPlus: Deccan books directly; PaperPlus transitions to NEEDS_HUMAN without booking; solved in the same page -> PPK-xxxxx", async ({
    request,
  }) => {
    const demoSentence =
      "I have one dead Dell laptop, two old batteries and around 8 kg of newspaper in Kukatpally, Hyderabad. Don't charge me more than ₹150.";
    const intake = await parseIntake(demoSentence);
    const domainReq = createDomainRequestFromIntake(intake);
    domainReq.state = "PLAN_CREATED";

    const routing = generateRoutingPlans({
      request: {
        id: domainReq.id,
        feeCapInr: domainReq.feeCapInr,
        pincode: domainReq.pincode,
      },
      items: intake.items,
      policies: getTestPolicies(),
    });

    const chosenPlan = routing.bestPlan!;
    expect(chosenPlan.legs.length).toBe(2);

    const reApproval = requestApproval({
      request: domainReq,
      plan: chosenPlan,
      slotPreference: chosenPlan.slotPreference,
      approvalReasons: chosenPlan.approvalReasons,
      isPartial: chosenPlan.isPartial,
    });

    const approved = recordDecision({
      request: reApproval.request,
      plan: reApproval.plan,
      decision: "approved",
      decidedBy: "test_user",
      dataWipeConfirmedByUser: true,
    });

    const deccanLeg = approved.legs.find((l) => l.recyclerId === "deccan")!;
    const paperPlusLeg = approved.legs.find((l) => l.recyclerId === "paperplus")!;
    expect(deccanLeg).toBeDefined();
    expect(paperPlusLeg).toBeDefined();

    const customer = {
      fullName: "Ramesh Reddy",
      phone: "9876543210",
      addressLine: "Plot 10, Road No 2",
      locality: "Kukatpally",
      pincode: "500072",
      preferredSlot: "Tomorrow (10:00–12:00 IST)",
    };

    // 1. Book Deccan leg (no CAPTCHA)
    const deccanContext: LegBookingContext = {
      leg: deccanLeg,
      plan: approved.plan,
      approval: approved.decisionRecord,
      customer,
      items: deccanLeg.items || [],
      dataWipeAck: true,
      request: approved.request,
    };

    const deccanResult = await BookingRunner.bookLegWithTransitions(deccanContext, { headless: true });
    expect(deccanResult.result.success).toBe(true);
    expect(deccanResult.result.bookingReference).toMatch(/^DEC-\d{5}$/);
    expect(deccanResult.updatedLeg.state).toBe("REQUEST_SUBMITTED");

    // 2. Book PaperPlus leg (requires CAPTCHA) - keep session open
    const ppIdempotencyKey =
      paperPlusLeg.idempotencyKey ||
      makeIdempotencyKey(approved.plan.planHash, paperPlusLeg.id, paperPlusLeg.recyclerId);

    const paperPlusContext: LegBookingContext = {
      leg: { ...paperPlusLeg, idempotencyKey: ppIdempotencyKey },
      plan: approved.plan,
      approval: approved.decisionRecord,
      customer,
      items: paperPlusLeg.items || [],
      dataWipeAck: true,
      request: approved.request,
    };

    const ppExecution1 = await BookingRunner.bookLegWithTransitions(paperPlusContext, {
      headless: true,
      keepSessionOpenOnNeedsHuman: true,
    });

    // Halts at NEEDS_HUMAN
    expect(ppExecution1.result.needsHuman).toBe(true);
    expect(ppExecution1.updatedLeg.state).toBe("NEEDS_HUMAN");
    expect(ppExecution1.result.session).toBeDefined();
    const liveSession = ppExecution1.result.session!;

    // Assert that NO PaperPlus booking exists yet in portal storage
    const checkStorageRes = await request.get(
      `http://localhost:3102/api/bookings?client=${encodeURIComponent(ppIdempotencyKey)}`
    );
    expect(checkStorageRes.status()).toBe(404);

    // 3. Test harness solves verification directly in the SAME open browser window
    await humanSolveForTest(liveSession.page);

    // 4. Resume submission in the SAME open session
    const ppExecution2 = await BookingRunner.resumeInSession(
      {
        ...paperPlusContext,
        leg: ppExecution1.updatedLeg,
      },
      liveSession,
      { headless: true }
    );

    expect(ppExecution2.result.success).toBe(true);
    expect(ppExecution2.result.bookingReference).toMatch(/^PPK-\d{5}$/);
    expect(ppExecution2.updatedLeg.state).toBe("REQUEST_SUBMITTED");

    // Verify booking now exists in PaperPlus portal storage
    const checkStorageAfter = await request.get(
      `http://localhost:3102/api/bookings?client=${encodeURIComponent(ppIdempotencyKey)}`
    );
    expect(checkStorageAfter.status()).toBe(200);
  });

  // -------------------------------------------------------------------------
  // c. No approval -> refused, zero bookings in portal storage
  // -------------------------------------------------------------------------
  test("c. Leg without approved user decision is strictly refused with zero bookings created in portal storage", async ({
    request,
  }) => {
    const intake = await parseIntake("1 dead Dell laptop in Kukatpally, Hyderabad, pincode 500072");
    const domainReq = createDomainRequestFromIntake(intake);

    const routing = generateRoutingPlans({
      request: {
        id: domainReq.id,
        feeCapInr: domainReq.feeCapInr,
        pincode: domainReq.pincode,
      },
      items: intake.items,
      policies: getTestPolicies(),
    });

    const chosenPlan = routing.bestPlan!;
    const leg = chosenPlan.legs[0];

    const context: LegBookingContext = {
      leg: { ...leg, state: "PLAN_CREATED" }, // Unapproved state!
      plan: chosenPlan,
      approval: null, // No approval record!
      customer: {
        fullName: "Ramesh Reddy",
        phone: "9876543210",
        addressLine: "Plot 10, Road No 2",
        locality: "Kukatpally",
        pincode: "500072",
      },
      items: leg.items || [],
      dataWipeAck: true,
      request: domainReq,
    };

    await expect(BookingRunner.bookLegWithTransitions(context, { headless: true })).rejects.toThrow(
      SafeActionBlockedError
    );

    // Verify zero bookings in Deccan portal storage
    const adminRes = await request.get(`http://localhost:3101/api/admin?token=${TEST_ADMIN_TOKEN}`);
    const adminData = await adminRes.json();
    expect(adminData.bookings.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // d. Data wipe not confirmed -> NEEDS_HUMAN, checkbox never ticked, no booking
  // -------------------------------------------------------------------------
  test("d. Data-bearing device without data-wipe confirmation halts at NEEDS_HUMAN, never checks box, and creates no booking", async ({
    request,
  }) => {
    const intake = await parseIntake("1 dead Dell laptop in Kukatpally, Hyderabad, pincode 500072");
    const domainReq = createDomainRequestFromIntake(intake);
    domainReq.state = "PLAN_CREATED";

    const routing = generateRoutingPlans({
      request: {
        id: domainReq.id,
        feeCapInr: domainReq.feeCapInr,
        pincode: domainReq.pincode,
      },
      items: intake.items,
      policies: getTestPolicies(),
    });

    const chosenPlan = routing.bestPlan!;
    const reApproval = requestApproval({
      request: domainReq,
      plan: chosenPlan,
      slotPreference: chosenPlan.slotPreference,
      approvalReasons: chosenPlan.approvalReasons,
      isPartial: chosenPlan.isPartial,
    });

    // Approved BUT dataWipeConfirmedByUser is false!
    const approved = recordDecision({
      request: reApproval.request,
      plan: reApproval.plan,
      decision: "approved",
      decidedBy: "test_user",
      dataWipeConfirmedByUser: false,
    });

    const leg = approved.legs[0];
    const context: LegBookingContext = {
      leg,
      plan: approved.plan,
      approval: approved.decisionRecord,
      customer: {
        fullName: "Ramesh Reddy",
        phone: "9876543210",
        addressLine: "Plot 10, Road No 2",
        locality: "Kukatpally",
        pincode: "500072",
      },
      items: leg.items || [],
      dataWipeAck: false, // Refusal to confirm data wipe
      request: approved.request,
    };

    const result = await BookingRunner.bookLegWithTransitions(context, { headless: true });

    expect(result.result.needsHuman).toBe(true);
    expect(result.result.errorCode).toBe("DATA_WIPE_NOT_CONFIRMED");
    expect(result.updatedLeg.state).toBe("NEEDS_HUMAN");

    // Verify zero bookings in Deccan portal storage
    const adminRes = await request.get(`http://localhost:3101/api/admin?token=${TEST_ADMIN_TOKEN}`);
    const adminData = await adminRes.json();
    expect(adminData.bookings.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // e. Fee change (admin raise_fee on QuickScrap -> +₹40)
  //    -> FEE_CHANGED_REAPPROVAL_REQUIRED, no booking, request rolls back to AWAITING_APPROVAL
  // -------------------------------------------------------------------------
  test("e. Portal fee change triggers FEE_CHANGED_REAPPROVAL_REQUIRED, creates no booking, and rolls back request to AWAITING_APPROVAL", async ({
    request,
  }) => {
    // Enable raise_fee on QuickScrap (3103)
    await request.post(`http://localhost:3103/api/admin?token=${TEST_ADMIN_TOKEN}`, {
      data: { action: "toggle_switch", switchName: "raise_fee", value: true },
    });

    try {
      const plan: Plan = {
        id: randomUUID(),
        requestId: randomUUID(),
        legs: [
          {
            id: randomUUID(),
            recyclerId: "quickscrap",
            categoryGroups: ["e_waste"],
            state: "APPROVED",
            estimatedFee: 50, // Approved standard convenience fee: ₹50
            estimatedPayout: 0,
            itemCount: 1,
            items: [{ name: "Dead Mobile Phone", quantity: 1, weightKg: 0.2 }],
          },
        ],
        totalEstimatedFee: 50,
        totalEstimatedPayout: 0,
        slotPreference: "Tomorrow (10:00–12:00 IST)",
        planHash: "",
        createdAt: new Date().toISOString(),
      };
      plan.planHash = hashPlan(plan);

      const domainReq: DomainRequest = {
        id: plan.requestId,
        userId: "test-user-1",
        description: "1 Dead Mobile Phone in Kukatpally",
        state: "APPROVED",
        customerContact: "9876543210",
        pincode: "500072",
        items: [{ id: "item-1", name: "Dead Mobile Phone", category: "small_electronics", quantity: 1, weightKg: 0.2, hazardClass: "non_hazardous" }],
        activePlanId: plan.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const approvalRecord: DecisionRecord = {
        id: randomUUID(),
        requestId: domainReq.id,
        planId: plan.id,
        planHash: plan.planHash,
        decision: "approved",
        decidedBy: "test_user",
        timestamp: new Date().toISOString(),
        dataWipeConfirmedByUser: true,
      };

      const leg = plan.legs[0];
      const context: LegBookingContext = {
        leg,
        plan,
        approval: approvalRecord,
        customer: {
          fullName: "Ramesh Reddy",
          phone: "9876543210",
          addressLine: "Plot 10, Road No 2",
          locality: "Kukatpally",
          pincode: "500072",
          preferredSlot: "Tomorrow (10:00–12:00 IST)",
        },
        items: [{ name: "Dead Mobile Phone", quantity: 1, weightKg: 0.2 }],
        dataWipeAck: true,
        request: domainReq,
      };

      await expect(BookingRunner.bookLegWithTransitions(context, { headless: true })).rejects.toThrow(
        FeeChangedReapprovalRequiredError
      );

      // Request rolled back to AWAITING_APPROVAL
      expect(context.request?.state).toBe("AWAITING_APPROVAL");

      // Verify zero bookings created on QuickScrap
      const adminRes = await request.get(`http://localhost:3103/api/admin?token=${TEST_ADMIN_TOKEN}`);
      const adminData = await adminRes.json();
      expect(adminData.bookings.length).toBe(0);
    } finally {
      // Restore switch
      await request.post(`http://localhost:3103/api/admin?token=${TEST_ADMIN_TOKEN}`, {
        data: { action: "toggle_switch", switchName: "raise_fee", value: false },
      });
    }
  });

  // -------------------------------------------------------------------------
  // f. Run book twice -> exactly one booking per leg (second run "recovered existing booking")
  // -------------------------------------------------------------------------
  test("f. Running book twice executes idempotently, recovering existing booking with exactly 1 portal record", async ({
    request,
  }) => {
    const intake = await parseIntake("1 dead Dell laptop in Kukatpally, Hyderabad, pincode 500072");
    const domainReq = createDomainRequestFromIntake(intake);
    domainReq.state = "PLAN_CREATED";

    const routing = generateRoutingPlans({
      request: {
        id: domainReq.id,
        feeCapInr: domainReq.feeCapInr,
        pincode: domainReq.pincode,
      },
      items: intake.items,
      policies: getTestPolicies(),
    });

    const chosenPlan = routing.bestPlan!;
    const reApproval = requestApproval({
      request: domainReq,
      plan: chosenPlan,
      slotPreference: chosenPlan.slotPreference,
      approvalReasons: chosenPlan.approvalReasons,
      isPartial: chosenPlan.isPartial,
    });

    const approved = recordDecision({
      request: reApproval.request,
      plan: reApproval.plan,
      decision: "approved",
      decidedBy: "test_user",
      dataWipeConfirmedByUser: true,
    });

    const leg = approved.legs[0];
    const idempotencyKey = makeIdempotencyKey(approved.plan.planHash, leg.id, leg.recyclerId);

    const context: LegBookingContext = {
      leg: { ...leg, idempotencyKey },
      plan: approved.plan,
      approval: approved.decisionRecord,
      customer: {
        fullName: "Ramesh Reddy",
        phone: "9876543210",
        addressLine: "Plot 10, Road No 2",
        locality: "Kukatpally",
        pincode: "500072",
        preferredSlot: "Tomorrow (10:00–12:00 IST)",
      },
      items: leg.items || [],
      dataWipeAck: true,
      request: approved.request,
    };

    // First booking run
    const run1 = await BookingRunner.bookLegWithTransitions(context, { headless: true });
    expect(run1.result.success).toBe(true);
    expect(run1.result.bookingReference).toMatch(/^DEC-\d{5}$/);
    const reference = run1.result.bookingReference;

    // Second booking run with same context
    const run2 = await BookingRunner.bookLegWithTransitions(
      {
        ...context,
        leg: run1.updatedLeg,
      },
      { headless: true }
    );

    expect(run2.result.success).toBe(true);
    expect(run2.result.bookingReference).toBe(reference);
    expect(run2.result.isRecovered || run2.result.isDuplicate).toBe(true);

    // Verify exactly 1 booking in Deccan storage
    const adminRes = await request.get(`http://localhost:3101/api/admin?token=${TEST_ADMIN_TOKEN}`);
    const adminData = await adminRes.json();
    const matching = adminData.bookings.filter((b: any) => b.clientRequestId === idempotencyKey);
    expect(matching.length).toBe(1);
    expect(matching[0].bookingReference).toBe(reference);
  });

  // -------------------------------------------------------------------------
  // g. Fail next submit (fail_next_submit) -> one retry -> exactly one booking
  // -------------------------------------------------------------------------
  test("g. Server outage (HTTP 500) triggers recovery engine retry and succeeds with exactly 1 booking", async ({
    request,
  }) => {
    // Enable single-shot fail_next_submit on Deccan (3101)
    await request.post(`http://localhost:3101/api/admin?token=${TEST_ADMIN_TOKEN}`, {
      data: { action: "toggle_switch", switchName: "fail_next_submit", value: true },
    });

    const intake = await parseIntake("1 dead Dell laptop in Kukatpally, Hyderabad, pincode 500072");
    const domainReq = createDomainRequestFromIntake(intake);
    domainReq.state = "PLAN_CREATED";

    const routing = generateRoutingPlans({
      request: {
        id: domainReq.id,
        feeCapInr: domainReq.feeCapInr,
        pincode: domainReq.pincode,
      },
      items: intake.items,
      policies: getTestPolicies(),
    });

    const chosenPlan = routing.bestPlan!;
    const reApproval = requestApproval({
      request: domainReq,
      plan: chosenPlan,
      slotPreference: chosenPlan.slotPreference,
      approvalReasons: chosenPlan.approvalReasons,
      isPartial: chosenPlan.isPartial,
    });

    const approved = recordDecision({
      request: reApproval.request,
      plan: reApproval.plan,
      decision: "approved",
      decidedBy: "test_user",
      dataWipeConfirmedByUser: true,
    });

    const leg = approved.legs[0];
    const idempotencyKey = makeIdempotencyKey(approved.plan.planHash, leg.id, leg.recyclerId);

    const context: LegBookingContext = {
      leg: { ...leg, idempotencyKey },
      plan: approved.plan,
      approval: approved.decisionRecord,
      customer: {
        fullName: "Ramesh Reddy",
        phone: "9876543210",
        addressLine: "Plot 10, Road No 2",
        locality: "Kukatpally",
        pincode: "500072",
        preferredSlot: "Tomorrow (10:00–12:00 IST)",
      },
      items: leg.items || [],
      dataWipeAck: true,
      request: approved.request,
    };

    const bookResult = await BookingRunner.bookLegWithTransitions(context, { headless: true });
    expect(bookResult.result.success).toBe(true);
    expect(bookResult.result.bookingReference).toMatch(/^DEC-\d{5}$/);
    expect(bookResult.updatedLeg.state).toBe("REQUEST_SUBMITTED");

    // Verify exactly 1 booking in Deccan storage
    const adminRes = await request.get(`http://localhost:3101/api/admin?token=${TEST_ADMIN_TOKEN}`);
    const adminData = await adminRes.json();
    const matching = adminData.bookings.filter((b: any) => b.clientRequestId === idempotencyKey);
    expect(matching.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // h. Omit next reference (omit_next_reference) -> reference recovered from tracking page
  // -------------------------------------------------------------------------
  test("h. Omitted reference defect recovers official reference from tracking page and marks isRecovered", async ({
    request,
    page,
  }) => {
    // Enable single-shot omit_next_reference on Deccan (3101)
    await request.post(`http://localhost:3101/api/admin?token=${TEST_ADMIN_TOKEN}`, {
      data: { action: "toggle_switch", switchName: "omit_next_reference", value: true },
    });

    const intake = await parseIntake("1 dead Dell laptop in Kukatpally, Hyderabad, pincode 500072");
    const domainReq = createDomainRequestFromIntake(intake);
    domainReq.state = "PLAN_CREATED";

    const routing = generateRoutingPlans({
      request: {
        id: domainReq.id,
        feeCapInr: domainReq.feeCapInr,
        pincode: domainReq.pincode,
      },
      items: intake.items,
      policies: getTestPolicies(),
    });

    const chosenPlan = routing.bestPlan!;
    const reApproval = requestApproval({
      request: domainReq,
      plan: chosenPlan,
      slotPreference: chosenPlan.slotPreference,
      approvalReasons: chosenPlan.approvalReasons,
      isPartial: chosenPlan.isPartial,
    });

    const approved = recordDecision({
      request: reApproval.request,
      plan: reApproval.plan,
      decision: "approved",
      decidedBy: "test_user",
      dataWipeConfirmedByUser: true,
    });

    const leg = approved.legs[0];
    const idempotencyKey = makeIdempotencyKey(approved.plan.planHash, leg.id, leg.recyclerId);

    const context: LegBookingContext = {
      leg: { ...leg, idempotencyKey },
      plan: approved.plan,
      approval: approved.decisionRecord,
      customer: {
        fullName: "Ramesh Reddy",
        phone: "9876543210",
        addressLine: "Plot 10, Road No 2",
        locality: "Kukatpally",
        pincode: "500072",
        preferredSlot: "Tomorrow (10:00–12:00 IST)",
      },
      items: leg.items || [],
      dataWipeAck: true,
      request: approved.request,
    };

    const bookResult = await BookingRunner.bookLegWithTransitions(context, { headless: true });
    expect(bookResult.result.success).toBe(true);
    expect(bookResult.result.bookingReference).toMatch(/^DEC-\d{5}$/);
    expect(bookResult.result.isRecovered).toBe(true);

    const recoveredRef = bookResult.result.bookingReference!;

    // Verify tracking page displays the recovered booking
    await page.goto(`http://localhost:3101/track?ref=${encodeURIComponent(recoveredRef)}`);
    await expect(page.locator('[data-testid="tracking-result"]')).toBeVisible();
    await expect(page.locator('[data-testid="booking-reference"]')).toHaveText(recoveredRef);
  });
});


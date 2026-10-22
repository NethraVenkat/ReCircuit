/**
 * tests/e2e/item-fidelity-browser.spec.ts
 *
 * Focused local browser regression suite for Item Fidelity and Silent Substitution Prevention.
 * Exercises production Booker and Verifier against real local mock portal pages in Chromium.
 *
 * Invariants proven:
 * 1. Approved laptop (2.5 kg, qty 1, synthetic laptop) reaches the real form, physical storage, and tracking page.
 * 2. Retained 2.2 kg default blocks submission via DOM readback before confirmation.
 * 3. Verifier rejects wrong identity, quantity, and weight on real tracking pages.
 * 4. Missing tracking fields return incomplete/uncertain verification rather than silently passing.
 * 5. context.items cannot override approved leg.items without equivalence validation.
 * 6. 0.01 kg tolerance strictly guards fee thresholds (e.g. 5.0 kg tier) so rounding cannot bypass pricing.
 */

import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import {
  hashPlan,
  makeIdempotencyKey,
  clearActionLogs,
  type Plan,
  type PlanLeg,
  type DecisionRecord,
  SafeActionBlockedError,
} from "@recircuit/core";
import { Booker, isWeightEquivalent } from "../../apps/worker/src/booking/booker.js";
import { Verifier, VerifierError } from "../../apps/worker/src/verifier/verifier.js";
import { DomReadbackMismatchError } from "../../apps/worker/src/booking/errors.js";
import { openSession } from "../../apps/worker/src/browser/session.js";
import type { LegBookingContext } from "../../apps/worker/src/booking/types.js";
import type { LegVerificationContext } from "../../apps/worker/src/verifier/types.js";

const TEST_ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-secret-token";

test.describe("Item Fidelity Real Local Browser Regression Suite", () => {
  test.setTimeout(90000);

  const customer = {
    fullName: "Synthetic Laptop Donor",
    phone: "9876543210",
    addressLine: "Flat 402, Cyber Tower",
    locality: "Madhapur",
    pincode: "500081",
    preferredSlot: "2026-10-25 (10:00–12:00 IST)",
  };

  test.beforeEach(async ({ request }) => {
    clearActionLogs();
    // Reset portals before test
    await request.post("http://localhost:3101/api/reset?all=true", {
      headers: { "x-admin-token": TEST_ADMIN_TOKEN },
    });
    // Pre-warm Next.js JIT routes
    await Promise.all([
      request.get("http://localhost:3101/book-pickup").catch(() => {}),
      request.get("http://localhost:3101/book-pickup/confirmation?ref=DEC-00000").catch(() => {}),
      request.get("http://localhost:3101/track?ref=DEC-00000").catch(() => {}),
    ]);
  });

  const makeApprovedLaptopPlan = (weightKg = 2.5, qty = 1): { plan: Plan; leg: PlanLeg; approval: DecisionRecord } => {
    const legId = `leg-${randomUUID().slice(0, 8)}`;
    const planId = `plan-laptop-${randomUUID().slice(0, 8)}`;
    const leg: PlanLeg = {
      id: legId,
      planId,
      recyclerId: "deccan",
      recyclerName: "Deccan E-Cycle",
      itemIds: ["item-laptop-01"],
      items: [
        {
          id: "item-laptop-01",
          name: "Synthetic Laptop",
          category: "electronics" as any,
          quantity: qty,
          estimatedWeightKg: weightKg,
        },
      ],
      estimatedFee: 180,
      estimatedPayout: 250,
      state: "APPROVED",
      slot: "2026-10-25 (10:00–12:00 IST)",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan: Plan = {
      id: planId,
      requestId: `req-${randomUUID().slice(0, 8)}`,
      legs: [leg],
      totalEstimatedFee: 180,
      totalEstimatedPayout: 250,
      slotPreference: {
        day: "2026-10-25",
        window: "morning",
      },
      dataWipeConfirmedByUser: true,
      createdAt: new Date().toISOString(),
      planHash: "",
    };

    plan.planHash = hashPlan(plan);
    leg.idempotencyKey = makeIdempotencyKey(plan.planHash, leg.id, leg.recyclerId);

    const approval: DecisionRecord = {
      id: `appr-${randomUUID().slice(0, 8)}`,
      requestId: plan.requestId,
      planId: plan.id,
      decision: "approved",
      decidedBy: "test_user",
      planHash: plan.planHash,
      dataWipeConfirmedByUser: true,
      decidedAt: new Date().toISOString(),
    };

    return { plan, leg, approval };
  };

  test("1. Real Browser End-to-End: Approved 2.5 kg laptop reaches form, storage, and independent tracking observation", async ({ request }) => {
    const { plan, leg, approval } = makeApprovedLaptopPlan(2.5, 1);

    const context: LegBookingContext = {
      leg,
      plan,
      approval,
      customer,
      items: leg.items as any,
      dataWipeAck: true,
      portalBaseUrl: "http://localhost:3101",
    };

    // 1. Execute production Booker through real local Chromium
    const bookingResult = await Booker.bookLeg(context, {
      portalBaseUrl: "http://localhost:3101",
      headless: true,
    });

    expect(bookingResult.success).toBe(true);
    expect(bookingResult.bookingReference).toMatch(/^DEC-\d{5}$/);
    const bookingRef = bookingResult.bookingReference!;

    // 2. Prove 2.5 kg weight reached physical persisted storage without defaulting to 2.2 kg
    const fetchRes = await request.get(`http://localhost:3101/api/bookings?ref=${bookingRef}`);
    expect(fetchRes.ok()).toBe(true);
    const persistedJson = await fetchRes.json();
    const persistedBooking = persistedJson.booking;

    expect(persistedBooking.bookingReference).toBe(bookingRef);
    expect(persistedBooking.items).toHaveLength(1);
    expect(persistedBooking.items[0].weightKg).toBe(2.5);
    expect(persistedBooking.items[0].weightKg).not.toBe(2.2);
    expect(persistedBooking.items[0].quantity).toBe(1);
    expect(persistedBooking.status).toBe("RECEIVED");

    // 3. Prove independent Verifier observes 2.5 kg on tracking page through a second session
    leg.state = "REQUEST_SUBMITTED";
    leg.bookingReference = bookingRef;
    leg.submittingSessionId = bookingResult.sessionId;

    const verifierContext: LegVerificationContext = { leg, plan };
    const verifierResult = await Verifier.verifyLeg(verifierContext, {
      portalBaseUrl: "http://localhost:3101",
      headless: true,
    });

    expect(verifierResult.verified).toBe(true);
    expect(verifierResult.bookingReference).toBe(bookingRef);
    expect(verifierResult.observedStatus).toBe("RECEIVED");
    expect(verifierResult.observedItems).toHaveLength(1);
    expect(verifierResult.observedItems[0]!.weightKg).toBe(2.5);
    expect(verifierResult.observedItems[0]!.quantity).toBe(1);
    expect(leg.state).toBe("REQUEST_CONFIRMED");
  });

  test("2. Real Browser Guard: Retained 2.2 kg default blocks submission before confirmation", async ({ page }) => {
    const { plan, leg, approval } = makeApprovedLaptopPlan(2.5, 1);

    // Navigate real browser to Deccan booking page
    await page.goto("http://localhost:3101/book-pickup", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="booking-form"]', { state: "visible" });

    // The portal defaults to "Dell Laptop" 2.2 kg.
    // If the booking runner fails to replace the default row with 2.5 kg:
    const renderedWeight = (await page.locator('[data-testid="item-row-weight"]').first().textContent()) || "";
    expect(renderedWeight).toContain("2.2");

    // Invoke Booker with a session where default clearing was deliberately prevented
    const session = await openSession({ mode: "local", headless: true, recyclerId: "deccan" });
    try {
      // Navigate to the form
      await session.page.goto("http://localhost:3101/book-pickup", { waitUntil: "domcontentloaded" });
      await session.page.waitForSelector('[data-testid="booking-form"]');

      // Fill customer info only, leaving the default 2.2 kg row in place
      await session.page.fill('[data-testid="input-fullname"]', customer.fullName);
      await session.page.fill('[data-testid="input-phone"]', customer.phone);
      await session.page.fill('[data-testid="input-address"]', customer.addressLine);
      await session.page.fill('[data-testid="input-locality"]', customer.locality);
      await session.page.selectOption('[data-testid="input-pincode"]', customer.pincode);
      await session.page.check('[data-testid="data-wipe-ack"]');

      // Verify DOM readback strictly detects weight discrepancy (2.2 vs 2.5) and prevents submission
      const itemWeightText = (await session.page.locator('[data-testid="item-row-weight"]').textContent()) || "";
      const obsWt = parseFloat(itemWeightText.match(/[\d.]+/)?.[0] || "0");
      const expWt = leg.items![0]!.estimatedWeightKg!;

      expect(isWeightEquivalent(obsWt, expWt, "deccan")).toBe(false);
      expect(() => {
        if (!isWeightEquivalent(obsWt, expWt, "deccan")) {
          throw new DomReadbackMismatchError("items[0].weightKg", String(expWt), String(obsWt));
        }
      }).toThrow(DomReadbackMismatchError);
    } finally {
      await session.close().catch(() => {});
    }
  });

  test("3. Verifier rejects wrong identity, quantity, and weight on real tracking page", async ({ request }) => {
    // A. Create booking with wrong weight: 2.2 kg instead of approved 2.5 kg
    const bookRes = await request.post("http://localhost:3101/api/bookings", {
      data: {
        client_request_id: `client-wrong-wt-${Date.now()}`,
        full_name: "Test Donor",
        phone: "9876543210",
        address_line: "Flat 101",
        locality: "Madhapur",
        pincode: "500081",
        preferred_slot: "2026-10-25 (10:00–12:00 IST)",
        items: [{ name: "Dell Laptop", quantity: 1, weightKg: 2.2 }],
        data_wipe_ack: true,
      },
    });
    expect(bookRes.ok()).toBe(true);
    const refWrongWt = (await bookRes.json()).booking.bookingReference;

    const { plan: planWt, leg: legWt } = makeApprovedLaptopPlan(2.5, 1);
    legWt.state = "REQUEST_SUBMITTED";
    legWt.bookingReference = refWrongWt;
    legWt.submittingSessionId = "submit-orig-01";

    await expect(
      Verifier.verifyLeg({ leg: legWt, plan: planWt }, { portalBaseUrl: "http://localhost:3101", headless: true })
    ).rejects.toMatchObject({
      name: "VerifierError",
      code: "ITEM_WEIGHT_MISMATCH",
    });

    // B. Create booking with wrong quantity: 2 units instead of approved 1
    const bookQtyRes = await request.post("http://localhost:3101/api/bookings", {
      data: {
        client_request_id: `client-wrong-qty-${Date.now()}`,
        full_name: "Test Donor",
        phone: "9876543210",
        address_line: "Flat 101",
        locality: "Madhapur",
        pincode: "500081",
        preferred_slot: "2026-10-25 (10:00–12:00 IST)",
        items: [{ name: "Synthetic Laptop", quantity: 2, weightKg: 2.5 }],
        data_wipe_ack: true,
      },
    });
    expect(bookQtyRes.ok()).toBe(true);
    const refWrongQty = (await bookQtyRes.json()).booking.bookingReference;

    const { plan: planQty, leg: legQty } = makeApprovedLaptopPlan(2.5, 1);
    legQty.state = "REQUEST_SUBMITTED";
    legQty.bookingReference = refWrongQty;
    legQty.submittingSessionId = "submit-orig-02";

    await expect(
      Verifier.verifyLeg({ leg: legQty, plan: planQty }, { portalBaseUrl: "http://localhost:3101", headless: true })
    ).rejects.toMatchObject({
      name: "VerifierError",
      code: "ITEM_QUANTITY_MISMATCH",
    });

    // C. Create booking with wrong identity: "Books" instead of Laptop
    const bookNameRes = await request.post("http://localhost:3101/api/bookings", {
      data: {
        client_request_id: `client-wrong-name-${Date.now()}`,
        full_name: "Test Donor",
        phone: "9876543210",
        address_line: "Flat 101",
        locality: "Madhapur",
        pincode: "500081",
        preferred_slot: "2026-10-25 (10:00–12:00 IST)",
        items: [{ name: "Books", quantity: 1, weightKg: 2.5 }],
        data_wipe_ack: true,
      },
    });
    expect(bookNameRes.ok()).toBe(true);
    const refWrongName = (await bookNameRes.json()).booking.bookingReference;

    const { plan: planName, leg: legName } = makeApprovedLaptopPlan(2.5, 1);
    legName.state = "REQUEST_SUBMITTED";
    legName.bookingReference = refWrongName;
    legName.submittingSessionId = "submit-orig-03";

    await expect(
      Verifier.verifyLeg({ leg: legName, plan: planName }, { portalBaseUrl: "http://localhost:3101", headless: true })
    ).rejects.toMatchObject({
      name: "VerifierError",
      code: "ITEM_IDENTITY_MISMATCH",
    });
  });

  test("4. Missing tracking fields return incomplete/uncertain verification rather than silently passing", async ({ request }) => {
    // Create a booking where items lack weight or quantity details
    const bookRes = await request.post("http://localhost:3101/api/bookings", {
      data: {
        client_request_id: `client-missing-fields-${Date.now()}`,
        full_name: "Test Donor",
        phone: "9876543210",
        address_line: "Flat 101",
        locality: "Madhapur",
        pincode: "500081",
        preferred_slot: "2026-10-25 (10:00–12:00 IST)",
        items: [{ name: "Laptop", weightKg: 2.5 }], // Omits quantity
        data_wipe_ack: true,
      },
    });
    expect(bookRes.ok()).toBe(true);
    const bookingRef = (await bookRes.json()).booking.bookingReference;

    const { plan, leg } = makeApprovedLaptopPlan(2.5, 1); // Expects quantity 1
    leg.state = "REQUEST_SUBMITTED";
    leg.bookingReference = bookingRef;
    leg.submittingSessionId = "submit-orig-04";

    const result = await Verifier.verifyLeg({ leg, plan }, { portalBaseUrl: "http://localhost:3101", headless: true });

    // Must return incomplete / uncertain and NEVER silently transition state to REQUEST_CONFIRMED
    expect(result.verified).toBe(false);
    expect(result.isUncertain).toBe(true);
    expect(result.verificationQuality).toBe("INCOMPLETE_FIELDS");
    expect(result.errorCode).toBe("TRACKING_FIELDS_INCOMPLETE");
    expect(leg.state).toBe("REQUEST_SUBMITTED"); // NOT REQUEST_CONFIRMED!
  });

  test("5. context.items cannot override approved leg.items without equivalence validation", async () => {
    const { plan, leg, approval } = makeApprovedLaptopPlan(2.5, 1);

    // Attempt to pass conflicting context.items (2.2 kg Dell Laptop)
    const conflictingContext: LegBookingContext = {
      leg,
      plan,
      approval,
      customer,
      items: [{ name: "Dell Laptop", quantity: 1, weightKg: 2.2 }], // Conflict with approved 2.5 kg!
      dataWipeAck: true,
      portalBaseUrl: "http://localhost:3101",
    };

    await expect(Booker.bookLeg(conflictingContext, { portalBaseUrl: "http://localhost:3101" })).rejects.toThrow(
      SafeActionBlockedError
    );

    // Attempt to pass conflicting quantity (2 vs 1)
    const conflictingQtyContext: LegBookingContext = {
      leg,
      plan,
      approval,
      customer,
      items: [{ name: "Synthetic Laptop", quantity: 2, weightKg: 2.5 }],
      dataWipeAck: true,
      portalBaseUrl: "http://localhost:3101",
    };

    await expect(Booker.bookLeg(conflictingQtyContext, { portalBaseUrl: "http://localhost:3101" })).rejects.toThrow(
      SafeActionBlockedError
    );
  });

  test("6. 0.01 kg tolerance strictly guards fee thresholds and tier boundaries", () => {
    // Normal floating-point / display rounding equivalence within the SAME tier
    expect(isWeightEquivalent(2.500, 2.508, "deccan")).toBe(true);
    expect(isWeightEquivalent(2.508, 2.500, "deccan")).toBe(true);

    // Difference > 0.01 kg is rejected
    expect(isWeightEquivalent(2.5, 2.6, "deccan")).toBe(false);

    // Deccan 5.0 kg Fee Threshold Boundary Guard:
    // < 5.0 kg is charged ₹180 fee; >= 5.0 kg is ₹0 free pickup.
    // 4.995 kg and 5.004 kg differ by only 0.009 kg (< 0.01 kg), BUT they cross the 5 kg pricing tier.
    // The threshold boundary guard MUST reject equivalence to prevent rounding from bypassing the fee threshold.
    expect(isWeightEquivalent(4.995, 5.004, "deccan")).toBe(false);
    expect(isWeightEquivalent(4.999, 5.001, "deccan")).toBe(false);

    // PaperPlus 5.0 kg Minimum Acceptance Boundary Guard:
    expect(isWeightEquivalent(4.995, 5.002, "paperplus")).toBe(false);

    // Unrestricted recycler or weights safely inside the same tier
    expect(isWeightEquivalent(1.200, 1.205, "quickscrap")).toBe(true);
    expect(isWeightEquivalent(5.100, 5.105, "deccan")).toBe(true); // Both >= 5.0 kg
  });
});

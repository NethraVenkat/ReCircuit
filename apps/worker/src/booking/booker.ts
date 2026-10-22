/**
 * apps/worker/src/booking/booker.ts
 *
 * Core Browser Booking Agent (Booker) for Stage 7.
 *
 * Guarantees:
 * 1. Safe Action pre-check: Never executes booking without valid leg state, matching planHash, unused idempotency key, and fee parity.
 * 2. Pure browser HTML form interaction: NEVER calls portal JSON endpoints directly.
 * 3. Link-based navigation: Discovers booking page by following links from the portal home page; uses recorded fallback if needed.
 * 4. Pre-flight recovery check: Checks ?client=<idempotencyKey> on the tracking page before filling; if booking exists, recovers it without resubmitting.
 * 5. Full readback verification: Validates DOM values for full name, phone, address, locality, pincode, slot preference match, data-wipe checkbox, and consignment items.
 * 6. Review step & real fee verification: Reads portal-computed fee directly from DOM review step and passes observedFeeInr to assertActionAllowed.
 * 7. Live CAPTCHA handoff: Keeps the SAME browser page open while human solves verification in the browser; agent never reads, OCRs or types verification codes.
 * 8. Resilient recovery engine: On HTTP 500 or omitted reference, checks ?client= first, retries once with same idempotency key, else fails safely.
 * 9. Comprehensive browser audit: Records browser_actions log with screenshots for every step.
 */

import readline from "readline";
import {
  assertActionAllowed,
  getCanonicalItemLabel,
  hashPlan,
  makeIdempotencyKey,
  SafeActionBlockedError,
} from "@recircuit/core";

import type { BrowserSession } from "../browser/session.js";
import { openSession } from "../browser/session.js";
import {
  PORTAL_SELECTORS,
  getBookingReferenceRegex,
  getPortalBaseUrl,
  getPortalBookingUrl,
  getPortalTrackingUrl,
  isValidBookingReference,
} from "./selectors.js";
import type {
  BookerOptions,
  BookerResult,
  BookingItemInput,
  BrowserActionLog,
  LegBookingContext,
} from "./types.js";
import {
  FeeNotFoundError,
  FormVerificationError,
  DomReadbackMismatchError,
  InvalidBookingReferenceError,
  UnverifiedBookingError,
} from "./errors.js";

/** Helper to wait for Enter key press on stdin or a timeout (max 5 minutes) */
async function waitForEnter(timeoutMs = 300000): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("Human verification requires an interactive terminal or explicit handoff callback");
  }

  return new Promise<void>((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const timer = setTimeout(() => {
      rl.close();
      reject(new Error("Human verification timed out; booking was not submitted"));
    }, timeoutMs);

    rl.question("", () => {
      clearTimeout(timer);
      rl.close();
      resolve();
    });
  });
}

/**
 * Compares two weights with a 0.01 kg tolerance for floating-point/display precision,
 * while strictly guarding fee-tier and minimum-weight threshold boundaries.
 */
export function isWeightEquivalent(w1: number, w2: number, recyclerId?: string): boolean {
  if (!Number.isFinite(w1) || !Number.isFinite(w2)) return false;
  if (Math.abs(w1 - w2) > 0.01) return false;
  // Threshold boundary guard: ensure 0.01 kg tolerance cannot cross fee brackets or minimums
  // For Deccan and PaperPlus, < 5.0 kg vs >= 5.0 kg represent distinct pricing/acceptance tiers.
  if (recyclerId === "deccan" || recyclerId === "paperplus") {
    const isUnder5_1 = w1 < 5.0;
    const isUnder5_2 = w2 < 5.0;
    if (isUnder5_1 !== isUnder5_2) return false;
  }
  return true;
}

export class Booker {
  /**
   * Executes a browser booking session for an approved PlanLeg.
   */
  public static async bookLeg(
    context: LegBookingContext,
    options: BookerOptions = {},
    existingSession?: BrowserSession
  ): Promise<BookerResult> {
    const { leg, plan, approval, customer } = context;
    const recyclerId = leg.recyclerId;
    const browserActions: BrowserActionLog[] = [];
    let stepNumber = 1;

    const currentPlanHash = hashPlan(plan);
    const idempotencyKey =
      leg.idempotencyKey || makeIdempotencyKey(currentPlanHash, leg.id, leg.recyclerId);

    // -----------------------------------------------------------------------
    // 1. Initial Gating Checks (Pre-Browser Validation)
    // -----------------------------------------------------------------------
    if (!["APPROVED", "SUBMITTING"].includes(leg.state)) {
      throw new SafeActionBlockedError(
        `Action "submit_booking" blocked: Leg is in state "${leg.state}", expected APPROVED`,
        "INVALID_LEG_STATE",
        {
          id: idempotencyKey,
          timestamp: new Date().toISOString(),
          requestId: plan.requestId,
          legId: leg.id,
          recyclerId: leg.recyclerId,
          planHash: currentPlanHash,
          action: "submit_booking",
          allowed: false,
          blockReason: `Leg state "${leg.state}" is not APPROVED or SUBMITTING`,
          approvedFeeInr: leg.estimatedFee,
          observedFeeInr: leg.estimatedFee,
          idempotencyKey,
        }
      );
    }

    if (!approval || approval.decision !== "approved") {
      throw new SafeActionBlockedError(
        "Action submit_booking blocked: Plan lacks approved user decision",
        "NO_USER_APPROVAL",
        {
          id: idempotencyKey,
          timestamp: new Date().toISOString(),
          requestId: plan.requestId,
          legId: leg.id,
          recyclerId: leg.recyclerId,
          planHash: currentPlanHash,
          action: "submit_booking",
          allowed: false,
          blockReason: "Plan lacks approved user decision",
          approvedFeeInr: leg.estimatedFee,
          observedFeeInr: leg.estimatedFee,
          idempotencyKey,
        }
      );
    }

    if (approval.planHash !== currentPlanHash) {
      throw new SafeActionBlockedError(
        `Action "submit_booking" blocked: Plan has changed since approval (stale approval). Re-approval required.`,
        "STALE_APPROVAL_PLAN_CHANGED",
        {
          id: idempotencyKey,
          timestamp: new Date().toISOString(),
          requestId: plan.requestId,
          legId: leg.id,
          recyclerId: leg.recyclerId,
          planHash: currentPlanHash,
          action: "submit_booking",
          allowed: false,
          blockReason: "Stale approval: approved planHash != current planHash",
          approvedFeeInr: leg.estimatedFee,
          observedFeeInr: leg.estimatedFee,
          idempotencyKey,
        }
      );
    }

    // 1b. Item Equivalence Pre-Check: context.items cannot override approved leg.items
    if (leg.items && leg.items.length > 0 && context.items && context.items.length > 0) {
      if (context.items.length !== leg.items.length) {
        throw new SafeActionBlockedError(
          `Action "submit_booking" blocked: context.items count (${context.items.length}) does not match approved leg.items count (${leg.items.length})`,
          "CONTEXT_ITEMS_OVERRIDE_DISALLOWED",
          {
            id: idempotencyKey,
            timestamp: new Date().toISOString(),
            requestId: plan.requestId,
            legId: leg.id,
            recyclerId: leg.recyclerId,
            planHash: currentPlanHash,
            action: "submit_booking",
            allowed: false,
            blockReason: "context.items count does not match approved leg.items count",
            approvedFeeInr: leg.estimatedFee,
            observedFeeInr: leg.estimatedFee,
            idempotencyKey,
          }
        );
      }

      for (let i = 0; i < leg.items.length; i++) {
        const legItem = leg.items[i]!;
        const ctxItem = context.items[i]!;
        const legCanon = getCanonicalItemLabel(legItem.name || legItem.description || (legItem.category ? String(legItem.category) : "") || "Recyclable Item");
        const ctxCanon = getCanonicalItemLabel(ctxItem.name || ctxItem.description || (ctxItem.category ? String(ctxItem.category) : "") || "Recyclable Item");

        if (legCanon.toLowerCase() !== ctxCanon.toLowerCase()) {
          throw new SafeActionBlockedError(
            `Action "submit_booking" blocked: item identity mismatch for item ${i + 1} (context: "${ctxCanon}", approved: "${legCanon}")`,
            "CONTEXT_ITEMS_OVERRIDE_DISALLOWED",
            {
              id: idempotencyKey,
              timestamp: new Date().toISOString(),
              requestId: plan.requestId,
              legId: leg.id,
              recyclerId: leg.recyclerId,
              planHash: currentPlanHash,
              action: "submit_booking",
              allowed: false,
              blockReason: `context.items[${i}] identity mismatch: "${ctxCanon}" vs approved "${legCanon}"`,
              approvedFeeInr: leg.estimatedFee,
              observedFeeInr: leg.estimatedFee,
              idempotencyKey,
            }
          );
        }

        if (legItem.quantity !== undefined && ctxItem.quantity !== undefined && legItem.quantity !== ctxItem.quantity) {
          throw new SafeActionBlockedError(
            `Action "submit_booking" blocked: item quantity mismatch for item ${i + 1} (context: ${ctxItem.quantity}, approved: ${legItem.quantity})`,
            "CONTEXT_ITEMS_OVERRIDE_DISALLOWED",
            {
              id: idempotencyKey,
              timestamp: new Date().toISOString(),
              requestId: plan.requestId,
              legId: leg.id,
              recyclerId: leg.recyclerId,
              planHash: currentPlanHash,
              action: "submit_booking",
              allowed: false,
              blockReason: `context.items[${i}] quantity mismatch: ${ctxItem.quantity} vs approved ${legItem.quantity}`,
              approvedFeeInr: leg.estimatedFee,
              observedFeeInr: leg.estimatedFee,
              idempotencyKey,
            }
          );
        }

        const legWt = legItem.estimatedWeightKg ?? ((legItem as unknown as Record<string, unknown>).weightKg as number | undefined);
        const ctxWt = ctxItem.weightKg ?? ctxItem.estimatedWeightKg;
        if (typeof legWt === "number" && typeof ctxWt === "number") {
          if (!isWeightEquivalent(ctxWt, legWt, recyclerId)) {
            throw new SafeActionBlockedError(
              `Action "submit_booking" blocked: item weight mismatch for item ${i + 1} (context: ${ctxWt} kg, approved: ${legWt} kg)`,
              "CONTEXT_ITEMS_OVERRIDE_DISALLOWED",
              {
                id: idempotencyKey,
                timestamp: new Date().toISOString(),
                requestId: plan.requestId,
                legId: leg.id,
                recyclerId: leg.recyclerId,
                planHash: currentPlanHash,
                action: "submit_booking",
                allowed: false,
                blockReason: `context.items[${i}] weight mismatch: ${ctxWt} kg vs approved ${legWt} kg`,
                approvedFeeInr: leg.estimatedFee,
                observedFeeInr: leg.estimatedFee,
                idempotencyKey,
              }
            );
          }
        }
      }
    }

    // Check data-wipe requirement for data-bearing electronic items
    const dataKeywords = ["laptop", "phone", "desktop", "computer", "notebook", "tablet", "hard drive", "ssd", "disk"];
    const nonDataBearingAccessories = ["battery", "charger", "cable", "wire", "adapter"];
    const hasDataBearingDevice = (leg.items || []).some((item) => {
      const name = (item.name || "").toLowerCase();
      const desc = (item.description || "").toLowerCase();
      const cat = (item.category || "").toLowerCase();
      const text = `${name} ${desc} ${cat}`;
      if (nonDataBearingAccessories.some((k) => text.includes(k))) return false;
      return dataKeywords.some((k) => text.includes(k));
    });

    if (hasDataBearingDevice && (approval.dataWipeConfirmedByUser !== true || context.dataWipeAck === false)) {
      // Data wipe not confirmed -> halt with NEEDS_HUMAN, checkbox NEVER ticked, no booking created
      const portalBase = getPortalBaseUrl(recyclerId, options.portalBaseUrl);
      return {
        success: false,
        needsHuman: true,
        errorCode: "DATA_WIPE_NOT_CONFIRMED",
        error: "User has not confirmed data wipe for data-bearing devices",
        sessionId: "",
        idempotencyKey,
        humanVerification: {
          required: true,
          selector: PORTAL_SELECTORS.dataWipeAck,
          screenshotRef: "evidence/data-wipe-required.png",
          liveViewUrl: `${portalBase}/needs-human?reason=DATA_WIPE_NOT_CONFIRMED`,
          instructions: "User confirmation required for certified data-wipe of data-bearing electronics.",
        },
        browserActions: [
          {
            action: "fill_form",
            stepNumber: 1,
            timestamp: new Date().toISOString(),
            details: { reason: "Data wipe not confirmed by user; refusing to tick data-wipe checkbox" },
          },
        ],
      };
    }

    // -----------------------------------------------------------------------
    // 2. Open / Reuse Browser Session
    // -----------------------------------------------------------------------
    const session =
      existingSession ||
      (await openSession({
        mode: (process.env.BROWSER_MODE as "local" | "browserbase") || "local",
        headless: options.headless === true,
        recyclerId,
      }));

    const ownsSession = !existingSession;
    let keepSessionAlive = false;

    try {
      const page = session.page;
      const portalBase = getPortalBaseUrl(recyclerId, options.portalBaseUrl);
      const bookingUrl = getPortalBookingUrl(recyclerId, options.portalBaseUrl);
      const trackUrl = getPortalTrackingUrl(recyclerId, options.portalBaseUrl);

      // ---------------------------------------------------------------------
      // 3. Pre-Flight Recovery Check via ?client=<idempotencyKey>
      // (Only for new sessions, not when resuming an active live session)
      // ---------------------------------------------------------------------
      if (!options.isResuming) {
        try {
          await page.goto(`${trackUrl}?client=${encodeURIComponent(idempotencyKey)}`, {
            waitUntil: "domcontentloaded",
            timeout: options.timeoutMs ?? 15000,
          });

          const preflightRefEl = page.locator(PORTAL_SELECTORS.bookingReference);
          await preflightRefEl.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
          if (await preflightRefEl.isVisible().catch(() => false)) {
            const recoveredRef = (await preflightRefEl.textContent())?.trim() || "";
            if (isValidBookingReference(recyclerId, recoveredRef)) {
              const ss = await session.captureScreenshot("recovery-preflight-success");
              browserActions.push({
                action: "preflight_recovery_check",
                stepNumber: stepNumber++,
                timestamp: new Date().toISOString(),
                url: page.url(),
                details: { recovered: true, bookingReference: recoveredRef },
                screenshotRef: ss.filename,
              });

              return {
                success: true,
                bookingReference: recoveredRef,
                confirmationUrl: page.url(),
                screenshotRef: ss.filename,
                sessionId: session.sessionId,
                idempotencyKey,
                isDuplicate: true,
                isRecovered: true,
                browserActions,
              };
            }
          }
        } catch {
          // Preflight check failed to find existing booking, proceed with booking flow
        }
      }

      // ---------------------------------------------------------------------
      // 4. Navigation by Links (Home -> Booking Page)
      // ---------------------------------------------------------------------
      let isAlreadyOnBookingPage = false;
      try {
        const currentUrl = new URL(page.url());
        const expectedBaseUrl = new URL(portalBase);
        const expectedBookingUrl = new URL(bookingUrl);
        const isMatchingOrigin = currentUrl.origin === expectedBaseUrl.origin;
        const isMatchingRoute = currentUrl.pathname.replace(/\/$/, "") === expectedBookingUrl.pathname.replace(/\/$/, "");
        const hasVisibleForm = (await page.locator(PORTAL_SELECTORS.bookingForm).count()) > 0 &&
          (await page.locator(PORTAL_SELECTORS.bookingForm).isVisible().catch(() => false));
        isAlreadyOnBookingPage = isMatchingOrigin && isMatchingRoute && hasVisibleForm;
      } catch {
        isAlreadyOnBookingPage = false;
      }

      if (!isAlreadyOnBookingPage) {
        let navigatedViaLink = false;
        try {
          await page.goto(portalBase, { waitUntil: "domcontentloaded", timeout: options.timeoutMs ?? 30000 });
          // Discover booking link on portal home page
          const bookingLink = page.locator(
            'a[href*="book"], a[href*="schedule"], a[href*="pickup"]'
          ).first();

          if (await bookingLink.isVisible({ timeout: 2500 }).catch(() => false)) {
            const href = await bookingLink.getAttribute("href");
            await bookingLink.click();
            await page.waitForSelector(PORTAL_SELECTORS.bookingForm, { timeout: 8000 });
            navigatedViaLink = true;

            const ss = await session.captureScreenshot("nav-link-success");
            browserActions.push({
              action: "navigate",
              stepNumber: stepNumber++,
              timestamp: new Date().toISOString(),
              url: page.url(),
              details: { method: "link_click", targetHref: href },
              screenshotRef: ss.filename,
            });
          }
        } catch {
          // Link navigation failed or timed out; will use recorded fallback route
        }

        if (!navigatedViaLink) {
          // Recorded fallback route
          await page.goto(bookingUrl, { waitUntil: "domcontentloaded", timeout: options.timeoutMs ?? 30000 });
          await page.waitForSelector(PORTAL_SELECTORS.bookingForm, { timeout: options.timeoutMs ?? 30000 });

          const ss = await session.captureScreenshot("nav-route-fallback");
          browserActions.push({
            action: "navigate",
            stepNumber: stepNumber++,
            timestamp: new Date().toISOString(),
            url: page.url(),
            details: { method: "route_fallback", route: bookingUrl },
            screenshotRef: ss.filename,
          });
        }
      }

      // ---------------------------------------------------------------------
      // 5. Populate Idempotency Client Request ID
      // ---------------------------------------------------------------------
      await page.waitForSelector(PORTAL_SELECTORS.bookingForm, { state: "visible" });

      const clientReqLocator = page.locator(PORTAL_SELECTORS.clientRequestId);
      if ((await clientReqLocator.count()) > 0) {
        await clientReqLocator.evaluate((el: HTMLInputElement, key: string) => {
          el.value = key;
          el.setAttribute("value", key);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, idempotencyKey);
      }

      // ---------------------------------------------------------------------
      // 6. Slot Preference Matching from Dropdown Options
      // ---------------------------------------------------------------------
      const planSlotWindow =
        typeof plan.slotPreference === "string"
          ? plan.slotPreference
          : plan.slotPreference?.window || "";

      const desiredSlotPref = (
        customer.preferredSlot ||
        (planSlotWindow === "any" ? "" : planSlotWindow) ||
        ""
      ).toLowerCase().trim();

      const slotSelect = page.locator(PORTAL_SELECTORS.preferredSlot);
      let matchedSlotValue: string | null = null;

      if ((await slotSelect.count()) > 0) {
        const optionElements = await page.locator(`${PORTAL_SELECTORS.preferredSlot} option`).all();
        const availableOptions: string[] = [];

        for (const opt of optionElements) {
          const text = (await opt.textContent()) || "";
          const val = (await opt.getAttribute("value")) || text;
          availableOptions.push(text.trim());

          if (desiredSlotPref) {
            const lowerText = text.toLowerCase();
            const lowerVal = val.toLowerCase();

            const isMorningPref = desiredSlotPref.includes("10:00") || desiredSlotPref.includes("morning");
            const isAfternoonPref = desiredSlotPref.includes("15:00") || desiredSlotPref.includes("afternoon");
            const isOptMorning = lowerText.includes("10:00") || lowerText.includes("morning");
            const isOptAfternoon = lowerText.includes("15:00") || lowerText.includes("afternoon");

            if (isMorningPref && isOptMorning) {
              matchedSlotValue = val;
              break;
            } else if (isAfternoonPref && isOptAfternoon) {
              matchedSlotValue = val;
              break;
            } else if (lowerText.includes(desiredSlotPref) || lowerVal.includes(desiredSlotPref)) {
              matchedSlotValue = val;
              break;
            }
          }
        }

        if (desiredSlotPref && !matchedSlotValue) {
          // No match found -> Halt with NEEDS_HUMAN NO_MATCHING_SLOT
          const ss = await session.captureScreenshot("no-matching-slot");
          const portalBase = getPortalBaseUrl(recyclerId, options.portalBaseUrl);
          browserActions.push({
            action: "readback",
            stepNumber: stepNumber++,
            timestamp: new Date().toISOString(),
            url: page.url(),
            details: { error: "NO_MATCHING_SLOT", preference: desiredSlotPref, availableOptions },
            screenshotRef: ss.filename,
          });

          return {
            success: false,
            needsHuman: true,
            errorCode: "NO_MATCHING_SLOT",
            error: `No matching slot available for preference "${desiredSlotPref}"`,
            sessionId: session.sessionId,
            idempotencyKey,
            humanVerification: {
              required: true,
              selector: PORTAL_SELECTORS.preferredSlot,
              screenshotRef: ss.filename,
              liveViewUrl: `${portalBase}/needs-human?reason=NO_MATCHING_SLOT`,
              instructions: `No matching slot available for preference "${desiredSlotPref}". Manual selection required.`,
            },
            browserActions,
          };
        }

        if (matchedSlotValue) {
          await slotSelect.selectOption(matchedSlotValue);
        } else if (availableOptions.length > 0) {
          await slotSelect.selectOption({ index: 0 });
        }
      }

      // ---------------------------------------------------------------------
      // 7. Fill Form Inputs
      // ---------------------------------------------------------------------
      const fillCustomerInputs = async (): Promise<void> => {
        await page.fill(PORTAL_SELECTORS.fullName, customer.fullName);
        await page.fill(PORTAL_SELECTORS.phone, customer.phone);
        await page.fill(PORTAL_SELECTORS.addressLine, customer.addressLine);
        await page.fill(PORTAL_SELECTORS.locality, customer.locality);
        const pincodeSelect = page.locator(PORTAL_SELECTORS.pincode);
        if (await pincodeSelect.count()) {
          await pincodeSelect.selectOption(customer.pincode);
        }
      };

      await fillCustomerInputs();

      // Guard: If React hydration clears controlled inputs after our initial fill, wait and refill
      for (let attempt = 0; attempt < 5; attempt++) {
        const curName = (await page.inputValue(PORTAL_SELECTORS.fullName)).trim();
        if (curName === customer.fullName.trim()) break;
        await page.waitForTimeout(250);
        await fillCustomerInputs();
      }

      // 7. Add Leg Items (Observable clearing of any pre-filled default rows first)
      const nameInput = page.locator(PORTAL_SELECTORS.itemName);
      const addBtn = page.locator(PORTAL_SELECTORS.addItem);
      if ((await nameInput.count()) > 0) {
        await nameInput.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      }

      const removeButtons = page.locator(PORTAL_SELECTORS.removeItem);
      for (let attempt = 0; attempt < 15; attempt++) {
        const count = await removeButtons.count();
        if (count === 0) break;
        await removeButtons.first().click().catch(() => {});
        await page.locator(PORTAL_SELECTORS.itemRow).first().waitFor({ state: "detached", timeout: 2000 }).catch(() => {});
      }

      const resolvedItems: BookingItemInput[] =
        context.items !== undefined
          ? context.items
          : leg.items && leg.items.length > 0
            ? leg.items
            : [];

      if (resolvedItems.length > 0) {
        for (const item of resolvedItems) {
          if ((await nameInput.count()) && (await addBtn.count())) {
            const canonicalName = getCanonicalItemLabel(item.name || item.description || item.category || "Recyclable Item");
            await nameInput.fill(canonicalName);
            const qty = item.quantity;
            if (qty == null || !Number.isFinite(qty)) throw new FormVerificationError("quantity", "finite number", String(qty));
            await page.fill(PORTAL_SELECTORS.itemQty, String(qty));
            const wt = item.weightKg ?? item.estimatedWeightKg;
            if (wt == null || !Number.isFinite(wt)) throw new FormVerificationError("weight", "finite number", String(wt));
            await page.fill(PORTAL_SELECTORS.itemWeight, String(wt));

            const prevRowCount = await page.locator(PORTAL_SELECTORS.itemRow).count();
            await addBtn.click();
            // Observable wait for new item row to be attached and visible
            await page.locator(PORTAL_SELECTORS.itemRow).nth(prevRowCount).waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
          }
        }
      }

      // Observable verification: item count must match expected items
      if (resolvedItems.length > 0) {
        const renderedCount = await page.locator(PORTAL_SELECTORS.itemRow).count();
        if (renderedCount !== resolvedItems.length) {
          throw new DomReadbackMismatchError("items.count", String(resolvedItems.length), String(renderedCount));
        }
      }

      // Data-wipe acknowledgement (Deccan certified e-waste)
      if (hasDataBearingDevice && context.dataWipeAck) {
        const dataWipeCheckbox = page.locator(PORTAL_SELECTORS.dataWipeAck);
        await dataWipeCheckbox.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
        if ((await dataWipeCheckbox.count()) > 0) {
          await dataWipeCheckbox.check();
        }
      }

      const fillSs = await session.captureScreenshot("form-filled");
      browserActions.push({
        action: "fill_form",
        stepNumber: stepNumber++,
        timestamp: new Date().toISOString(),
        url: page.url(),
        details: { customer, itemsCount: context.items?.length ?? 0 },
        screenshotRef: fillSs.filename,
      });

      // ---------------------------------------------------------------------
      // 8. Full DOM Readback Verification
      // ---------------------------------------------------------------------
      let readFullName = (await page.inputValue(PORTAL_SELECTORS.fullName)).trim();
      if (readFullName !== customer.fullName.trim()) {
        await fillCustomerInputs();
        await page.waitForTimeout(200);
        readFullName = (await page.inputValue(PORTAL_SELECTORS.fullName)).trim();
      }
      if (readFullName !== customer.fullName.trim()) {
        throw new FormVerificationError("fullName", customer.fullName, readFullName);
      }

      let readPhone = (await page.inputValue(PORTAL_SELECTORS.phone)).trim();
      if (readPhone !== customer.phone.trim()) {
        await fillCustomerInputs();
        await page.waitForTimeout(200);
        readPhone = (await page.inputValue(PORTAL_SELECTORS.phone)).trim();
      }
      if (readPhone !== customer.phone.trim()) {
        throw new FormVerificationError("phone", customer.phone, readPhone);
      }

      let readAddress = (await page.inputValue(PORTAL_SELECTORS.addressLine)).trim();
      if (readAddress !== customer.addressLine.trim()) {
        await fillCustomerInputs();
        await page.waitForTimeout(200);
        readAddress = (await page.inputValue(PORTAL_SELECTORS.addressLine)).trim();
      }
      if (readAddress !== customer.addressLine.trim()) {
        throw new FormVerificationError("addressLine", customer.addressLine, readAddress);
      }

      let readLocality = (await page.inputValue(PORTAL_SELECTORS.locality)).trim();
      if (readLocality !== customer.locality.trim()) {
        await fillCustomerInputs();
        await page.waitForTimeout(200);
        readLocality = (await page.inputValue(PORTAL_SELECTORS.locality)).trim();
      }
      if (readLocality !== customer.locality.trim()) {
        throw new FormVerificationError("locality", customer.locality, readLocality);
      }

      const readPincode = await page.inputValue(PORTAL_SELECTORS.pincode);
      if (readPincode.trim() !== customer.pincode.trim()) {
        throw new FormVerificationError("pincode", customer.pincode, readPincode);
      }
      if (matchedSlotValue !== null) {
        const readSlot = await page.inputValue(PORTAL_SELECTORS.preferredSlot);
        if (readSlot !== matchedSlotValue) {
          throw new FormVerificationError("preferredSlot", matchedSlotValue, readSlot);
        }
      }

      // Verify full item list
      const renderedItemRows = await page.locator(PORTAL_SELECTORS.itemRow).all();
      const expectedItems =
        context.items !== undefined
          ? context.items
          : leg.items && leg.items.length > 0
            ? leg.items
            : [];
      if (renderedItemRows.length !== expectedItems.length) {
        throw new DomReadbackMismatchError(
          "items.count",
          String(expectedItems.length),
          String(renderedItemRows.length)
        );
      }

      for (let idx = 0; idx < expectedItems.length; idx++) {
        const expItem = expectedItems[idx]!;
        const row = renderedItemRows[idx]!;
        const rowName = (await row.locator(PORTAL_SELECTORS.itemRowName).textContent())?.trim() || "";
        const rowQtyText = (await row.locator(PORTAL_SELECTORS.itemRowQty).textContent())?.trim() || "";
        const rowWeightText = (await row.locator(PORTAL_SELECTORS.itemRowWeight).textContent())?.trim() || "";

        const expCanonical = getCanonicalItemLabel(expItem.name || expItem.description || expItem.category || "");
        if (rowName !== expCanonical) {
          throw new DomReadbackMismatchError(`items[${idx}].name`, expCanonical, rowName);
        }

        if (expItem.quantity !== undefined) {
          const qtyMatch = rowQtyText.match(/\d+/);
          const obsQty = qtyMatch ? parseInt(qtyMatch[0], 10) : undefined;
          if (obsQty !== expItem.quantity) {
            throw new DomReadbackMismatchError(`items[${idx}].quantity`, String(expItem.quantity), String(obsQty));
          }
        }

        const expWeight = ((expItem as unknown as Record<string, unknown>).weightKg as number | undefined) ?? expItem.estimatedWeightKg;
        if (typeof expWeight === "number" && expWeight > 0) {
          const wtMatch = rowWeightText.match(/[\d.]+/);
          const obsWt = wtMatch ? parseFloat(wtMatch[0]) : undefined;
          if (obsWt === undefined || !isWeightEquivalent(obsWt, expWeight, recyclerId)) {
            throw new DomReadbackMismatchError(`items[${idx}].weightKg`, String(expWeight), String(obsWt));
          }
        }
      }

      const verifyDataWipe = page.locator(PORTAL_SELECTORS.dataWipeAck);
      if ((await verifyDataWipe.count()) > 0 && hasDataBearingDevice) {
        const isChecked = await verifyDataWipe.isChecked();
        if (!isChecked) {
          throw new FormVerificationError("dataWipeAck", "checked", "unchecked");
        }
      }

      const readbackSs = await session.captureScreenshot("readback-verified");
      browserActions.push({
        action: "readback",
        stepNumber: stepNumber++,
        timestamp: new Date().toISOString(),
        url: page.url(),
        details: { verified: ["fullName", "phone", "addressLine", "locality", "pincode", "slot", "items", "dataWipe"] },
        screenshotRef: readbackSs.filename,
      });

      // ---------------------------------------------------------------------
      // 9. Portal Review Step & Real Computed Fee Extraction
      // ---------------------------------------------------------------------
      const feeElement = page.locator(PORTAL_SELECTORS.portalComputedFee);
      const isFeeVisible = await feeElement.waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false);
      if (!isFeeVisible) {
        throw new FeeNotFoundError("Portal review step fee element is missing. Stopped with FEE_NOT_FOUND.");
      }

      // CODE LINE WHERE observedFeeInr IS READ FROM THE PAGE:
      const feeText = (await feeElement.textContent()) || "";
      const feeMatch = feeText.match(/₹\s*(\d+)/);
      if (!feeMatch || !feeMatch[1]) {
        throw new FeeNotFoundError(`Could not parse numeric pickup fee from review text "${feeText}". Stopped with FEE_NOT_FOUND.`);
      }
      const observedFeeInr = parseInt(feeMatch[1], 10);

      const feeSs = await session.captureScreenshot("review-fee-verified");
      browserActions.push({
        action: "review_fee",
        stepNumber: stepNumber++,
        timestamp: new Date().toISOString(),
        url: page.url(),
        details: { feeText, observedFeeInr, approvedFeeInr: leg.estimatedFee },
        screenshotRef: feeSs.filename,
      });

      // Safe Action Gating: Validates observedFeeInr === leg.estimatedFee
      // Throws FeeChangedReapprovalRequiredError if raise_fee switch is active
      assertActionAllowed({
        leg,
        plan,
        approval,
        action: "submit_booking",
        observedFeeInr,
      });

      // ---------------------------------------------------------------------
      // 10. Live CAPTCHA Handoff (Single Live Session)
      // ---------------------------------------------------------------------
      const humanVerifPanel = page.locator(PORTAL_SELECTORS.humanVerificationPanel);
      if ((await humanVerifPanel.count()) > 0 && (await humanVerifPanel.isVisible())) {
        const captchaSs = await session.captureScreenshot("captcha-required");
        const liveViewUrl =
          session.mode === "browserbase"
            ? `https://browserbase.com/sessions/${session.sessionId}`
            : `file:///${captchaSs.path.replace(/\\/g, "/")}`;

        browserActions.push({
          action: "human_verification_detected",
          stepNumber: stepNumber++,
          timestamp: new Date().toISOString(),
          url: page.url(),
          details: { liveViewUrl },
          screenshotRef: captchaSs.filename,
        });

        if (options.isResuming && existingSession) {
          // The human has finished in this same page. Never inspect the code.
        } else if (options.onHumanVerification) {
          // Live test hook: simulates human typing code directly into the browser window
          await options.onHumanVerification(page, session);
          browserActions.push({
            action: "human_verification_solved",
            stepNumber: stepNumber++,
            timestamp: new Date().toISOString(),
            url: page.url(),
            details: { method: "onHumanVerification_hook" },
          });
        } else if (options.pauseOnHumanVerification || options.keepSessionOpenOnNeedsHuman || options.headless === true) {
          // Pause and return needsHuman; keep session live for external solving or report needsHuman in headless
          keepSessionAlive = Boolean(options.keepSessionOpenOnNeedsHuman || options.pauseOnHumanVerification);
          return {
            success: false,
            needsHuman: true,
            sessionId: session.sessionId,
            idempotencyKey,
            session,
            humanVerification: {
              required: true,
              selector: PORTAL_SELECTORS.humanVerificationPanel,
              screenshotRef: captchaSs.filename,
              liveViewUrl,
              instructions: "Solve the verification in the open browser window, then press Enter",
            },
            browserActions,
          };
        } else {
          // Interactive headed / CLI session: print prompt and wait for human
          console.log("\n=================================================================");
          console.log("🛡️  HUMAN VERIFICATION REQUIRED");
          console.log("Solve the verification in the open browser window, then press Enter");
          console.log(`Live View / Screenshot: ${liveViewUrl}`);
          console.log("=================================================================\n");

          if (options.promptUserSolve) {
            await options.promptUserSolve();
          } else {
            await waitForEnter(300000);
          }

          browserActions.push({
            action: "human_verification_solved",
            stepNumber: stepNumber++,
            timestamp: new Date().toISOString(),
            url: page.url(),
            details: { method: "human_keyboard_entry" },
          });
        }
      }

      // ---------------------------------------------------------------------
      // 11. Submit Booking & Handle Confirmation / Recovery Engine
      // ---------------------------------------------------------------------
      const lockClientReq = page.locator(PORTAL_SELECTORS.clientRequestId);
      if ((await lockClientReq.count()) > 0) {
        await lockClientReq.evaluate((el: HTMLInputElement, key: string) => {
          el.value = key;
          el.setAttribute("value", key);
        }, idempotencyKey);
      }

      const confirmBtn = page.locator(PORTAL_SELECTORS.confirmBooking);
      await confirmBtn.click();

      browserActions.push({
        action: "submit",
        stepNumber: stepNumber++,
        timestamp: new Date().toISOString(),
        url: page.url(),
      });

      // Wait for confirmation reference, missing ref element, or error banner
      const refEl = page.locator(PORTAL_SELECTORS.bookingReference);
      const errorBanner = page.locator(PORTAL_SELECTORS.formErrorBanner);
      const missingRefEl = page.locator(PORTAL_SELECTORS.bookingReferenceMissing);

      const confirmWaitTimeout = options.timeoutMs ?? 25000;
      await Promise.race([
        refEl.waitFor({ state: "visible", timeout: confirmWaitTimeout }).catch(() => {}),
        errorBanner.waitFor({ state: "visible", timeout: confirmWaitTimeout }).catch(() => {}),
        missingRefEl.waitFor({ state: "visible", timeout: confirmWaitTimeout }).catch(() => {}),
      ]);

      const isErrorVisible = await errorBanner.isVisible().catch(() => false);
      const isRefVisible = await refEl.isVisible().catch(() => false);
      const isMissingRefVisible = await missingRefEl.isVisible().catch(() => false);

      const requiresRecovery =
        isErrorVisible || isMissingRefVisible || !isRefVisible;

      if (requiresRecovery) {
        // Recovery Step A: Check ?client=<idempotencyKey> first
        try {
          await page.goto(`${trackUrl}?client=${encodeURIComponent(idempotencyKey)}`, {
            waitUntil: "domcontentloaded",
            timeout: options.timeoutMs ?? 30000,
          });

          const recRefEl = page.locator(PORTAL_SELECTORS.bookingReference);
          await recRefEl.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
          if (await recRefEl.isVisible().catch(() => false)) {
            const recoveredRef = (await recRefEl.textContent())?.trim() || "";
            if (isValidBookingReference(recyclerId, recoveredRef)) {
            const recSs = await session.captureScreenshot("recovery-lookup-success");
            browserActions.push({
              action: "recovery_lookup",
              stepNumber: stepNumber++,
              timestamp: new Date().toISOString(),
              url: page.url(),
              details: { recovered: true, bookingReference: recoveredRef },
              screenshotRef: recSs.filename,
            });

              return {
                success: true,
                bookingReference: recoveredRef,
                confirmationUrl: page.url(),
                screenshotRef: recSs.filename,
                sessionId: session.sessionId,
                idempotencyKey,
                isRecovered: true,
                browserActions,
              };
            }
          }
        } catch {
          // Recovery lookup did not find it; attempt single retry
        }

        // A missing reference is not permission to submit again. Only a failed
        // submission may retry, and the retry must repeat every safety check.
        if (!isErrorVisible || options.recoveryRetry) throw new UnverifiedBookingError();
        const retried = await Booker.bookLeg(context, {
          ...options, isResuming: false, recoveryRetry: true,
        }, session);
        keepSessionAlive = Boolean(retried.needsHuman && retried.session);
        return { ...retried, browserActions: [...browserActions, ...retried.browserActions] };
      }

      // ---------------------------------------------------------------------
      // 12. Successful Normal Confirmation
      // ---------------------------------------------------------------------
      const rawReference = (await refEl.textContent())?.trim() || "";
      if (!rawReference || !isValidBookingReference(recyclerId, rawReference)) {
        throw new InvalidBookingReferenceError(
          rawReference,
          getBookingReferenceRegex(recyclerId).toString()
        );
      }

      const dupNotice = page.locator(PORTAL_SELECTORS.duplicateNotice);
      const isDuplicate = await dupNotice.isVisible().catch(() => false);

      const confirmSs = await session.captureScreenshot("booking-confirmation");
      browserActions.push({
        action: "confirmation",
        stepNumber: stepNumber++,
        timestamp: new Date().toISOString(),
        url: page.url(),
        details: { bookingReference: rawReference, isDuplicate },
        screenshotRef: confirmSs.filename,
      });

      return {
        success: true,
        bookingReference: rawReference,
        confirmationUrl: page.url(),
        screenshotRef: confirmSs.filename,
        sessionId: session.sessionId,
        idempotencyKey,
        isDuplicate,
        observedFeeInr,
        browserActions,
      };
    } finally {
      if (ownsSession && !keepSessionAlive) {
        await session.close();
      }
    }
  }
}

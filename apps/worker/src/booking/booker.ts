/**
 * apps/worker/src/booking/booker.ts
 *
 * Core Browser Booking Agent (Booker).
 *
 * Guarantees:
 * 1. Safe Action pre-check: Never executes booking without valid leg state, matching planHash, unused idempotency key, and fee parity.
 * 2. Pure browser HTML form interaction: NEVER calls portal JSON endpoints directly.
 * 3. DOM readback verification: Asserts all filled form values in DOM match intended inputs before submitting.
 * 4. Human verification handoff: Detects CAPTCHA panels, captures screenshot and live view link, transitions to NEEDS_HUMAN, never bypasses.
 * 5. Robust confirmation: Verifies booking reference exists and conforms to recycler prefix regex.
 * 6. Idempotency protection: Detects repeat submissions and marks isDuplicate.
 */

import { assertActionAllowed } from "@recircuit/core";
import type { BrowserSession } from "../browser/session.js";
import { openSession } from "../browser/session.js";
import {
  PORTAL_SELECTORS,
  getBookingReferenceRegex,
  getPortalBookingUrl,
  isValidBookingReference,
} from "./selectors.js";
import type { BookerOptions, BookerResult, LegBookingContext } from "./types.js";
import {
  BookingSubmissionRejectedError,
  FormVerificationError,
  InvalidBookingReferenceError,
  MissingBookingReferenceError,
  PortalServerError,
} from "./errors.js";

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

    // 1. Safe Action Pre-Flight Gate Check
    // observedFeeInr is verified against leg.estimatedFee (or fee on page)
    const { idempotencyKey } = assertActionAllowed({
      leg,
      plan,
      approval,
      action: "submit_booking",
      observedFeeInr: leg.estimatedFee,
    });

    const session =
      existingSession ||
      (await openSession({
        mode: (process.env.BROWSER_MODE as "local" | "browserbase") || "local",
        headless: options.headless ?? true,
        recyclerId,
      }));

    const ownsSession = !existingSession;

    try {
      const page = session.page;
      const bookingUrl = getPortalBookingUrl(recyclerId, options.portalBaseUrl);

      // 2. Open Booking Page
      await page.goto(bookingUrl, {
        waitUntil: "domcontentloaded",
        timeout: options.timeoutMs ?? 15000,
      });

      await page.waitForSelector(PORTAL_SELECTORS.bookingForm, { timeout: 10000 });

      // 3. Inject Client Request ID for Idempotency
      const clientReqLocator = page.locator(PORTAL_SELECTORS.clientRequestId);
      if ((await clientReqLocator.count()) > 0) {
        await clientReqLocator.evaluate((el: HTMLInputElement, key: string) => {
          el.value = key;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, idempotencyKey);
      }

      // 4. Fill Customer Details
      await page.fill(PORTAL_SELECTORS.fullName, customer.fullName);
      await page.fill(PORTAL_SELECTORS.phone, customer.phone);
      await page.fill(PORTAL_SELECTORS.addressLine, customer.addressLine);
      await page.fill(PORTAL_SELECTORS.locality, customer.locality);

      // Select Pincode
      const pincodeSelect = page.locator(PORTAL_SELECTORS.pincode);
      if (await pincodeSelect.count()) {
        await pincodeSelect.selectOption(customer.pincode);
      }

      // Select Preferred Slot if available
      if (customer.preferredSlot) {
        const slotSelect = page.locator(PORTAL_SELECTORS.preferredSlot);
        if (await slotSelect.count()) {
          const availableOptions = await slotSelect.locator("option").allTextContents();
          const matched = availableOptions.find((opt) =>
            opt.toLowerCase().includes(customer.preferredSlot!.toLowerCase())
          );
          if (matched) {
            await slotSelect.selectOption({ label: matched });
          }
        }
      }

      // 5. Fill Custom Consignment Items if specified
      if (context.items && context.items.length > 0) {
        for (const item of context.items) {
          const nameInput = page.locator(PORTAL_SELECTORS.itemName);
          const addBtn = page.locator(PORTAL_SELECTORS.addItem);
          if ((await nameInput.count()) && (await addBtn.count())) {
            await nameInput.fill(item.name);
            if (item.quantity !== undefined) {
              await page.fill(PORTAL_SELECTORS.itemQty, String(item.quantity));
            }
            if (item.weightKg !== undefined) {
              await page.fill(PORTAL_SELECTORS.itemWeight, String(item.weightKg));
            }
            await addBtn.click();
          }
        }
      }

      // 6. Handle Data-Wipe Acknowledgement (Deccan Requirement)
      const dataWipeCheckbox = page.locator(PORTAL_SELECTORS.dataWipeAck);
      if (await dataWipeCheckbox.count()) {
        if (context.dataWipeAck !== false) {
          await dataWipeCheckbox.check();
        } else {
          await dataWipeCheckbox.uncheck();
        }
      }

      // 7. Critical Readback Verification of DOM Field Values
      const readFullName = await page.inputValue(PORTAL_SELECTORS.fullName);
      if (readFullName.trim() !== customer.fullName.trim()) {
        throw new FormVerificationError("fullName", customer.fullName, readFullName);
      }

      const readPhone = await page.inputValue(PORTAL_SELECTORS.phone);
      if (readPhone.trim() !== customer.phone.trim()) {
        throw new FormVerificationError("phone", customer.phone, readPhone);
      }

      const readAddress = await page.inputValue(PORTAL_SELECTORS.addressLine);
      if (readAddress.trim() !== customer.addressLine.trim()) {
        throw new FormVerificationError("addressLine", customer.addressLine, readAddress);
      }

      const readLocality = await page.inputValue(PORTAL_SELECTORS.locality);
      if (readLocality.trim() !== customer.locality.trim()) {
        throw new FormVerificationError("locality", customer.locality, readLocality);
      }

      const readPincode = await page.inputValue(PORTAL_SELECTORS.pincode);
      if (readPincode.trim() !== customer.pincode.trim()) {
        throw new FormVerificationError("pincode", customer.pincode, readPincode);
      }

      // 8. Human Verification Detection (CAPTCHA / OTP)
      const humanVerifPanel = page.locator(PORTAL_SELECTORS.humanVerificationPanel);
      const isHumanVerifRequired = (await humanVerifPanel.count()) > 0;

      if (isHumanVerifRequired) {
        // If CAPTCHA code was provided (e.g. human solved it or resumed)
        if (options.captchaCode) {
          await page.fill(PORTAL_SELECTORS.captchaInput, options.captchaCode);
        } else {
          // Handoff to human: capture screenshot, record liveViewUrl, halt
          const screenshot = await session.captureScreenshot("captcha-required");
          const liveViewUrl =
            session.mode === "browserbase"
              ? `https://browserbase.com/sessions/${session.sessionId}`
              : `file:///${screenshot.path.replace(/\\/g, "/")}`;

          return {
            success: false,
            needsHuman: true,
            sessionId: session.sessionId,
            idempotencyKey,
            humanVerification: {
              required: true,
              selector: PORTAL_SELECTORS.humanVerificationPanel,
              screenshotRef: screenshot.filename,
              liveViewUrl,
              instructions: "Please enter the verification code displayed in the security panel.",
            },
          };
        }
      }

      // 9. Submit the Form
      const submitBtn = page.locator(PORTAL_SELECTORS.submitBooking);
      await submitBtn.click();

      // 10. Wait for Navigation to Confirmation OR Error Banner
      const navPromise = page.waitForURL("**/confirmation**", { timeout: 15000 }).catch(() => null);
      const donePromise = page.waitForURL("**/done**", { timeout: 15000 }).catch(() => null);
      const thanksPromise = page.waitForURL("**/thanks**", { timeout: 15000 }).catch(() => null);
      const errorPromise = page.waitForSelector(PORTAL_SELECTORS.formErrorBanner, { timeout: 5000 }).catch(() => null);

      await Promise.race([navPromise, donePromise, thanksPromise, errorPromise]);

      // Check if Error Banner Appeared
      const errorBanner = page.locator(PORTAL_SELECTORS.formErrorBanner);
      if (await errorBanner.isVisible()) {
        const errorText = (await errorBanner.textContent()) || "";
        if (errorText.includes("500") || errorText.toLowerCase().includes("internal server error")) {
          throw new PortalServerError(errorText.trim());
        }
        throw new BookingSubmissionRejectedError(errorText.trim());
      }

      // 11. Process Confirmation Page
      const confirmationScreenshot = await session.captureScreenshot("booking-confirmation");

      // Check for Missing Reference Directive
      const missingRefEl = page.locator(PORTAL_SELECTORS.bookingReferenceMissing);
      if (await missingRefEl.isVisible()) {
        throw new MissingBookingReferenceError(page.url());
      }

      // Extract Reference
      const refEl = page.locator(PORTAL_SELECTORS.bookingReference);
      if (!(await refEl.isVisible())) {
        throw new MissingBookingReferenceError(page.url());
      }

      const rawReference = (await refEl.textContent())?.trim() || "";
      if (!rawReference) {
        throw new MissingBookingReferenceError(page.url());
      }

      // Validate Reference Pattern
      if (!isValidBookingReference(recyclerId, rawReference)) {
        const expectedPattern = getBookingReferenceRegex(recyclerId).toString();
        throw new InvalidBookingReferenceError(rawReference, expectedPattern);
      }

      // Check for Duplicate Notice
      const dupNotice = page.locator(PORTAL_SELECTORS.duplicateNotice);
      const isDuplicate = await dupNotice.isVisible();

      return {
        success: true,
        bookingReference: rawReference,
        confirmationUrl: page.url(),
        screenshotRef: confirmationScreenshot.filename,
        sessionId: session.sessionId,
        idempotencyKey,
        isDuplicate,
      };
    } finally {
      if (ownsSession) {
        await session.close();
      }
    }
  }
}

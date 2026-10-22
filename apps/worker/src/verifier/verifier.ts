import type { TrackingLookupEvidence } from "@recircuit/core";
import { transitionState, isCollected } from "@recircuit/core";
import { openSession, type BrowserSession } from "../browser/session.js";
import { getPortalTrackingUrl, isValidBookingReference } from "../booking/selectors.js";
import { isWeightEquivalent } from "../booking/booker.js";
import { getCanonicalItemLabel } from "@recircuit/core";
import type { LegVerificationContext, VerifierOptions, VerifierResult, ObservedConsignmentItem } from "./types.js";

export class VerifierError extends Error {
  constructor(message: string, public readonly code: string = "VERIFIER_ERROR") {
    super(message);
    this.name = "VerifierError";
  }
}

export class Verifier {
  /**
   * Independently observes the mock recycler portal tracking page through a
   * separate browser session, verifying reference, status, and items.
   */
  public static async verifyLeg(
    context: LegVerificationContext,
    options: VerifierOptions = {},
    existingSession?: BrowserSession
  ): Promise<VerifierResult> {
    const { leg } = context;
    const recyclerId = leg.recyclerId;
    const bookingReference = context.expectedReference || leg.bookingReference;

    if (!bookingReference) {
      throw new VerifierError(
        `Cannot verify leg ${leg.id}: missing booking reference. Leg must be in REQUEST_SUBMITTED.`,
        "MISSING_BOOKING_REFERENCE"
      );
    }

    if (!isValidBookingReference(recyclerId, bookingReference)) {
      throw new VerifierError(
        `Invalid booking reference format for recycler "${recyclerId}": "${bookingReference}".`,
        "INVALID_REFERENCE_FORMAT"
      );
    }

    // 1. Open an INDEPENDENT, distinct browser session
    const session =
      existingSession ||
      (await openSession({
        mode: (process.env.BROWSER_MODE as "local" | "browserbase") || "local",
        headless: options.headless !== false,
        recyclerId,
      }));

    const submittingSessionId = leg.submittingSessionId || "";
    const verifyingSessionId = session.sessionId;

    // Strict invariant: Verifier session must differ from Submitting session
    if (submittingSessionId && verifyingSessionId === submittingSessionId) {
      await session.close().catch(() => {});
      throw new VerifierError(
        `Independent verification violation: verifying sessionId must differ from submitting sessionId (both are "${verifyingSessionId}").`,
        "SESSION_NOT_INDEPENDENT"
      );
    }

    try {
      const page = session.page;
      const trackBaseUrl = getPortalTrackingUrl(recyclerId, options.portalBaseUrl);
      const trackingUrl = `${trackBaseUrl}?ref=${encodeURIComponent(bookingReference)}`;

      await page.goto(trackingUrl, {
        waitUntil: "domcontentloaded",
        timeout: options.timeoutMs ?? 30000,
      });

      // 2. Wait for either tracking result or not-found container
      const resultLocator = page.locator('[data-testid="tracking-result"]');
      const notFoundLocator = page.locator('[data-testid="not-found"]');

      await Promise.race([
        resultLocator.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
        notFoundLocator.waitFor({ state: "visible", timeout: 15000 }).catch(() => {}),
      ]);

      const isFound = await resultLocator.isVisible().catch(() => false);
      const isNotFound = await notFoundLocator.isVisible().catch(() => false);

      if (!isFound || isNotFound) {
        const failureSs = await session.captureScreenshot("verification-not-found");
        throw new VerifierError(
          `Consignment "${bookingReference}" was not found on recycler tracking portal (${trackingUrl}). Screenshot: ${failureSs.filename}`,
          "CONSIGNMENT_NOT_FOUND"
        );
      }

      // 3. Extract observed values from live DOM
      const refEl = page.locator('[data-testid="booking-reference"]');
      const statusEl = page.locator('[data-testid="tracking-status"]');
      const feeEl = page.locator('[data-testid="tracking-fee"]');
      const itemRows = page.locator('[data-testid="tracking-item-row"]');
      const simulatedBadge = page.locator('[data-testid="simulated-event-badge"]');

      const observedRef = (await refEl.textContent())?.trim() || "";
      const observedStatus = (await statusEl.textContent())?.trim() || "";
      const observedFeeText = (await feeEl.textContent())?.trim() || "";
      const isSimulatedDownstream = (await simulatedBadge.count()) > 0;

      // Verify reference matches expected submitted reference
      if (observedRef !== bookingReference) {
        throw new VerifierError(
          `Reference mismatch: expected "${bookingReference}", but tracking page displays "${observedRef}".`,
          "REFERENCE_MISMATCH"
        );
      }

      // 4. TC4 Invariant: Do not report collected without explicit signed evidence
      if ((observedStatus === "PICKED_UP" || observedStatus === "COLLECTED") && !isCollected(leg.state)) {
        // Portal simulated event or downstream update cannot automatically claim pickup on user leg without pickup confirmation
        throw new VerifierError(
          `TC4 Invariant Violation: Recycler portal displays "${observedStatus}", but no pickup confirmation evidence exists for this leg.`,
          "TC4_UNVERIFIED_COLLECTION"
        );
      }

      // 5. Extract item rows
      const observedItems: ObservedConsignmentItem[] = [];
      const rowCount = await itemRows.count();
      for (let i = 0; i < rowCount; i++) {
        const row = itemRows.nth(i);
        const name = (await row.locator('[data-testid="tracking-item-name"]').textContent())?.trim() || "";
        const details = (await row.locator('[data-testid="tracking-item-details"]').textContent())?.trim() || "";
        const qtyMatch = details.match(/Qty:\s*(\d+)/i);
        const wtMatch = details.match(/Weight:\s*([\d.]+)\s*kg/i);
        observedItems.push({
          name,
          quantity: qtyMatch ? parseInt(qtyMatch[1]!, 10) : undefined,
          weightKg: wtMatch ? parseFloat(wtMatch[1]!) : undefined,
        });
      }

      // Strict Item Fidelity Check: verify quantity, weight, and identity match approved plan leg
      const expectedLegItems = leg.items || [];
      if (expectedLegItems.length > 0) {
        // If tracking page has no item rows rendered, return incomplete/uncertain verification
        if (observedItems.length === 0) {
          const ss = await session.captureScreenshot("verification-incomplete");
          return {
            verified: false,
            isUncertain: true,
            verificationQuality: "INCOMPLETE_FIELDS",
            errorCode: "TRACKING_FIELDS_INCOMPLETE",
            error: "Tracking page is missing consignment item rows",
            bookingReference: observedRef,
            observedStatus,
            verifyingSessionId,
            submittingSessionId,
            screenshotRef: ss.filename,
            trackingUrl,
            observedItems,
            observedFeeText,
            isSimulatedDownstream,
          };
        }

        if (observedItems.length !== expectedLegItems.length) {
          throw new VerifierError(
            `Item count mismatch: expected ${expectedLegItems.length} item(s), but tracking page displays ${observedItems.length} item(s).`,
            "ITEM_COUNT_MISMATCH"
          );
        }

        for (let i = 0; i < expectedLegItems.length; i++) {
          const exp = expectedLegItems[i]!;
          const obs = observedItems[i]!;

          // Check if expected tracking fields are missing on the tracking page item row
          const expWeight = exp.estimatedWeightKg ?? ((exp as unknown as Record<string, unknown>).weightKg as number | undefined);
          if ((exp.quantity !== undefined && obs.quantity === undefined) || (expWeight !== undefined && obs.weightKg === undefined)) {
            const ss = await session.captureScreenshot("verification-incomplete");
            return {
              verified: false,
              isUncertain: true,
              verificationQuality: "INCOMPLETE_FIELDS",
              errorCode: "TRACKING_FIELDS_INCOMPLETE",
              error: `Tracking page item ${i + 1} is missing required fields (quantity or weight)`,
              bookingReference: observedRef,
              observedStatus,
              verifyingSessionId,
              submittingSessionId,
              screenshotRef: ss.filename,
              trackingUrl,
              observedItems,
              observedFeeText,
              isSimulatedDownstream,
            };
          }

          // Identity check
          const expCanon = getCanonicalItemLabel(exp.name || exp.description || (exp.category ? String(exp.category) : "") || "");
          const obsCanon = getCanonicalItemLabel(obs.name);
          if (expCanon && obsCanon && expCanon.toLowerCase() !== obsCanon.toLowerCase()) {
            throw new VerifierError(
              `Item identity mismatch for item ${i + 1}: expected "${expCanon}", but tracking page displays "${obsCanon}".`,
              "ITEM_IDENTITY_MISMATCH"
            );
          }

          // Quantity check
          if (exp.quantity !== undefined && obs.quantity !== undefined) {
            if (obs.quantity !== exp.quantity) {
              throw new VerifierError(
                `Item quantity mismatch for item ${i + 1} (${exp.name || exp.id}): expected ${exp.quantity}, but tracking page displays ${obs.quantity}.`,
                "ITEM_QUANTITY_MISMATCH"
              );
            }
          }

          // Weight check (using isWeightEquivalent with threshold guard)
          if (typeof expWeight === "number" && typeof obs.weightKg === "number") {
            if (!isWeightEquivalent(obs.weightKg, expWeight, recyclerId)) {
              throw new VerifierError(
                `Item weight mismatch for item ${i + 1} (${exp.name || exp.id}): expected ${expWeight} kg, but tracking page displays ${obs.weightKg} kg.`,
                "ITEM_WEIGHT_MISMATCH"
              );
            }
          }
        }
      }

      // 6. Capture verification screenshot evidence
      const screenshot = await session.captureScreenshot("verification-success");

      // 7. Transition leg state machine to REQUEST_CONFIRMED
      const trackingEvidence: TrackingLookupEvidence = {
        bookingReference: observedRef,
        sessionId: verifyingSessionId,
        ...(leg.slot ? { slot: leg.slot } : {}),
      };

      let auditEvent = undefined;
      if (leg.state !== "REQUEST_CONFIRMED") {
        const step = transitionState(leg, "REQUEST_CONFIRMED", trackingEvidence);
        Object.assign(leg, step.newLeg);
        auditEvent = step.auditEvent;
      }

      return {
        verified: true,
        bookingReference: observedRef,
        observedStatus,
        verifyingSessionId,
        submittingSessionId,
        screenshotRef: screenshot.filename,
        trackingUrl,
        observedItems,
        observedFeeText,
        isSimulatedDownstream,
        ...(auditEvent ? { auditEvent } : {}),
      };
    } finally {
      await session.close().catch(() => {});
    }
  }
}

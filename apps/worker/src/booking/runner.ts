/**
 * apps/worker/src/booking/runner.ts
 *
 * Leg Booking Orchestrator with integrated State Machine transitions and audit logging.
 */

import {
  transitionState,
  makeIdempotencyKey,
  hashPlan,
  type PlanLeg,
  type StatusEvent,
} from "@recircuit/core";
import { Booker } from "./booker.js";
import type { BookerOptions, BookerResult, LegBookingContext } from "./types.js";
import { BookerError } from "./errors.js";

export interface LegBookingExecutionResult {
  updatedLeg: PlanLeg;
  result: BookerResult;
  auditEvents: StatusEvent[];
}

export class BookingRunner {
  /**
   * Orchestrates the complete booking lifecycle for a single leg:
   * 1. APPROVED -> SUBMITTING (requires idempotency evidence)
   * 2. Executes browser automation via Booker
   * 3. If CAPTCHA encountered -> transitions SUBMITTING -> NEEDS_HUMAN
   * 4. If submission succeeded -> transitions SUBMITTING -> REQUEST_SUBMITTED
   * 5. If failure occurs -> transitions SUBMITTING -> FAILED
   */
  public static async bookLegWithTransitions(
    context: LegBookingContext,
    options: BookerOptions = {}
  ): Promise<LegBookingExecutionResult> {
    const { leg, plan } = context;
    const auditEvents: StatusEvent[] = [];

    const planHash = plan.planHash || hashPlan(plan);
    const idempotencyKey =
      leg.idempotencyKey || makeIdempotencyKey(planHash, leg.id, leg.recyclerId);

    // 1. Transition leg from APPROVED to SUBMITTING
    let currentLeg = leg;
    if (currentLeg.state === "APPROVED") {
      const step1 = transitionState(currentLeg, "SUBMITTING", {
        idempotencyKey,
        priorSuccessfulUse: false,
      });
      currentLeg = {
        ...step1.newLeg,
        idempotencyKey,
      };
      auditEvents.push(step1.auditEvent);
    }

    try {
      // 2. Execute browser booking
      const bookerResult = await Booker.bookLeg(
        {
          ...context,
          leg: currentLeg,
        },
        options
      );

      // 3. Handle Human Verification (CAPTCHA)
      if (bookerResult.needsHuman && bookerResult.humanVerification) {
        const stepHuman = transitionState(currentLeg, "NEEDS_HUMAN", {
          screenshotRef: bookerResult.humanVerification.screenshotRef,
          liveViewUrl: bookerResult.humanVerification.liveViewUrl,
        });
        currentLeg = {
          ...stepHuman.newLeg,
          submittingSessionId: bookerResult.sessionId,
        };
        auditEvents.push(stepHuman.auditEvent);

        return {
          updatedLeg: currentLeg,
          result: bookerResult,
          auditEvents,
        };
      }

      // 4. Handle Successful Submission
      if (bookerResult.success && bookerResult.bookingReference) {
        const stepSuccess = transitionState(currentLeg, "REQUEST_SUBMITTED", {
          screenshotRef: bookerResult.screenshotRef || "confirmation.png",
          url: bookerResult.confirmationUrl || "http://localhost/confirmation",
          bookingReference: bookerResult.bookingReference,
        });
        currentLeg = {
          ...stepSuccess.newLeg,
          bookingReference: bookerResult.bookingReference,
          submittingSessionId: bookerResult.sessionId,
        };
        auditEvents.push(stepSuccess.auditEvent);

        return {
          updatedLeg: currentLeg,
          result: bookerResult,
          auditEvents,
        };
      }

      throw new BookerError("Booking completed without confirmation reference or error.", "UNKNOWN_BOOKING_OUTCOME");
    } catch (err: unknown) {
      // 5. Safe Failure Transition
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = err instanceof BookerError ? err.code : "BOOKING_FAILURE";

      try {
        if (currentLeg.state === "SUBMITTING") {
          const stepFail = transitionState(currentLeg, "FAILED", {
            errorCode,
            message: errorMessage,
            observedAt: new Date().toISOString(),
          });
          currentLeg = stepFail.newLeg;
          auditEvents.push(stepFail.auditEvent);
        }
      } catch {
        // If state machine transition to FAILED is rejected, preserve current state
      }

      throw err;
    }
  }

  /**
   * Resumes a paused leg from NEEDS_HUMAN state after human verification code is provided.
   */
  public static async resumeLegWithCaptcha(
    context: LegBookingContext,
    captchaCode: string,
    options: BookerOptions = {}
  ): Promise<LegBookingExecutionResult> {
    const { leg } = context;
    const auditEvents: StatusEvent[] = [];

    if (leg.state !== "NEEDS_HUMAN") {
      throw new Error(`Cannot resume leg in state "${leg.state}". Expected "NEEDS_HUMAN".`);
    }

    const idempotencyKey = leg.idempotencyKey || `idem-${Date.now()}`;

    // 1. Transition NEEDS_HUMAN -> SUBMITTING
    const stepResume = transitionState(leg, "SUBMITTING", {
      idempotencyKey,
      priorSuccessfulUse: false,
    });
    let currentLeg: PlanLeg = {
      ...stepResume.newLeg,
      idempotencyKey,
    };
    auditEvents.push(stepResume.auditEvent);

    // 2. Book with the human-provided CAPTCHA code
    const bookerResult = await Booker.bookLeg(
      {
        ...context,
        leg: currentLeg,
      },
      {
        ...options,
        captchaCode,
      }
    );

    if (bookerResult.success && bookerResult.bookingReference) {
      const stepSuccess = transitionState(currentLeg, "REQUEST_SUBMITTED", {
        screenshotRef: bookerResult.screenshotRef || "confirmation.png",
        url: bookerResult.confirmationUrl || "http://localhost/confirmation",
        bookingReference: bookerResult.bookingReference,
      });
      currentLeg = {
        ...stepSuccess.newLeg,
        bookingReference: bookerResult.bookingReference,
        submittingSessionId: bookerResult.sessionId,
      };
      auditEvents.push(stepSuccess.auditEvent);

      return {
        updatedLeg: currentLeg,
        result: bookerResult,
        auditEvents,
      };
    }

    throw new BookerError("Resumed booking failed to produce valid booking reference.", "RESUME_FAILED");
  }
}

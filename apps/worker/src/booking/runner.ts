/**
 * apps/worker/src/booking/runner.ts
 *
 * Leg Booking Orchestrator with integrated State Machine transitions and audit logging.
 */

import {
  transitionState,
  makeIdempotencyKey,
  hashPlan,
  FeeChangedReapprovalRequiredError,
  SafeActionBlockedError,
  type PlanLeg,
  type StatusEvent,
} from "@recircuit/core";
import type { BrowserSession } from "../browser/session.js";
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
    options: BookerOptions = {},
    existingSession?: BrowserSession
  ): Promise<LegBookingExecutionResult> {
    const { leg, plan } = context;
    const auditEvents: StatusEvent[] = [];

    const planHash = hashPlan(plan);
    const idempotencyKey =
      leg.idempotencyKey || makeIdempotencyKey(planHash, leg.id, leg.recyclerId);

    // 1. Transition leg from APPROVED to SUBMITTING (or handle already REQUEST_SUBMITTED)
    let currentLeg = leg;
    if (currentLeg.state === "REQUEST_SUBMITTED") {
      const bookerResult = await Booker.bookLeg(
        {
          ...context,
          leg: { ...currentLeg, state: "SUBMITTING" },
        },
        options,
        existingSession
      );
      const updatedRef = bookerResult.bookingReference ?? currentLeg.bookingReference;
      return {
        updatedLeg: {
          ...currentLeg,
          ...(updatedRef !== undefined ? { bookingReference: updatedRef } : {}),
        },
        result: bookerResult,
        auditEvents,
      };
    }

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
        options,
        existingSession
      );

      // 3. Handle Human Verification (CAPTCHA, Slot Mismatch, Missing Data-Wipe)
      if (bookerResult.needsHuman) {
        if (currentLeg.state === "SUBMITTING") {
          const stepHuman = transitionState(currentLeg, "NEEDS_HUMAN", {
            screenshotRef: bookerResult.humanVerification?.screenshotRef || "needs-human.png",
            liveViewUrl:
              bookerResult.humanVerification?.liveViewUrl || "http://localhost:3101/needs-human",
          });
          currentLeg = {
            ...stepHuman.newLeg,
            submittingSessionId: bookerResult.sessionId,
          };
          auditEvents.push(stepHuman.auditEvent);
        }

        return {
          updatedLeg: currentLeg,
          result: bookerResult,
          auditEvents,
        };
      }

      // 4. Handle Successful Submission
      if (bookerResult.success && bookerResult.bookingReference) {
        if (currentLeg.state === "SUBMITTING") {
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
        } else {
          currentLeg = {
            ...currentLeg,
            bookingReference: bookerResult.bookingReference,
            submittingSessionId: bookerResult.sessionId,
          };
        }

        return {
          updatedLeg: currentLeg,
          result: bookerResult,
          auditEvents,
        };
      }

      throw new BookerError("Booking completed without confirmation reference or error.", "UNKNOWN_BOOKING_OUTCOME");
    } catch (err: unknown) {
      if (err instanceof FeeChangedReapprovalRequiredError ||
          (err instanceof SafeActionBlockedError && err.code === "STALE_APPROVAL_PLAN_CHANGED")) {
        if (context.request && context.request.state === "APPROVED") {
          const reqStep = transitionState(context.request, "AWAITING_APPROVAL", {
            planId: context.plan.id,
            planHash: hashPlan(context.plan),
            approvalReason: err.code,
          });
          context.request.state = reqStep.newRequest.state;
          context.request.updatedAt = reqStep.newRequest.updatedAt;
          auditEvents.push(reqStep.auditEvent);
        }
        throw err;
      }

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
          Object.assign(context.leg, currentLeg);
          auditEvents.push(stepFail.auditEvent);
        }
      } catch {
        // If state machine transition to FAILED is rejected, preserve current state
      }

      throw err;
    }
  }

  /**
   * Resumes booking on the SAME open browser session after the human solves verification in the open window.
   */
  public static async resumeInSession(
    context: LegBookingContext,
    session: BrowserSession,
    options: BookerOptions = {}
  ): Promise<LegBookingExecutionResult> {
    const { leg } = context;
    const auditEvents: StatusEvent[] = [];

    const planHash = hashPlan(context.plan);
    const idempotencyKey =
      leg.idempotencyKey || makeIdempotencyKey(planHash, leg.id, leg.recyclerId);

    // 1. Transition leg from NEEDS_HUMAN to SUBMITTING if needed
    let currentLeg: PlanLeg = leg;
    if (currentLeg.state === "NEEDS_HUMAN") {
      const stepResume = transitionState(currentLeg, "SUBMITTING", {
        idempotencyKey,
        priorSuccessfulUse: false,
      });
      currentLeg = {
        ...stepResume.newLeg,
        idempotencyKey,
      };
      auditEvents.push(stepResume.auditEvent);
    }

    try {
      // 2. Submit on the same open session
      const bookerResult = await Booker.bookLeg(
        {
          ...context,
          leg: currentLeg,
        },
        {
          ...options,
          isResuming: true,
        },
        session
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
    } finally {
      await session.close();
    }
  }
}


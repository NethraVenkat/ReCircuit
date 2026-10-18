/**
 * apps/worker/src/booking/types.ts
 *
 * Domain types and interfaces for the Stage 7 Browser Booking Agent (Booker).
 */

import type { Plan, PlanLeg, DecisionRecord, Request } from "@recircuit/core";
import type { Page } from "playwright";
import type { BrowserSession } from "../browser/session.js";

export interface BookingCustomerInfo {
  fullName: string;
  phone: string;
  addressLine: string;
  locality: string;
  pincode: string;
  preferredSlot?: string;
}

export interface BookingItemInput {
  name: string;
  quantity?: number;
  weightKg?: number;
}

export interface BrowserActionLog {
  action:
    | "navigate"
    | "preflight_recovery_check"
    | "fill_form"
    | "readback"
    | "review_fee"
    | "human_verification_detected"
    | "human_verification_solved"
    | "submit"
    | "confirmation"
    | "recovery_lookup"
    | "recovery_retry";
  stepNumber: number;
  timestamp: string;
  url?: string;
  details?: Record<string, unknown>;
  screenshotRef?: string;
}

export interface BookerOptions {
  portalBaseUrl?: string;
  headless?: boolean;
  timeoutMs?: number;
  /** Test hook or callback to simulate human solving verification directly on the live page */
  onHumanVerification?: (page: Page, session: BrowserSession) => Promise<void>;
  /** When true and in headless mode without onHumanVerification, pause and return needsHuman without closing session */
  pauseOnHumanVerification?: boolean;
  /** Keep browser session open on NEEDS_HUMAN so caller can solve interactively in the same page */
  keepSessionOpenOnNeedsHuman?: boolean;
  /** When true, indicates an active session being resumed for CAPTCHA/human verification (skips pre-flight check) */
  isResuming?: boolean;
  /** Custom user-prompt function for CLI interactive wait */
  promptUserSolve?: () => Promise<void>;
  /** Obsolete: kept only for backward compatibility in existing unit test mocks */
  captchaCode?: string;
  captchaSessionId?: string;
}

export interface HumanVerificationHandoff {
  required: true;
  selector: string;
  screenshotRef: string;
  liveViewUrl: string;
  captchaSessionId?: string;
  instructions: string;
}

export interface BookerResult {
  success: boolean;
  bookingReference?: string;
  confirmationUrl?: string;
  screenshotRef?: string;
  sessionId: string;
  idempotencyKey: string;
  needsHuman?: boolean;
  humanVerification?: HumanVerificationHandoff;
  isDuplicate?: boolean;
  isRecovered?: boolean;
  observedFeeInr?: number;
  error?: string;
  errorCode?: string;
  browserActions: BrowserActionLog[];
  session?: BrowserSession;
}

export interface LegBookingContext {
  leg: PlanLeg;
  plan: Plan;
  approval: DecisionRecord | null;
  customer: BookingCustomerInfo;
  items: BookingItemInput[];
  dataWipeAck?: boolean;
  portalBaseUrl?: string;
  usedIdempotencyKeys?: Set<string> | string[];
  request?: Request;
}


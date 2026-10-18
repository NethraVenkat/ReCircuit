/**
 * apps/worker/src/booking/types.ts
 *
 * Domain types and interfaces for the Stage 7 Browser Booking Agent (Booker).
 */

import type { Plan, PlanLeg, DecisionRecord } from "@recircuit/core";

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

export interface BookerOptions {
  portalBaseUrl?: string;
  headless?: boolean;
  timeoutMs?: number;
  /** Human-supplied verification code when resuming from NEEDS_HUMAN */
  captchaCode?: string;
  /** Used for session resumption */
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
  error?: string;
  errorCode?: string;
}

export interface LegBookingContext {
  leg: PlanLeg;
  plan: Plan;
  approval: DecisionRecord | null;
  customer: BookingCustomerInfo;
  items: BookingItemInput[];
  dataWipeAck?: boolean;
  portalBaseUrl?: string;
}


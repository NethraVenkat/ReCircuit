/**
 * apps/worker/src/booking/errors.ts
 *
 * Typed error classes for Stage 7 Browser Booking Agent.
 */

export class BookerError extends Error {
  public readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "BookerError";
    this.code = code;
  }
}

/** Thrown when DOM field readback fails to match the intended input */
export class FormVerificationError extends BookerError {
  public readonly field: string;
  public readonly expected: string;
  public readonly actual: string;

  constructor(field: string, expected: string, actual: string) {
    super(
      `Form field readback verification failed for "${field}". Expected "${expected}", observed "${actual}". Submission aborted for safety.`,
      "FORM_VERIFICATION_FAILED"
    );
    this.name = "FormVerificationError";
    this.field = field;
    this.expected = expected;
    this.actual = actual;
  }
}

/** Thrown when human CAPTCHA / OTP is detected and must be handed off */
export class HumanVerificationRequiredError extends BookerError {
  public readonly selector: string;
  public readonly screenshotRef: string;
  public readonly liveViewUrl: string;

  constructor(selector: string, screenshotRef: string, liveViewUrl: string) {
    super(
      `Human verification required at "${selector}". Browser agent halted for user handoff. Never bypass or hallucinate CAPTCHA.`,
      "NEEDS_HUMAN"
    );
    this.name = "HumanVerificationRequiredError";
    this.selector = selector;
    this.screenshotRef = screenshotRef;
    this.liveViewUrl = liveViewUrl;
  }
}

/** Thrown when recycler portal encounters internal server error (HTTP 500) */
export class PortalServerError extends BookerError {
  constructor(message: string) {
    super(`Recycler portal returned server error (HTTP 500): ${message}`, "PORTAL_SERVER_ERROR");
    this.name = "PortalServerError";
  }
}

/** Thrown when recycler portal rejects booking with validation error */
export class BookingSubmissionRejectedError extends BookerError {
  public readonly errors: string[];

  constructor(message: string, errors: string[] = []) {
    super(
      `Recycler portal rejected booking submission: ${message}${errors.length > 0 ? ` (${errors.join("; ")})` : ""}`,
      "SUBMISSION_REJECTED"
    );
    this.name = "BookingSubmissionRejectedError";
    this.errors = errors;
  }
}

/** Thrown when confirmation page omits booking reference (e.g. failure switch active) */
export class MissingBookingReferenceError extends BookerError {
  constructor(url: string) {
    super(
      `Confirmation page at "${url}" omitted the booking reference. Cannot advance leg to REQUEST_SUBMITTED without verified reference.`,
      "MISSING_BOOKING_REFERENCE"
    );
    this.name = "MissingBookingReferenceError";
  }
}

/** Thrown when confirmation reference does not match expected format */
export class InvalidBookingReferenceError extends BookerError {
  public readonly reference: string;
  public readonly expectedPattern: string;

  constructor(reference: string, expectedPattern: string) {
    super(
      `Observed booking reference "${reference}" does not match expected pattern "${expectedPattern}". Refusing unverified reference.`,
      "INVALID_BOOKING_REFERENCE"
    );
    this.name = "InvalidBookingReferenceError";
    this.reference = reference;
    this.expectedPattern = expectedPattern;
  }
}


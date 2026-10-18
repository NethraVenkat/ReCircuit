# Stage 7 — Browser Booking Agent (Booker)

## Overview

The Browser Booking Agent (`Booker`) autonomously executes approved reverse-logistics bookings across recycler portals using browser HTML form interaction. It operates on an approved `PlanLeg`, verifies all DOM values via readback before submission, halts and hands off on human verification challenges (CAPTCHA / OTP), and extracts verified confirmation references with full screenshot proof.

---

## Safety Guarantees & Architectural Principles

1. **Strict Safe Action Pre-Flight Gate (`assertActionAllowed`)**:
   - The booker refuses execution unless the leg is in `APPROVED` (or `SUBMITTING` resuming from `NEEDS_HUMAN`) state.
   - The user's approval record is verified to match the exact canonical SHA-256 `planHash`.
   - Idempotency key uniqueness is verified; repeat successful submissions are blocked.
   - Observed fees are strictly compared against approved fees; any divergence throws `FeeChangedReapprovalRequiredError`.

2. **Pure Browser HTML Form Filling**:
   - The agent operates exclusively via browser automation (Playwright / Stagehand); it **never** calls portal JSON mutation APIs directly.

3. **DOM Readback Verification**:
   - Before clicking the submit button, all input values (`fullName`, `phone`, `addressLine`, `locality`, `pincode`, `clientRequestId`) are read back from the live DOM and asserted against the intended payload.
   - Any discrepancy throws `FormVerificationError` and immediately aborts the submission.

4. **Human Verification (CAPTCHA / OTP) Handoff in One Live Session (Rule S-5)**:
   - When `data-human-verification="required"` is detected, the agent **never** bypasses or guesses codes.
   - The browser session remains open in the **same live window**.
   - In local mode, the agent runs headed, displays: *"Solve the verification in the open browser window, then press Enter"*, and waits up to 5 minutes.
   - The human types the code directly into the open browser window; the agent never reads, OCRs, or types the code.
   - In Browserbase mode, the agent surfaces the session live view URL and waits in the same way.
   - Once solved, the agent proceeds on that same page to verify the review fee, submit the booking, and extract the confirmed reference.

5. **Reference Extraction & Pattern Validation**:
   - Upon confirmation page navigation, the reference element (`[data-testid="booking-reference"]`) is extracted and verified against the canonical recycler regex (`/^DEC-\d{5}$/`, `/^PPK-\d{5}$/`, `/^QSH-\d{5}$/`).
   - If the portal returns a server outage (HTTP 500) or activates the `omitNextReference` failure switch, the agent catches the defect, queries `/track?client=<idempotencyKey>`, retries once with the same idempotency key if needed, or safely records the failure without creating duplicate bookings.

6. **Idempotency Protection**:
   - The booker injects a deterministic `client_request_id` (`sha256(plan_hash + leg_id + recycler_id)`).
   - Recycler portals deduplicate by this key; repeat submissions return the existing reference and trigger duplicate notices, labelled `isDuplicate: true`.

---

## State Machine Transitions

| From State | To State | Evidence Required | Emitted Evidence |
|---|---|---|---|
| `APPROVED` | `SUBMITTING` | `idempotency_key` | `{ idempotencyKey, priorSuccessfulUse: false }` |
| `SUBMITTING` | `NEEDS_HUMAN` | `human_verification` | `{ screenshotRef, liveViewUrl }` |
| `NEEDS_HUMAN` | `SUBMITTING` | `idempotency_key` | `{ idempotencyKey, priorSuccessfulUse: false }` |
| `SUBMITTING` | `REQUEST_SUBMITTED` | `form_submission` | `{ screenshotRef, url, bookingReference }` |
| `SUBMITTING` | `FAILED` | `failure` | `{ errorCode, message, observedAt }` |

---

## CLI Usage

### Execute Bookings for an Approved Request
```bash
npm run book -- --request=<requestId> [--headless=true|false]
```

---

## Verification & Test Coverage

All 12 unit tests pass in `apps/worker/src/booking/booker.test.ts`:
- Safe action gate: missing approval, rejected approval, stale approval, invalid leg state.
- DOM readback verification: field divergence aborts submission.
- Human verification: CAPTCHA detection, screenshot capture, `NEEDS_HUMAN` transition, and resumption.
- Outage handling: portal HTTP 500 error banner, omitted reference, invalid reference format.
- Success execution: Deccan (`DEC-XXXXX`), QuickScrap (`QSH-XXXXX`), and duplicate notice detection.


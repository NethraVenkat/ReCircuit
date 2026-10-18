# ReCircuit — State Machine Reference

> **Stage 1** — Data Model & Deterministic State Machine
> Pure TypeScript state machine in `packages/core`. Zero network I/O, zero LLM decisions.

---

## 1. Request Pipeline States

These states track the top-level lifecycle of a household recycling **Request**.

| State | Description |
|---|---|
| `DRAFT` | Request created, not yet processed |
| `ITEMS_PARSED` | LLM has extracted items from the description |
| `NEEDS_CLARIFICATION` | LLM needs more information from the user |
| `RECYCLERS_DISCOVERED` | Eligible recyclers identified |
| `POLICIES_READ` | Recycler policies read from live portals (with evidence) |
| `ELIGIBILITY_CHECKED` | Items matched to recycler acceptance lists |
| `PLAN_CREATED` | Routing plan created and hashed |
| `AWAITING_APPROVAL` | Plan sent to user for approval |
| `APPROVED` | User approved the plan (planHash matches) |
| `REJECTED` | User declined/rejected the proposed plan |
| `FAILED` | Terminal failure (with failure evidence: errorCode, message, observedAt) |

---

## 2. Leg Lifecycle States

These states track each individual booking leg (one recycler, one submission attempt).

| State | Description | Simulated / Future? |
|---|---|---|
| `APPROVED` | Leg authorized by user approval | — |
| `SUBMITTING` | Browser agent is filling the portal form | — |
| `NEEDS_HUMAN` | CAPTCHA / human verification detected | — |
| `REQUEST_SUBMITTED` | Form submitted; booking reference obtained | — |
| `REQUEST_CONFIRMED` | Booking confirmed via **independent** session | — |
| `PICKUP_SCHEDULED` | Recycler has assigned a pickup time slot | — |
| `PICKED_UP` | Items physically collected (OTP/QR confirmed) | ⚠️ Simulated downstream |
| `WEIGHED` | Weight ticket issued at recycler facility | ⚠️ Simulated downstream |
| `RECEIVED_AT_RECYCLER` | Items logged at recycler | 🔮 Future |
| `PROCESSED` | Items broken down / sorted | 🔮 Future |
| `RECYCLED` | Material actually recycled | 🔮 Future |
| `CERTIFICATE_ISSUED` | Recycling certificate issued (Terminal) | 🔮 Future |
| `REJECTED` | Recycler rejected the booking (Terminal) | — |
| `FAILED` | Terminal failure with evidence (Terminal) | — |

---

## 3. Allowed Transitions Table

### A. Request Pipeline (`REQUEST_TRANSITIONS`)

| From | To | Evidence Required / Rule |
|---|---|---|
| `DRAFT` | `ITEMS_PARSED` | Items parsed |
| `ITEMS_PARSED` | `NEEDS_CLARIFICATION` | Low confidence / missing fields |
| `NEEDS_CLARIFICATION` | `ITEMS_PARSED` | Clarification provided |
| `ITEMS_PARSED` | `RECYCLERS_DISCOVERED` | Recyclers found in registry/snapshot |
| `RECYCLERS_DISCOVERED` | `POLICIES_READ` | `policy_extract` evidence |
| `POLICIES_READ` | `ELIGIBILITY_CHECKED` | Eligibility matrix evaluated |
| `ELIGIBILITY_CHECKED` | `PLAN_CREATED` | `plan` evidence (planId, planHash) |
| `PLAN_CREATED` | `AWAITING_APPROVAL` | `plan` evidence (approvalReason) |
| `AWAITING_APPROVAL` | `APPROVED` | `user_approval` evidence (planHash must equal current planHash) |
| `AWAITING_APPROVAL` | `REJECTED` | `user_decision` evidence |
| **Non-terminal** | `FAILED` | `failure` evidence (`errorCode`, `message`, `observedAt`) |

> Note: `PLAN_CREATED → PLAN_CREATED` is **not allowed** (a changed plan is a new plan version).

### B. Leg Lifecycle (`LEG_TRANSITIONS`)

| From | To | Evidence Required / Rule |
|---|---|---|
| `APPROVED` | `SUBMITTING` | `idempotency_key` (not previously used successfully) |
| `SUBMITTING` | `NEEDS_HUMAN` | `human_verification_detected` (screenshotRef, liveViewUrl) |
| `NEEDS_HUMAN` | `SUBMITTING` | `idempotency_key` (human completed verification) |
| `SUBMITTING` | `REQUEST_SUBMITTED` | `form_submission` (screenshotRef, url, bookingReference) |
| `REQUEST_SUBMITTED` | `REQUEST_CONFIRMED` | `tracking_lookup` (independent sessionId != submittingSessionId, bookingReference matches) |
| `REQUEST_CONFIRMED` | `PICKUP_SCHEDULED` | `tracking_lookup` (requires slot) |
| `PICKUP_SCHEDULED` | `PICKED_UP` | `pickup_confirmation` (otpOrQrCode, confirmedAt) |
| `PICKED_UP` | `WEIGHED` | `weight_ticket` (positive weightKg, ticketRef, weighedAt) |
| `WEIGHED` | `RECEIVED_AT_RECYCLER` | Downstream ack |
| `RECEIVED_AT_RECYCLER` | `PROCESSED` | Downstream ack |
| `PROCESSED` | `RECYCLED` | Downstream ack |
| `RECYCLED` | `CERTIFICATE_ISSUED` | Certificate ack |
| `SUBMITTING` | `REJECTED` | Recycler rejected |
| `REQUEST_SUBMITTED` | `REJECTED` | Recycler rejected |
| `REQUEST_CONFIRMED` | `REJECTED` | Recycler rejected |
| `NEEDS_HUMAN` | `REJECTED` | Unresolvable human gate |
| **Non-terminal** | `FAILED` | `failure` evidence (`errorCode`, `message`, `observedAt`) |

---

## 4. Terminal States Rules

**Terminal states**: `CERTIFICATE_ISSUED`, `REJECTED`, `FAILED`.

- **No transitions out of terminal states are allowed under any circumstances.**
- Attempting to transition from `CERTIFICATE_ISSUED`, `REJECTED`, or `FAILED` (including to `FAILED`) is rejected deterministically by `canTransition` and throws `TransitionError` in `transitionState`.
- `-> FAILED` is permitted **only** from non-terminal states, and requires `FailureEvidence` containing `errorCode`, `message`, and `observedAt`.

---

## 5. Cross-Evidence Invariants

1. **Independent Session Verification**: For `REQUEST_CONFIRMED`, `evidence.sessionId !== deps.submittingSessionId`. The submitting session cannot verify itself.
2. **Booking Reference Matching**: For `REQUEST_CONFIRMED`, `evidence.bookingReference === deps.submittedBookingReference`.
3. **Idempotency Deduplication**: For `SUBMITTING`, `deps.usedIdempotencyKeys.has(evidence.idempotencyKey)` is rejected.
4. **Stale Approval Rejection**: For `APPROVED`, `transitionState` checks `user_approval.planHash === deps.currentPlanHash`. If mismatched, it immediately throws `TransitionError`.
5. **Physical Collection Guard**: `isCollected(state)` returns `true` only for `PICKED_UP`, `WEIGHED`, `RECEIVED_AT_RECYCLER`, `PROCESSED`, `RECYCLED`, and `CERTIFICATE_ISSUED`. It returns `false` for `REQUEST_SUBMITTED`, `REQUEST_CONFIRMED`, `PICKUP_SCHEDULED`.

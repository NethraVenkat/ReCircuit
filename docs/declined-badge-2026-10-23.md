# Declined request recycler badge correction — 23 October 2026

Branch: ui/recircuit-household-redesign. Base HEAD: 10828650e9d79f9b2096cd162dc79522567fedd9. No AGENTS.md was found in the workspace, immediate parent or household app. Existing uncommitted submission-report edits were preserved byte-for-byte (SHA-256 48E8820075F065C136F16158B0C8F6244D373623D11F482326FCBF8A1C9F3329) and excluded from this change.

## Reproduction and scope

Retained TC3 request e6cbf1c5-3c9a-4032-b215-b12f5dfeceb1 has request state REJECTED and a proposed leg still in internal state APPROVED. The original owner browser context was closed at the historical run's teardown; no saved owner token exists. No hosted owner access or new hosted reproduction is claimed. Ownership was not bypassed.

A local browser against the existing built household app intercepted only the owned-detail response with a minimal display fixture made from retained TC3 decline.body (request and plan); it omitted unrelated household source/contact data. It showed heading Pickup plan declined, request badge Declined and recycler-leg badge Approved. The latter incorrectly implies current approval. Original hosted TC3-declined.png and prior raw evidence remain unchanged. This isolated fixture did not create or modify a backend record.

## Display-only correction

The recycler badge now resolves proposed leg status using the request decision. An internally APPROVED leg shows Declined for a REJECTED request, Approved only for an APPROVED request, and Proposed pickup while awaiting review or another non-approved request state. Explicit leg rejection remains Declined. Execution states (including SUBMITTING, REQUEST_SUBMITTED, REQUEST_CONFIRMED, scheduled, pickup, human handoff and failure) keep their existing distinct labels, even in inconsistent historical request snapshots, so execution evidence is not hidden by a proposal decision.

Only badge presentation changed. No approval/execution endpoint, backend state, hash, ownership guard, Groq configuration, independent verification or historical record was altered. No booking, scheduling, payment or production write occurred. DEC-46179 and all existing bookings were untouched.

## Actual checks

| Check | Result | Exit |
|---|---|---|
| Before-fix local browser reproduction | Declined request / Approved leg confirmed | 0 (reproduction assertion succeeded) |
| Focused display/approval/state-machine tests | 3 files, 123 passed (14 new badge tests) | 0 |
| Repository lint | Passed | 0 |
| Repository typecheck | Passed | 0 |
| Household production build | Passed | 0 |
| After-fix local built-browser check | Declined request / Declined leg; fixture leg remains APPROVED | 0 |
| Diff check | Passed | 0 |

No validation failure occurred in this task. Before/after browser JSON and screenshots are separate retained artifacts. Both browser/server processes closed in finally; zero external or mutating browser requests in both checks. Local browser screenshots were visually reviewed. Automated unit tests cover pending, approved, rejected, submitting, submitted, independently checked and other execution states; the browser check specifically covers the rejected TC3 snapshot. This is local mocked-response validation, not hosted validation.

Evidence directory: .data/declined-badge-20261023/. Principal files: retained-tc3-display-fixture.json, browser.mjs, before-browser.json/log, before-declined.png, after-browser.json/log/exit, after-declined.png, tests.log/exit, lint.log/exit, typecheck.log/exit, build-household.log/exit and final-state.json. All prior test evidence remains preserved. No secrets or owner cookies were saved.

**Video-readiness verdict:** local declined-state flow is validated. The corrected hosted decline flow is NOT ready for recording until an operator-authorized deployment and subsequent owned hosted check. No recording, push or deployment was started. Existing official TC3 backend decline/zero-submission evidence remains valid; this correction addresses its separate display defect.

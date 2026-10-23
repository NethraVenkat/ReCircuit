# Resumed hosted submission checks and local TC4 fix — 23 October 2026

Production target: https://recircuit.automconsultancy.in. Production commit `7a3eb0a` is supported by the operator-supplied Vercel dashboard screenshot (Ready / Production / commit 7a3eb0a), not API verification. The pre-existing CLI credential initially returned 403; normal CLI refresh succeeded, but deployment metadata lookup then returned 404. After the operator's instruction, behavioral testing proceeded without further account or credential changes. No push or deployment occurred.

Raw evidence directory: `.data/submission-resume-20261023/`. Run marker: `resume-20261023-1792758580179`. Earlier `.data/submission-verification-20261023-1640/` evidence and `docs/submission/2026-10-23-verification.md` remain unchanged.

## Official hosted outcomes

| Case | Result | Actual evidence |
|---|---|---|
| TC1 — Laptop | PASS | Request `2be341c8-005a-4dd7-94e2-2642103a29ad`. Through the hosted household UI: one laptop, quantity 1, total 2.5 kg; fresh Deccan policy evidence; INR 180 pickup fee; INR 250 conditional estimated payout, subject to assessment. Review, approval and authorized synthetic data-wipe acknowledgement succeeded. Browser-agent DOM readback/submission traces were persisted. Booking `DEC-46179` was created once; the stored portal row confirms Laptop / quantity 1 / 2.5 kg / charged fee 180 / data-wipe acknowledgement true / status RECEIVED. Separate Browserbase verification matched items, fee and reference, returned verified=true and independent=true, and observed RECEIVED. Household leg is REQUEST_CONFIRMED, not picked up or collected. |
| TC2 — Paper and batteries | PASS | Request `b4c1910d-45f7-40f2-8204-3d92cab11e6b`. PaperPlus explicitly rejects battery_household, with quote Batteries and rejection reason retained in the matrix. Newspaper quantity 1 / 8 kg was allocated to PaperPlus (fee 0; conditional payout 96). Four household batteries with total row weight 0.5 kg were allocated to Deccan (fee 180); none were allocated to PaperPlus. The allocation and rejection UI were captured. No additional booking was necessary, and no CAPTCHA was encountered in this planning-only case. |
| TC3 — Over budget | PASS | Request `e6cbf1c5-3c9a-4032-b215-b12f5dfeceb1`. Proposed fee 180 versus cap 100; approval card has feeCapStatus=exceeds_cap, reason FEE_CAP_EXCEEDED and warning that 180 exceeds the stated cap of 100. The user-review screen was exercised and Decline plan clicked. Owned readback confirmed REJECTED. Before the decision AND after decline, run-scoped backend evidence showed actionCount=0, submissions=0, and no portal booking matching this synthetic name. |
| TC4 — Requested is not collected | FAIL (hosted); local fix validated, not deployed | For DEC-46179, household correctly distinguishes Requested slot / earliest-any from Assigned slot / Not assigned, and the portal remains RECEIVED. However, the hosted portal labels preferred_slot as Assigned / Preferred Slot and displays the customer's selected time under that combined heading. It does not clearly separate preference from dispatcher assignment. Original failure screenshot TC4-portal.png is preserved. A passing household-only automated assertion did not cover that portal ambiguity; manual review overrides the preliminary harness TC4 PASS to FAIL in reviewed-results.json. |

All owner browser contexts stayed alive through the relevant case phases; TC1's context covered planning, review, approval, booking, verification and tracking. Contexts closed only at suite teardown. No cookie/owner token was saved or ownership control bypassed. The harness added forceRefresh=true to the normal UI plan request; it did not substitute responses, use fixture planning, or book through a direct portal API.

TC1 submitting Browserbase session: `7ee11569-9cf9-4663-8ec3-9d1681a7521c`.
TC1 independent verifier session: `dd3d3a01-12ec-4d41-99b9-bb5a06513a14`.
All 11 exact policy/booking/verifier session IDs returned HTTP 200 and terminal status COMPLETED (session-terminal.json). The hosted journey command exited 0. No real pickup, dispatcher scheduling, payment, or extra portal booking was initiated.

## Extraction limitations, separate from official case outcomes

For each refreshed plan, Deccan and PaperPlus returned SUCCESS through labelled dom-fallback, provenance live, freshness fresh, cached=false, with original retrieval/expiry timestamps retained. QuickScrap returned POLICY_UNREADABLE / uncertain, with Gemini HTTP 429 after bounded retries and an actionable failure message. No successful generic Gemini extraction is claimed for these runs. The exact quota/capacity cause is not established from runtime logs. No fixtures, invented fees or fabricated success replaced failed extraction.

The selected TC1 leg and both TC2 allocation legs used fresh successful live DOM evidence and passed existing approval/expiry guards. QuickScrap was not selected. Successful AI extraction for every recycler is not an additional official case requirement. Raw methods, uncertainty, quotes, URLs and times are recorded in results.json and persisted-evidence.json.

## TC4-only local implementation

Inspection found one preferredSlot field in the portal booking model. Both local storage and the existing Supabase status-update RPC used it for customer preference AND dispatcher assignment, overwriting the former during scheduling. There was no independent assignment column.

The fix:

- Tracking now renders separate Requested slot and Assigned slot fields. Receipt, preferredSlot and even booking status SCHEDULED alone do not establish an assignment.
- An assignment requires an explicit STATUS_UPDATED_SCHEDULED dispatcher event. New scheduling writes a structured dispatcher assignment with the original customer preference into the existing event detail field. Tracking renders its human message, not the transport JSON.
- Supabase scheduling continues through the existing atomic status/event RPC, but removes slot from p_options so the legacy RPC cannot overwrite preferred_slot. The assignment is persisted in the same event transaction. Local storage follows the same contract.
- Existing explicit legacy dispatcher scheduling messages remain readable as assignment evidence. Their original preference may already have been overwritten; the UI shows Not recorded rather than inventing a requested time. No historical row or event is rewritten or backfilled.

No migration, grant, RLS, approval, fee, ownership, CAPTCHA or credential change was made. DEC-46179 remained RECEIVED throughout read-only checks. Historical evidence for DEC-47124 and DEC-42479 was preserved; a read-only query found no rows for those older references in the currently queried portal cloud table, which does not establish their earlier remote state. No deletion was attempted.

An unrelated visible UI inconsistency is preserved in TC3-declined.png: the request is clearly Declined, but a proposed leg still has an Approved badge. Its request state is REJECTED and execution count remains zero. It was not changed in this TC4-only fix.

## Validation and actual exit codes

| Check | Result | Exit |
|---|---|---|
| Hosted journey, TC1–TC4 automated observations | Completed; official review is 3 PASS / 1 FAIL as above | 0 |
| Persisted evidence and session teardown probe | Run-scoped records/traces retained; all 11 sessions COMPLETED | 0 |
| Focused slot + portal regression tests | 3 files / 59 tests passed | 0 |
| Affected-file lint | Passed, no warnings | 0 |
| Portal TypeScript check | Passed | 0 |
| Portal production build | Passed | 0 |
| Local built-portal browser check | Existing DEC-46179 read only: RECEIVED / requested time / Assigned slot Not assigned; separate intercepted SCHEDULED fixture: original preference and explicit dispatcher assignment shown separately | 0 |
| Evidence secret scan and diff check | No current secret-value matches; diff check passed | 0 |

The initial regression test expected the old preference-overwrite bug (44 passed / 1 failed). Its expectation was updated to assert preserved preference plus separate dispatcher assignment, and the final 59-test suite passed. Initial local UI startup failed because root .env.local lacks CAPTCHA_SECRET; that failed log was preserved. A test-only CAPTCHA value was supplied solely to the localhost child process for read-only tracking checks. No credential file changed and no challenge/booking was submitted there. Both local browser/server processes were closed at teardown.

Principal evidence: results.json (raw automated observations), reviewed-results.json (official TC4 correction), persisted-evidence.json (policy and DOM readback proof), TC1-plan.png, TC1-review.png, TC1-after-booking.png, TC2-plan.png, TC3-review.png, TC3-declined.png, TC4-household.png, TC4-portal.png, session-terminal.json, LOCAL-slot-received-DEC-46179.png, LOCAL-slot-scheduled-fixture.png, local-slot-browser.json, slot-tests-final.log, slot-lint-final.log, slot-typecheck-final.log, portal-build.log, final-state.json. No secrets, signed evidence URLs, owner cookies or authenticated connection strings were intentionally saved.

## Remaining action

The portal fix is committed locally only. Hosted TC4 remains FAIL until an explicitly authorized deployment of this portal commit to the existing portal projects, followed by a read-only TC4 check against DEC-46179. No repeat booking is required. The household's deployed commit remains the operator-confirmed 7a3eb0a. Gemini HTTP 429 and missing generic AI-path proof remain separate limitations; they do not invalidate the completed official TC2 routing outcome.

# Hosted submission verification — 23 October 2026

Run marker: `20261023-1640`. Checks started approximately 17:44 IST. Raw evidence: `.data/submission-verification-20261023-1640/`.

Checkpoint: `ui/recircuit-household-redesign`, `73cc058e27aa3ce2c825950f2ea29aba9a798797`, clean working tree before changes. No AGENTS.md was found. Existing deployment instructions were read. Hosted deployment commit and production environment values could not be inspected: no existing Vercel authentication was available in the checked environment/auth-file location. No deployment was performed.

## Submission results

| Case | Result | Expected versus observed |
|---|---|---|
| TC1 Laptop | BLOCKED | Hosted UI created request `26c18145-317b-4f4d-b620-87ce27035760`. The laptop proposal used DOM fallback evidence rather than successful Gemini extraction; QuickScrap was unreadable after Gemini timeout. Booking, wipe acknowledgement, approval, form readback and separate independent verification were not executed. No booking reference exists for this run. |
| TC2 Paper and batteries | BLOCKED (routing checks passed) | Request `e07b7a2f-cbb8-4857-8485-4637a5f7d6c2`: PaperPlus received only the proposed newspaper row (quantity 1, 8 kg; fee 0, conditional payout 96); Deccan received the proposed batteries (quantity 4, total 0.5 kg; fee 180). No batteries were allocated to PaperPlus. Evidence was cached DOM fallback for these recyclers; successful Gemini extraction remains unverified. No booking or CAPTCHA handoff was attempted. |
| TC3 Over budget | BLOCKED (proposal and pre-approval checks passed) | Request `3a0a9e7e-9aeb-4008-bedc-8461357d9616`: persisted fee cap 100; Deccan proposed fee 180 and conditional laptop payout 250. Saved approval card and matrix are in storage-evidence.json. Backend action reads confirmed zero actions. The request remains AWAITING_APPROVAL; decline was not exercised. |
| TC4 Requested is not collected | NOT RUN | No TC1 booking reference or independent verifier exists, so no hosted tracking/assigned-slot or collection assertion is claimed. |

These are incomplete submission cases, not full passes. All three synthetic request records are retained and remain AWAITING_APPROVAL. Approval/decline and booking phases were not executed; the browser harness closed its isolated contexts after planning. Do not interpret the screenshots or health checks as completed booking evidence. No original owner cookie/token was saved, and ownership checks were not bypassed to continue those contexts.

## Actual hosted evidence and diagnosis

All five HTTPS health endpoints returned HTTP 200: household custom domain, household Vercel fallback, Deccan, PaperPlus and QuickScrap. Portal responses showed correct recycler identities and Supabase storage. Read checks found each portal home, its intended policy/fee page, intended booking form and sampled JavaScript asset available. Unrelated cross-recycler paths returned 404 as expected; see pages.json for exact URLs/statuses. Production plan metadata references the three supplied deployed portal origins.

TC1–TC3 actual hosted plan responses returned HTTP 200 but did not demonstrate successful generic AI extraction. Deccan/PaperPlus were labelled dom-fallback (subsequently cached with original retrieval timestamps); QuickScrap reported `Extraction failed anti-hallucination / parsing: Gemini request failed or timed out`. The previously reported HTTP 503 was not reproduced in these runs. Runtime logs and production Gemini model/key configuration were inaccessible; therefore quota, capacity and the original 503 root cause cannot be distinguished from available evidence. No unsupported root-cause assertion is made. Raw hosted failures and retrieval/expiry timestamps are retained in plans.json and remaining-plans.json.

No fake/fixture responses were substituted by the test harness. Actual deployed planning used Browserbase and the hosted backend, with clearly fictional synthetic contact information. No direct API booking was used. The only application records created are the three attributed planning requests; no payments, real recycler contacts or scheduling occurred. DEC-47124, DEC-42479 and historical evidence were not modified or deleted.

## Local fix, separate from hosted checks

The Gemini adapter lacked backoff and Retry-After handling. Added at most three attempts for HTTP 429/502/503/504, exponential delay with jitter, numeric/date Retry-After support, and one shared abort deadline across the entire adapter invocation. If Retry-After cannot fit in the remaining budget, it does not retry. Exhausted transient errors give an actionable message and do not claim extraction success. Permanent HTTP 400/401/403/404 produce configuration errors, which stop automatic retries in both structured-output and worker policy extraction loops. JSON/schema validation, quoted-source checks, fixture isolation and cache timestamps are preserved.

This fix is LOCAL ONLY. No push/redeployment was authorized. Hosted retries with this fix were NOT tested. Next deployment action, after explicit authorization: deploy the final local commit to the existing household Vercel project rooted at apps/web, preserving its private production environment; then rerun the four cases and retain browser context through approval/decline and any human CAPTCHA handoff. Portals do not require rebuilding for this code change.

## Actual commands and exits

- Public health probe: node check.mjs — exit 0; five HTTP 200 responses.
- Portal page/asset probe: node pages.mjs — exit 0; raw expected and cross-route statuses retained.
- First hosted Playwright harness: TC1 completed; TC2 used an incorrect preset ID and stalled on local form validation. Inspected and terminated only that run and its child browser processes. It did not complete with exit 0. Failure evidence remains in hosted.log. This was a harness defect, not a reproduced product defect.
- Corrected hosted Playwright harness: node remaining.mjs — exit 0; TC2 and TC3 planning completed; screenshots saved.
- Run-scoped storage and session probe: node storage.mjs — exit 0. All three requests AWAITING_APPROVAL with action count 0. No owner tokens saved.
- Focused unit tests: Gemini adapter/retries and policy reader — 3 files / 20 tests passed, exit 0. Retry test verified a mocked 503 followed by success respecting Retry-After; permanent HTTP tests verified a single adapter attempt. This is local mocked evidence, not a hosted retry pass.
- Affected household production build: npm run build:household — exit 0 (build-final.log). No portal code changed.
- Lint and typecheck final results: see lint-final.log and typecheck-final.log; final exit statuses recorded in final-state.json.

## Teardown and retained artifacts

Five exact Browserbase policy-session IDs were recovered from these synthetic requests and checked individually through the authenticated session API. All returned HTTP 200 and terminal status COMPLETED. See sessions.json. No verifier session was created. Only this run's stalled local browser process tree was terminated; corrected harness closed its browser in finally. No unrelated session or process was stopped.

Evidence: health.json, pages.json, plans.json, remaining-plans.json, TC1.png, TC2.png, TC3.png, storage-evidence.json, sessions.json, deployment-access.json, hosted.log, remaining.log, tests-final.log, build-final.log, lint-final.log, typecheck-final.log, final-state.json. No secrets, owner tokens, signed evidence URLs or authenticated connection strings were intentionally persisted.

Remaining blockers: unverified production Gemini extraction/timeouts; inaccessible runtime logs/configuration; local retry fix not deployed; booking and independent verification not completed; TC3 decline not exercised. No claim of submission readiness. No push, deployment, migrations, DNS change, soak, reset, broad cleanup or booking occurred.

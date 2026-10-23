# Focused final release check — 23 October 2026

Checkout: C:\Users\Manish\Downloads\ReCircuit-Local, branch ui/recircuit-household-redesign. Starting HEAD 52052a541390cdfd582d20f7901bcdf6dc9b82bc, clean; matches requested candidate.

Real /api/plan, /api/approve and /api/book handlers were exercised with a temporary FileRepository per test, synthetic normalized live-policy retrieval, real planning/approval logic and a booking submission-boundary spy. No external live retrieval or actual portal submission is claimed by these regressions.

Before fix: expired-before-approval returned 200 and saved APPROVED; expired-after-approval returned 200 and crossed the booking boundary using the original valid approval hash. Positive control passed. See .data/final-release/expiry-reproduction-final.log (2 failed, 1 passed, exit 1). Earlier harness setup failures and sandbox denial remain alongside it.

Fix: approve/book require fresh SUCCESS live/cached metadata for each routed recycler, valid future expiry and finite leg fee before state mutation/submission. Fixture review behavior is preserved; fixture booking remains prohibited. Expiry returns 409 pending policy refresh through planning. There is no automatic refresh during execution. Existing replanning clears approval; the resulting plan is reviewed again. No special approval restriction was added for identical terms. Existing planning rejects unknown fees and acceptance failures. Unrelated/unrouted failed sources do not block eligible legs.

Final focused regression: 6 passed, exit 0 (.data/final-release/expiry-final.log). Both expiry cases preserve plan content/hash; after-approval test preserves the original valid approval and APPROVED leg state. Each blocked case asserts ZERO calls to BookingRunner.bookLegWithTransitions, so no portal booking can be created through that boundary. Fresh evidence returns 200 for approval and booking, exactly one boundary call. Additional cases cover uncertain, failed-refresh and missing-expiry metadata. Approval normally adds the data-wipe acknowledgment to its canonical hash; the post-approval test uses that returned hash unchanged when expiring evidence.

Production builds executed sequentially: portals exit 0, web exit 0. Logs: .data/final-release/build-portals.log and build-web.log. Both emitted successful production route/build output.

Validation executed: npm run lint exit 0; npm run typecheck initially exit 2 (test-only evidence type), corrected final exit 0; npm test exit 0, 19 files / 297 tests; final focused 6 tests exit 0 after test-only correction. Logs and explicit exit files are in .data/final-release. The reported prior 291 unit / 47 browser passes were not treated as results from this run.

Affected Playwright household journey attempted once against isolated production servers with occupied-port refusal, 60s startup, bounded actions/navigation and 300s global limit. Exit 1: server readiness timed out before any browser test executed (0 tests). No assertion weakening, timeout increase or duplicate rerun. Output: .data/final-release/playwright.log; isolated config: .data/final-release/playwright.config.mjs. Startup root cause remains unresolved. Owned observed server PIDs 27116 and 41612 were absent after teardown. Browser validation is the remaining release-check blocker.

No cloud run, Browserbase, tunnel, deployment, soak or push. DEC-47124 and DEC-42479 historical evidence was not modified. No broad cleanup/reset or unrelated changes. This focused result does not establish exhaustive security, cloud readiness or submission completion.

# ReCircuit household redesign handover

Implemented and browser-verified locally on 23 October 2026. The attributable implementation is preserved in the `ui/recircuit-verified-household` branch and worktree `.data/redesign-verification`. That branch starts at `68e622d4d1791c5a2c556fcf2712ec89da7482dc`; its final commits add the tested fixes and evidence. The original `ui/recircuit-household-redesign` working tree was not reset or overwritten. It acquired commit `8b82713` and further uncommitted changes during verification, despite the user's confirmation that no other task was running. Those changes are preserved and are outside the verification claim.

## Delivered behavior

- `/`: session-owned pickups with real persisted records and honest empty/loading/error states.
- `/arrange`: structured editable rows, stable item IDs, total-row kilogram weights, integer quantities, contact/address and fee/slot preferences; optional description parsing produces an editable proposal. Fictional examples fill a draft without booking.
- `/r/[requestId]`: extracted recycler policies, deterministic allocations and alternatives, explicit review/acknowledgments, separate approval and booking, persisted receipt/handoff, independent verification, recorded activity, authorized evidence drawer.
- `/test-cases`: secondary fictional reviewer checks; no reset or booking side effects.
- Responsive neutral/forest-green shell, rc design tokens, system fonts, skip link, native dialogs with keyboard focus containment, reduced-motion support and reflow.

The exact handler/schema/authorization/state inventory is in [contracts.md](contracts.md). Files include web pages/components and guarded API handlers, FileRepository metadata/null-approval persistence, worker any-time-slot normalization, verifier fee parity, audit-event filtering, isolated test paths and repeatable local scripts. No cloud booking, deployment, push, merge, tunnel or soak was performed.

## Verification and evidence

Tests ran in the isolated worktree with synthetic local household/portal data. The local launcher forces local browser/fake parser configuration, removes cloud credential variables, uses private fixture storage, and refuses occupied ports. It does not load `.env.local`.

| Check | Actual result |
|---|---|
| `npm.cmd run build --workspace=@recircuit/web` with `NEXT_DIST_DIR=.next-household-redesign` | Exit 0 after final no-match fix; production Next 14.2.35 build |
| `npm.cmd run typecheck` | Final exit 0, including strict worker index checks |
| `npm.cmd run test` | Sandbox esbuild config access failed before tests; escalated isolated repeat exited 0: 17 files, 285 tests; final repeat after lint repairs also exit 0 (8.84 s) |
| `npm.cmd run lint` | Final exit 0. Initial isolated run found 14 typing lint errors; strict string guards and explicit missing-index checks resolved them without disabling rules. See verified-lint-final.log. |
| Main managed browser journey | All checks passed; [browser-results.json](browser-results.json) |
| Contract checks after stale-approval fix | All checks passed; [contract-results.json](contract-results.json) |
| No-match/partial-policy/keyboard checks after no-match fix | All checks passed; [partial-results.json](partial-results.json) |

The full journey used actual local portal browser submission and a separate verification session: 2.5 kg laptop, INR180 fee, receipt preserved on reload, duplicate submission retains reference, RECEIVED remains a booking receipt. It checked unauthorized cross-session reads/mutations, split item allocation, and real local CAPTCHA handoff without solving it. Edits to quantity, weight, row identity, fee cap, address and slot invalidate approval and reject stale callers from two shared-cookie sessions. Schema checks cover duplicate IDs, invalid quantities/weights and fee precision. A 5 kg threshold confirms weights are total per row, not multiplied by quantity. Reviewer checks leave records unchanged; cross-origin mutation is rejected.

The final no-match fix persists an empty allocation for review instead of returning 500; empty plans cannot be approved. Partial-source tests hide fee information in isolated portals, retain unknown fees and preserve the usable PaperPlus allocation; synthetic switches are restored in finally.

Axe checks found zero violations for the tested overview, intake, comparison, review, tracking and evidence views and the partial-source drawer. This is targeted automated coverage, not a WCAG certification. Viewports: 360, 390, 768, 1024, 1440. The 200% check uses CSS zoom/reflow emulation, alongside reduced-motion and keyboard checks. Initial zoom overflow and dialog focus escape were fixed. Screenshots were visually inspected, including mobile intake/partial and verified desktop tracking. The final managed checks returned exit 0 after explicitly stopping the one remaining known fixture web PID; sandbox teardown initially left that process alive. No broad process kill was used.

Selected images:

- [Baseline desktop](screenshots/baseline-cbf09d4-1440.png) / [baseline mobile](screenshots/baseline-cbf09d4-390.png)
- [Intake desktop](screenshots/02-intake-desktop.png) / [mobile](screenshots/intake-390.png)
- [Comparison](screenshots/03-comparison-desktop.png) / [review](screenshots/04-review-desktop.png)
- [Verified tracking](screenshots/07-tracking-verified-desktop.png) / [mobile](screenshots/tracking-390.png)
- [Evidence](screenshots/08-evidence-desktop.png) / [human handoff](screenshots/12-human-handoff-mobile.png)
- [No match](screenshots/13-no-match-mobile.png) / [partial discovery](screenshots/14-partial-discovery-mobile.png)
- [200% reflow](screenshots/intake-200-percent.png)

Baseline images were captured later from a private restoration of the original `cbf09d4` UI source, with no mutation handlers, rather than before-task screenshots. Failed/intermediate logs remain in the original docs/redesign directory; prior JSON reports were copied into `.data/redesign-preservation/before-final-evidence`. Logs are locally retained and ignored by git. Browser result files contain synthetic IDs only; fixture access cookies are redacted from script error output.

## Data limitation requiring attention

An early baseline unit run occurred before logging was fully isolated. Existing tests cleared `.data/action-log.jsonl` and overwrote `.data/verifications/DEC-12345.json`; previous contents may have been lost. This was disclosed during work. Household request and portal booking records were not reset. Later unit/browser runs use isolated storage. No claim that all prior data remained untouched is made.

## Remaining product/operational limits

No durable household web job queue, automatic restart recovery, account/session recovery, live CAPTCHA resume endpoint, or household scheduling mutation exists. Interrupted booking locks deliberately require operator reconciliation; uncertain outcomes are not automatically resubmitted. Old unowned requests are not adopted into new browser sessions. Household metadata uses FileRepository; PostgreSQL metadata integration is not delivered. Secure cookies require `RC_SECURE_COOKIE=true` behind HTTPS. The UI requires customer details; the planning API retains its legacy fallback customer when omitted, which should be removed before exposing non-UI callers. Physical collection, actual payout and external recycler behavior were not tested. Portal normalized labels cannot prove original descriptions or row UUIDs absent from portal observations. Existing pricing rounds summed load to three decimals. Detailed boundaries are in contracts.md.

## Run locally

Run from the verified worktree; install dependencies if the local node_modules junction is unavailable. This worktree currently shares the original repository's installed dependencies.

```powershell
npm.cmd run build
$env:NEXT_DIST_DIR = '.next-household-redesign'
npm.cmd run build --workspace=@recircuit/web
node scripts/redesign-local.mjs
```

Open `http://localhost:3200`; local portals use 3101?3103. Stop the launcher before running `node scripts/verify-household-local.mjs`, which owns its fixture servers. `--checks-only` skips the already covered booking journey. On Windows verify the launcher children terminate; stop only PIDs recorded by that invocation if sandbox process-tree teardown is restricted.

Configuration names: NEXT_DIST_DIR, RECIRCUIT_DATA_DIR, STORAGE_DIR, BROWSER_MODE, LLM_PROVIDER, CAPTCHA_SECRET, ADMIN_TOKEN, RC_SECURE_COOKIE. The launcher supplies synthetic local values and removes cloud/portal URL overrides. No secret values from user configuration are needed in this report.

## Review state

Original implementation commits: `65124a7`, `2d1a9e5`, `68e622d`. The health endpoint accidentally staged with the broad implementation stage was removed from tracking in `68e622d` while retaining its local file. Final tested fixes/evidence and narrowly scoped strict-typing cleanup are on the verified branch; the root working tree's additional commit and modifications remain preserved. See git branch/log/status for exact current SHAs; no remote operation was performed.

Final typing cleanup changes only primitive-string guards in portal admin/Supabase mapping and explicit absent-index guards in worker booking/policy/verification. Final lint, typecheck and all 285 unit tests passed after it; browser captures precede this cleanup, whose normal valid-input paths are unchanged.

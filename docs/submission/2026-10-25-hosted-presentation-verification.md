# Hosted presentation fixes and verification ? 25 October 2026

## Release decision

**Hold production release.** The presentation fixes pass local checks, but deployment commit identity and authenticated preview verification remain BLOCKED. No production promotion, configuration change, booking, provider execution or shared migration occurred. Hosted routing is explicitly disabled.

## Repository and deployment identity

- Main checkout: `ui/recircuit-household-redesign`, local/remote `78faed277c13c4bedc121645386ffea3dd74963c`. Its pre-existing edit to `docs/submission/2026-10-23-resumed-slot-verification.md` is untouched.
- Implementation worktree: `.data/scheduling-integration-20261024/worktree`, existing feature branch `presentation/rich-workspace-20261024`. Starting local/remote HEAD: `35fb2958ec6804f2a315f601a8880c5ae3ee920e`.
- Verified implementation commit: `bf3c623456ebd4ddec9c9e714961336abde6bd6d` (9 files, 199 insertions, 45 deletions). The evidence report is committed separately after it.
- Push attempted, not completed: interactive credential manager did not supply a credential; noninteractive retry returned exit 128, `could not read Username`. Remote HEAD was still `35fb2958ec6804f2a315f601a8880c5ae3ee920e`. No other authenticated Git client was found.
- Four pre-existing generated metadata edits (`apps/{portals,web}/{next-env.d.ts,tsconfig.json}`) were backed up and restored byte-for-byte, excluded from attributable commits.

| App | Production origin | Actual production commit | Supplied preview commit | Preview behavior |
|---|---|---|---|---|
| Household | `https://recircuit.automconsultancy.in` | BLOCKED ? unavailable from public responses | BLOCKED ? not established | Chromium redirects to `https://vercel.com/login`; no sign-in or bypass |
| Deccan | `https://deccan.automconsultancy.in` | BLOCKED ? unavailable from public responses | BLOCKED ? not established | Chromium redirects to `https://vercel.com/login`; no sign-in or bypass |
| PaperPlus | `https://paperplus.automconsultancy.in` | BLOCKED ? unavailable from public responses | BLOCKED ? not established | Chromium redirects to `https://vercel.com/login`; no sign-in or bypass |
| QuickScrap | `https://quickscrap.automconsultancy.in` | BLOCKED ? unavailable from public responses | BLOCKED ? not established | Chromium redirects to `https://vercel.com/login`; no sign-in or bypass |

The branch-style preview hostnames do not prove commit identity. Public GitHub deployment listing returned HTTP 200 with an empty list. The deployment ID seen after the redirect belongs to the Vercel login page and is not attributed to a ReCircuit deployment. No production/local ancestry diff can be claimed without actual deployed SHAs. Public observations were recorded before editing; the local report dated 24 October is not hosted evidence.

Authenticated Vercel metadata inspection was rejected by automatic approval review because the existing local CLI bearer token had not been established as an approved hosted credential. That script was not executed; no bearer value was printed or submitted. Explicit approval for read-only Vercel management access was requested separately. Database isolation and approved application test credentials remain unestablished.

## Fixed defects and actual local/hosted differences

| Defect | Cause | Production observation | Verified local result |
|---|---|---|---|
| Wrong service date | `routingDate()` literal fallback `2026-10-24`, not a build-cache explanation | All three routing interfaces default to 24 October on 25 October | Current service date in Asia/Kolkata; per-request server date reused for hydration, refreshed at IST midnight and on focus/visibility; valid explicit URL dates survive navigation/reload |
| Pilot wording | Literal sidebar/footer strings | `Local pilot` / `Local public-location pilot` | Neutral `Route planning` / `Pickup route planning`; proposal-only and no-dispatch statements retained |
| Prefilled bookings | `getDefaultItems()` initialized each tenant with a fixture row; entry weight defaulted to 5 kg | Dell Laptop / Old Newspaper / Old Electronics & Books already listed | Zero item rows, blank weight, explicit empty instruction; no fee quote or booking action until actual items; add/remove triggers real fee lookup |
| Test pincode option | Literal public dropdown entry | `500001 (Non-serviceable test)` present for all tenants | Six-digit entry with serviceable suggestions, immediate unsupported-area feedback; server rejection and negative tests retained |
| Slot hydration risk | Slots computed independently during server/client render | Local clock-controlled browser run exposed mismatched dates in slot option text | Time-dependent slots generated after hydration; browser date differing from server produces no hydration errors |

Colours, typography, dedicated routing pages and layouts remain intact; the replacement pincode input retains its prior rounding class. No demo banner or replacement About link was added. Examples remain in the existing tests, and explicit household example links are distinct from ordinary form defaults.

## Executed verification

| Check | Result | Evidence |
|---|---|---|
| Focused date/forms/fees/service-area/lifecycle regressions | PASS ? 5 files, 80 tests | `focused-tests-release.log` |
| Lint / typecheck | PASS ? exit 0 | `lint-release.log`, `typecheck-release.log` |
| Affected portal production build | PASS ? exit 0 | `build-portals-release.log` |
| Household production build | PASS ? exit 0 | `build-household-final.log` |
| Hosted desktop/mobile rendered public pages | PASS for rendering ? 84 observations, 1440?900 and 390?844; zero page exceptions/overflow | `public-browser/results.json` and 84 PNGs |
| Hosted actual 200% browser zoom | PASS ? 14 checks; chrome zoom 2, CSS width 1440?720, DPR 1?2; zero overflow/page exceptions | `production-zoom-native-capture/results.json` and native viewport PNGs |
| Corrected local desktop/mobile pages | PASS for rendering ? 78 observations, zero page exceptions/overflow | `local-browser/results.json` |
| Corrected local interactions and actual 200% zoom | PASS ? 18 assertions across all tenants, including fee recalculation, removal, unsupported input, IST midnight, explicit URL date navigation/reload and hydration | `local-interactions-v6/results.json` |
| Keyboard smoke | PASS ? Tab produces a visible focused skip link on public pages | Per-page `keyboardFocus` and screenshots; not a full keyboard audit |
| Household alignment | PASS for anonymous empty/list-entry layout at desktop/mobile/200%; populated rows BLOCKED without approved hosted owner session | Household screenshots; hosted request list for anonymous owner is empty |
| Original data preservation | PASS ? all 150 source JSON files match the isolated verification copy | `dataset-preservation.json` |

The browser harness permits only read methods and exact application origins; no provider calls or booking submissions were allowed. PaperPlus CAPTCHA was displayed, never solved or submitted. Local browser checks used a copied fictional dataset and local-only configuration, never hosted credentials. Local execution is not evidence of a hosted lifecycle.

Console observations: invalid synthetic tracking references produced expected API 404s, operator pages produced expected API 401s, and disallowed tenant `/rates` paths produced 404s. These are retained instead of reported as zero console errors. Fourteen aborted same-origin route requests are retained in the original public run. A bounded diagnostic rerun of the 11 affected pages reproduced three aborted fetches, each explicitly marked `rsc: 1`, `next-router-prefetch: 1`, `navigation: false`, before teardown. These are Next.js route prefetch requests, not primary navigation or script/style/image failures; their exact internal cancellation reason is not established. All 11 pages settled without page exceptions. See `request-diagnosis.json`.

## Production page matrix

PASS below means settled public rendering and appropriate empty/error/auth states; it does not certify backend booking or persistence. FAIL identifies requested presentation defects still present on production. BLOCKED identifies unsupported or inaccessible behavior. Desktop and mobile observations have the same outcomes.

| App | Page | Status | Evidence / limitation |
|---|---|---|---|
| household | `/` | PASS | Anonymous empty state, counts and alignment render; populated ownership-dependent rows BLOCKED. |
| household | `/arrange` | PASS | Rendered content; no page exception or horizontal overflow. |
| household | `/test-cases` | PASS | Rendered content; no page exception or horizontal overflow. |
| deccan | `/` | PASS | Rendered content; no page exception or horizontal overflow. |
| deccan | `/accepted-items` | PASS | Rendered content; no page exception or horizontal overflow. |
| deccan | `/pickup-charges` | PASS | Rendered content; no page exception or horizontal overflow. |
| deccan | `/book-pickup` | FAIL | Prefilled fixture item and test pincode remain on production; corrected locally. |
| deccan | `/book-pickup/confirmation` | PASS | Missing-reference state renders; no successful confirmation asserted. |
| deccan | `/track` | PASS | Empty tracking entry renders; positive reference lifecycle BLOCKED. |
| deccan | `/track?ref=DEC-00000` | PASS | Synthetic unknown reference renders No booking found; expected API 404. No actual booking inspected. |
| deccan | `/admin` | PASS | Administrator sign-in renders; API 401 without token. Authorized console operation BLOCKED. |
| deccan | `/admin/routing` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| deccan | `/admin/routing/preparation` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| deccan | `/admin/routing/fleet` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| deccan | `/admin/routing/proposals` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| deccan | `/admin/routing?date=2026-10-26` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| deccan | `/rates` | BLOCKED | Not a supported public route for this tenant; intentional route isolation returns 404. Use its linked rates page. |
| paperplus | `/` | PASS | Rendered content; no page exception or horizontal overflow. |
| paperplus | `/what-we-take` | PASS | Rendered content; no page exception or horizontal overflow. |
| paperplus | `/schedule` | FAIL | Prefilled fixture item and test pincode remain on production; corrected locally. |
| paperplus | `/schedule/done` | PASS | Missing-reference state renders; no successful confirmation asserted. |
| paperplus | `/status` | PASS | Empty tracking entry renders; positive reference lifecycle BLOCKED. |
| paperplus | `/status?ref=PPK-00000` | PASS | Synthetic unknown reference renders No booking found; expected API 404. No actual booking inspected. |
| paperplus | `/admin` | PASS | Administrator sign-in renders; API 401 without token. Authorized console operation BLOCKED. |
| paperplus | `/admin/routing` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| paperplus | `/admin/routing/preparation` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| paperplus | `/admin/routing/fleet` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| paperplus | `/admin/routing/proposals` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| paperplus | `/admin/routing?date=2026-10-26` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| paperplus | `/rates` | BLOCKED | Not a supported public route for this tenant; intentional route isolation returns 404. Use its linked rates page. |
| quickscrap | `/` | PASS | Rendered content; no page exception or horizontal overflow. |
| quickscrap | `/rates` | PASS | Rendered content; no page exception or horizontal overflow. |
| quickscrap | `/pickup` | FAIL | Prefilled fixture item and test pincode remain on production; corrected locally. |
| quickscrap | `/pickup/thanks` | PASS | Missing-reference state renders; no successful confirmation asserted. |
| quickscrap | `/track-order` | PASS | Empty tracking entry renders; positive reference lifecycle BLOCKED. |
| quickscrap | `/track-order?ref=QSH-00000` | PASS | Synthetic unknown reference renders No booking found; expected API 404. No actual booking inspected. |
| quickscrap | `/admin` | PASS | Administrator sign-in renders; API 401 without token. Authorized console operation BLOCKED. |
| quickscrap | `/admin/routing` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| quickscrap | `/admin/routing/preparation` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| quickscrap | `/admin/routing/fleet` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| quickscrap | `/admin/routing/proposals` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |
| quickscrap | `/admin/routing?date=2026-10-26` | FAIL | Pilot wording remains; default date is 2026-10-24 unless explicit URL date supplied. Authenticated backend BLOCKED (ROUTING_DISABLED). |

Saved proposal details and household request detail pages require owned records/authorized access and are BLOCKED, rather than fabricated using a guessed record or local token.

## Hosted configuration and workflow matrix

Read-only production endpoints: household health 200; runtime reports Groq `openai/gpt-oss-20b` available (no model execution was attempted). Each portal health returns its correct tenant and `storage: supabase`; `/api/admin` returns 401; `/api/routing?date=2026-10-25` returns 503 `ROUTING_DISABLED` with `planningOnly: true`. These checks do not identify or isolate the underlying database.

Source inspection of the verified local branch: production routing additionally fails closed with `ROUTING_LOCAL_PREVIEW_ONLY`; shared routing storage is admitted only in an explicit localhost test configuration. Hosted scheduling with an `expectedUpdatedAt` guard throws `HOSTED_CONCURRENT_DISPATCH_NOT_ENABLED`, pending a reviewed transactional RPC change. No guard was weakened and no migration was run. The actual deployed source/config cannot be equated to local source until commit identity is established.

| Hosted stage | Household | Deccan | PaperPlus | QuickScrap | Blocker |
|---|---|---|---|---|---|
| Identify exact deployment, test DB and approved access | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No verified isolated environment, database identity or approved application test session. |
| Create fictional request / policy comparison / allocation and fees | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Hosted writes/provider execution prohibited until isolation is verified. |
| Decline creates no booking | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Requires isolated hosted request; local regression evidence does not substitute. |
| Approve / book idempotently / reload persistence | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No isolated database or approved hosted credentials; CAPTCHA/approval retained. |
| Supported independent verification | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No authorized isolated verifier/provider workflow; simulated evidence not promoted to real. |
| Exclude unscheduled bookings / assign dispatcher window | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Routing disabled; hosted transactional scheduling is not enabled in inspected source. |
| Selected date and tenant routing eligibility / cross-tenant denial | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Authenticated hosted routing disabled. Local negative tests pass only locally. |
| Preparation / vehicles / depots | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Authenticated routing and isolated writes unavailable. |
| Generate / independently validate / save / reload proposal | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Routing disabled; shared hosted coordination not enabled; provider authorization/quota unverified. |
| Reschedule invalidation / cancellation / collection exclusions | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Requires isolated lifecycle and enabled transactional scheduling; not performed on production. |

## Retained failures and evidence

Raw evidence root (main workspace): `.data/hosted-fixes-20261025/`. It contains public endpoint probes, browser JSON/screenshots, native zoom captures, local dataset copy, original metadata backups, all initial/final test and build logs, and preservation hashes.

- `local-interactions`, `local-interactions-final`, `local-interactions-v3`, `local-interactions-v4`, `local-interactions-v5` retain failed/interrupted harness runs. Issues included inherited per-origin zoom, a non-exact label matching a region and input, clock advancing during navigation, paused-clock router scheduling and premature URL assertions. Final assertions were retained; the harness was corrected to isolate clock contexts, pause exactly before midnight, resume for navigation, wait for committed URLs and reset zoom.
- The clock-context leakage also exposed the real slot hydration risk, fixed in product code. Native CDP viewport capture replaces clipped Playwright full-page screenshots at actual browser zoom; earlier captures remain preserved.
- The first test invocation selected PowerShell `npx.ps1` and was blocked by execution policy; the successful runs used `npx.cmd` without altering policy. The first Git commit attempt was blocked by read-only worktree metadata; the authorized elevated commit succeeded.
- The first push waited for credential-manager authentication and was interrupted; the bounded noninteractive retry produced the explicit missing-credential failure. Existing credentials/configuration were not changed.
- No original dataset, historical report, screenshot or recording was deleted or rewritten. Locally started verification servers were stopped; pre-existing servers were not targeted.

## Release recommendation and next actions

Do not promote yet. First restore an approved GitHub push session and push this feature branch. Inspect only the resulting automatic previews; verify their actual deployment SHAs against remote HEAD and rerun the focused public checks. Explicitly authorize read-only Vercel management inspection or supply operator-reviewed deployment identities without secrets. Identify a pre-existing isolated hosted database/environment and approved application test access before any lifecycle writes.

Review the actual patch with `git show bf3c623456ebd4ddec9c9e714961336abde6bd6d`. It changes presentation/date handling, form initialization and regression/evidence scripts; no SQL, shared persistence or authorization change is included. A code-level feature rollback target is `35fb2958ec6804f2a315f601a8880c5ae3ee920e`, which is **not verified as any production deployment**. The production rollback deployment must be identified per project through authorized metadata before a release can be recommended. Routing execution must remain disabled until its separate shared-storage/transactional release requirements are met.

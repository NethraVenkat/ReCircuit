# Scheduling integration and local demo

Integration branch: `integration/scheduling-shared-ui-20261024`, based directly on `e9e5b7a` (the clean routing navigation checkpoint). Existing worktrees, commits, videos and evidence were retained. The original main checkout's unrelated submission-document edit was not changed. Exact final HEAD and worktree inventory are recorded in the sibling evidence directory's `final-state.json`.

## Authoritative routing contract

Routing does not schedule or assign pickups. A routing candidate must have **all** of the following:

1. Recycler ownership matching the authenticated server tenant.
2. Current booking status `SCHEDULED`, excluding cancelled, picked-up and weighed bookings.
3. An explicit dispatcher assignment in booking event history, interpreted by `trackingSlots`. The supported window is `YYYY-MM-DD (HH:mm-HH:mm IST)` (an en dash is also accepted). Its date must exactly equal the selected service date. A preferred slot, reference, receipt or confirmation alone never establishes scheduling. Relative dates are rejected for new dispatch updates.
4. Independent household verification from an approved request and a `REQUEST_CONFIRMED` leg matching reference, tenant, address, item names, quantities, total-row weights and fee. An uncertain result, mismatched observation, duplicate attestation or unaccounted-for change fails closed. Known dispatcher lifecycle events do not invalidate otherwise matching observations. The attestation is fingerprinted against the current booking.
5. Reviewed coordinates bound to the current address, unexpired provider evidence where applicable, explicit service-duration assumptions, and known positive item weights, quantities and material categories.

Preparation shows only pickups explicitly scheduled for the selected date, including clear exclusions for missing verification or preparation. Generation accepts only fully eligible conversions. Vehicle capacity, material compatibility, windows, reachability and service completion are independently replayed before saving a proposal.

Requested preferences remain unchanged. Assignments and reschedules append events in the same atomic booking write as lifecycle status. Local repositories serialize separate instances/processes with a filesystem lock; stale dispatcher edits use an expected update timestamp. Terminal pickups cannot be resurrected. Failed publication never falls back to a non-atomic copy. An unreadable booking store fails closed. HTTP mutation failures return failure responses, rather than reporting partially saved success.

Booking, window, fee, load, address, coordinate, configuration or verification changes invalidate affected saved proposals through the existing source fingerprints. Invalidation is conservative at tenant level. Saved files remain immutable; expiry remains active and timestamps are not refreshed to make historical proposals current.

| Concern | Source |
|---|---|
| Candidate conversion and fingerprints | `apps/portals/src/lib/geospatial/contracts.ts` |
| Exact service date/window | `apps/portals/src/lib/geospatial/windows.ts` |
| Requested versus dispatcher-assigned slot | `apps/portals/src/lib/tracking-slots.ts` |
| Independent evidence bridge | `apps/portals/src/lib/geospatial/verification-bridge.ts` |
| Authoritative previews, generation and freshness | `apps/portals/src/lib/geospatial/service.ts` |
| Atomic local booking/history persistence | `apps/portals/src/lib/repository/file-repository.ts` |
| Authenticated scheduling and cancellation | `apps/portals/src/app/api/admin/route.ts` |
| Runtime tenant authorization | `apps/portals/src/lib/geospatial/authorization.server.ts` |
| Readable tracking labels and verifier parity | `apps/portals/src/lib/status-presentation.ts`, `apps/worker/src/verifier/verifier.ts` |

For a non-demo local integration, point `ROUTING_HOUSEHOLD_EVIDENCE_DIR` at the household repository's actual `requests` directory, and `STORAGE_DIR` at the portal booking store. The routing bridge reads authoritative persisted household records; it does not require copying verification flags into bookings. Keep routing storage separate. Existing local-only runtime and provider authorization gates still apply.

## Executed traces

`scheduling-integration.test.ts` executes persisted creation → confirmation/verification → scheduling → incomplete preparation → completed preparation → generation and independent route validation → rescheduling → cancellation → collection → reload, with cross-tenant denial. Separate tests reject forged windows and wrong dates, serialize two repository instances, reject a concurrent stale update and inject a failed disk publication without changing persisted status/history.

`local-browser-flow.test.ts` additionally executed a real independent local Chromium tracking read. A fictional booking was created through the supported local repository, not through an external provider. The actual verifier observed the readable tracking UI, matched reference/items/weight/fee, used a distinct session, and left the pickup absent before scheduling. Explicit simulated dispatcher scheduling plus preparation then enabled an independently validated proposal. The test cancelled its booking afterwards. This is local browser evidence, not a claim of production booking or production verification.

Existing booking/approval regressions continue to check fees, approval hashes, duplicate submission protection, independent sessions and requested-not-collected behavior. The human CAPTCHA and fixture-policy booking restrictions were preserved.

## Shared interface

`packages/ui/theme.css` supplies the approved routing palette, typeface, borders, card radii, buttons, badges, form controls, focus treatment and responsive spacing. Both application layouts import it. Existing audience-specific layouts and functionality remain in place.

Covered screens: household dashboard, intake, recycler comparison, approval/decline, request details, source evidence, verification and tracking; Deccan, PaperPlus and QuickScrap home/policy/request/tracking screens; operator scheduling/cancellation; routing overview, Preparation, Fleet & depots and Saved proposals. Readable booking labels retain canonical verifier behavior. Historical proposals say “Needs recalculation”; unresolved coordinate evidence says “Coordinate review needed”. Technical event codes remain available in expandable details.

## Isolated demo

From this worktree, with dependencies installed and packages built:

```powershell
npm.cmd run build:household
$env:RECIRCUIT_DEMO_ROOT = Join-Path (Get-Location) '.data\fictional-demo'
node scripts/seed-scheduling-demo.mjs
$env:ADMIN_TOKEN = 'choose-a-local-demo-token'
node scripts/start-scheduling-demo.mjs
```

The already prepared review dataset is the sibling directory `../fictional-demo-ready`. Set `RECIRCUIT_DEMO_ROOT` to its absolute path to reuse it without reseeding. Its service date is 24 October 2026; it is never silently advanced. The demonstrated seed rerun left all 84 JSON files unchanged.

- Deccan: `http://127.0.0.1:3260`
- PaperPlus: `http://127.0.0.1:3261`
- QuickScrap: `http://127.0.0.1:3262`
- Household samples: `http://127.0.0.1:3263/api/demo-session`
- Operator scheduling: `/admin`; routing pages: `/admin/routing?date=2026-10-24` on each recycler origin. Enter the chosen local token where requested.

Each recycler has twelve deterministic scenario positions, readable fictional households, public test locations and a fictional vehicle. Scenarios cover request-only, verified but awaiting scheduling, scheduled, missing preparation, rescheduled, cancelled, collected, a multi-stop route, and capacity/material/window exclusions. References come from the supported local repository with stable logical idempotency keys. Each recycler starts with two immutable proposal versions: the first needs recalculation after the fleet revision, and the second remains current only while its actual inputs and evidence remain current. Matrix costs are explicitly simulated and expire 24 hours after the initial manifest timestamp.

The seed refuses a nonempty unmarked destination. Repeat runs reuse existing records and do not reset timestamps, overwrite user records or rewrite proposals. The launcher starts all four applications with an environment allowlist, separate local stores, no inherited provider credentials, external routing disabled and a persistent “Demo workspace — fictional records” banner. Demo verification evidence is explicitly marked simulated; the ordinary verification bridge rejects it. Fixture-policy household samples remain unable to initiate live bookings. The local-only demo session endpoint cannot operate in production.

Public-provider scenarios are separate from this fixture demo. Their existing restrictions and previously recorded evidence remain unchanged. No provider calls are made by seed or navigation.

## Validation evidence

All evidence is under the sibling `../` integration directory. Existing before screenshots are reused from `.data/ui-audit-20261023/evidence/before` in the original workspace; existing routing reference screenshots remain under `.data/routing-navigation-20261024/evidence`.

- `tests-committed.log`: full suite after verifier compatibility and preparation updates: **566 passed**, 6 opt-in tests skipped. Demo seeding and the actual local browser trace were separately executed successfully.
- `lint-committed.log`, `types-committed.log`: full lint and typecheck passed.
- `build-portals-committed.log`, `build-household-committed.log`: both production builds passed, including the local-only demo-session endpoint. Existing framework deprecation/cache warnings are retained in the logs.
- `completion-final.log`: all three scheduling integration checks passed after strengthening the collection case to prove it was eligible before collection; `lint-last-followup.log` checks the final wording/test follow-up.
- `actual-browser-flow.log` and `fictional-demo-final/browser-flow-evidence`: actual independent local browser trace and proposal validation.
- `atomicity-check.log`: concurrency and failed-write checks.
- `demo-idempotency.json`: hashes proving repeat seed did not change stored data.
- `screenshots-release`: viewport audit at 1366×768, 1440×900, 1920×1080, 390px mobile and 768px tablet. All 33 screens were checked with no page overflow or automated WCAG A/AA findings; one development reload interrupted the comparison capture, successfully repeated in `screenshots-comparison-recheck`. Compact preparation was successfully rechecked for all three tenants in `screenshots-preparation-recheck`.
- `native-zoom`: actual `chrome.tabs.setZoom/getZoom` 200% checks across all 33 audited screens, with no page overflow. `native-zoom-preparation-recheck` verifies the final compact preparation layout for all three tenants.
- `fault-screens`: deliberately injected loading/error screens, plus keyboard focus traces. `fault-screens-recheck` contains the successful invalid-token check after a development-server navigation timeout. These are explicitly controlled UI fault fixtures.
- Earlier screenshot runs and their findings remain preserved. Initial household loading captures were not counted as settled-page verification. Contrast and semantic findings were corrected and rechecked; retained failure logs were not rewritten.

## Hosted release remains gated

No production records, external bookings, paid providers, deployments, pushes, shared migrations or videos were changed. Existing routing runtime remains local-only. Hosted scheduling requires a reviewed transactional compare-and-set RPC (including lifecycle guards and history), shared storage/coordination verification, deployment credentials and tenant isolation review. The Supabase adapter rejects optimistic dispatch updates until that transactional path exists; it does not silently claim equivalent concurrency guarantees. Provider keys, account restrictions, quota authorization and hosted origin gates must be fulfilled through the existing release-blocker process. This local integration is not a hosted release approval.

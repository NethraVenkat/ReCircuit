# Expanded local workspace

The workspace now has 54 request scenarios and 48 linked recycler bookings, with search, status filters and pagination. Ordinary names and headings contain no synthetic identifiers. A discreet **About this workspace** link replaces the yellow banner and explains sample identities, simulated operations and travel calculations. Record provenance remains available in operator/tracking details, household evidence and stored JSON.

Changes are on `presentation/rich-workspace-20261024`, based on `7e69ed0bb287aeccc0fe235fe5531d9947796328`, in the existing `.data/scheduling-integration-20261024/worktree`. Exact final HEAD and status are recorded in `.data/rich-workspace-20261024/final-state.json` from the original workspace root.

## Population and reconciliation

| Recycler | Requests | Bookings | Received | Confirmed, awaiting scheduling | Scheduled | Cancelled | Completed |
|---|---:|---:|---:|---:|---:|---:|---:|
| Deccan | 18 | 16 | 1 | 2 | 11 | 1 | 1 |
| PaperPlus | 18 | 16 | 1 | 2 | 11 | 1 | 1 |
| QuickScrap | 18 | 16 | 1 | 2 | 11 | 1 | 1 |

Each recycler also has one request awaiting approval and one declined request, neither with a booking. Scheduled counts include one rescheduled pickup on the following date. Completion is the stored `WEIGHED` scenario after a simulated collection event.

For 24 October 2026, each tenant has ten explicitly scheduled preparation records. One needs coordinate/service preparation; nine can be calculated. The validated proposal serves six pickups across two vehicles. Three remain unassigned: a 120 kg indivisible pickup exceeding each vehicle's capacity; an accepted material outside the configured fleet's capabilities; and a dispatcher window ending before vehicle operating hours. No rejected recycler material is used to manufacture a routing exclusion.

Stored fee sums are ₹1,620 for Deccan, ₹0 for PaperPlus and ₹800 for QuickScrap. These are sample configured pickup charges, **not revenue or payments**. Quantities and weights reconcile between household requests and portal records. Weights are total-row planning loads, not measured collection totals.

## Launch and seed

The prepared dataset is separate from all previous datasets:

`C:\Users\Manish\Downloads\ReCircuit-Local\.data\rich-workspace-20261024\workspace`

From the current integration worktree:

```powershell
$env:RECIRCUIT_DEMO_ROOT = [IO.Path]::GetFullPath('..\..\rich-workspace-20261024\workspace')
$env:RECIRCUIT_WORKSPACE_BASE_PORT = '3360'
# Optional repeat seed: validates existing records without resetting them.
node scripts/seed-expanded-workspace.mjs
$env:ADMIN_TOKEN = 'choose-a-local-review-token'
node scripts/start-scheduling-demo.mjs
```

The current review instance is already running on these loopback URLs. A fresh launch refuses occupied ports. Choose the local token before starting a fresh instance; no user/provider credentials are required.

- Household samples: `http://127.0.0.1:3363/api/demo-session`
- Deccan operator: `http://127.0.0.1:3360/admin`
- PaperPlus operator: `http://127.0.0.1:3361/admin`
- QuickScrap operator: `http://127.0.0.1:3362/admin`
- Each recycler's routing: `/admin/routing?date=2026-10-24`
- Workspace explanation: `/about-workspace` on all four origins.

The seed uses stable scenario keys and household IDs, supported booking-reference allocation, existing local repositories, dispatcher updates and routing services. It refuses nonempty unmarked destinations and refuses to upgrade an older dataset in place. Repeated seeding left **all 149 JSON files unchanged**, including booking history and saved proposals. Original preferences and history remain intact. The original manifest date and calculation expiry are never advanced automatically.

To create another independent dataset, set `RECIRCUIT_DEMO_ROOT` to a new empty absolute directory. The original seed entry point and earlier datasets remain available separately. Node 24 and the existing installed/built workspace packages are required, as declared by the repository.

## Meaning of the data

- Fees and acceptance use the actual implemented `pickupFee`, `validateBookingSubmission` and `RECYCLER_CONFIGS` rules. Policy evidence is marked as configuration/fixture evidence, not live extraction.
- Names, contacts, requests, bookings, dispatcher actions, verification and completion scenarios are samples. Contacts are safe placeholder values, not scraped personal data. All seeded booking events and verification records retain simulated provenance.
- Coordinates are the repository's preconfigured public-site test markers, not private residential addresses or newly retrieved geocoding evidence. Do not interpret them as validated household entrances.
- Matrix distances/times are simulated fixture calculations, explicitly labelled in the provider/approximation metadata and About page. No actual external-provider road results, completed driving, fuel use or environmental savings are claimed.
- Independent **route replay validation** is actually executed. Simulated **booking verification** remains explicitly marked and is rejected by the ordinary verification bridge. Only the guarded isolated workspace permits it.
- Two vehicles per recycler have distinct public-location start/return depots, explicit materials, 65 kg capacity, zero initial load, 10:00–17:00 operating hours and explicit service-duration assumptions.

Each recycler has two saved proposal versions. Version 1 needs recalculation after the fleet revision. Version 2 was current when verified and remains current only while source fingerprints and its original 24-hour matrix validity permit. No expiry is hidden or refreshed by navigation or seeding.

## Preserved behavior and focused fixes

Only active bookings with dispatcher-confirmed dated windows enter date-scoped Preparation. Approval, reference, `RECEIVED` or requested preference alone cannot do so. Existing independent-verification, preparation, tenant and freshness guards remain active. Cross-tenant proposal access is denied.

The household API reads current sample booking status from the isolated tenant booking store; operator changes therefore do not leave a stale scheduled status on a household card. This is a read-only sample projection and does not rewrite approval, verification or historical evidence. Production handling is unchanged and the projection is disabled there.

The token input waits for routing readiness, preventing pre-hydration input loss. The launcher authorizes only its exact loopback application origins for mutations, retaining token, host and origin checks. No provider/account restrictions were changed. Existing public-provider paths remain separate and disabled for this dataset.

## Executed checks and screenshots

Evidence is under `.data/rich-workspace-20261024` in the original workspace:

- `tests-final.log`: **131 affected tests passed**, including booking fees, lifecycle/date eligibility, independent verification, cross-tenant denial, proposal invalidation, About presentation and current household status projection.
- `reconciliation.json` / `reconciliation.log`: 54 requests, 48 bookings; fees, quantities and statuses matched; 149 JSON files unchanged on repeat seed. The opt-in rich seed test also validates acceptance and exact capacity/material/window exclusions.
- `http-check.json`: all three tenants expose ten dated preparation records, nine calculation candidates and a valid six-stop/two-vehicle proposal; idempotent generation adds no history. Unauthenticated requests return 401, foreign origins 403, cross-tenant proposal lookup 404. Each tenant's freshness results were `[false, true]`.
- `screenshots-review`: **14 populated screens at 1366×768, 1440×900, 1920×1080, 390×844 and 768×1024**; no page overflow or automated WCAG A/AA findings. Includes household review/decline/tracking, About, each operator, each routing overview, Preparation, fleet and proposal history. Audit transport blocked local `localhost` alias background requests; no external provider origin was used.
- `keyboard/results.json`: routing unlock with Enter, About navigation with Enter, keyboard search/provenance expansion and household evidence drawer Escape behavior passed. Screenshots include expanded provenance.
- `screenshots-household-final` repeats the household list at all five sizes after the final wording adjustment; it also has no overflow or automated accessibility findings. `build-household-release.log` verifies that exact final source.
- `preservation.json`: **84 historical dataset JSON files still match the previous task's SHA-256 manifest**. Existing evidence and videos were not replaced.
- `lint-verified.log`, `types-verified.log` and final app build logs record the final code checks. Initial lint warnings and interrupted audit runs are retained separately; the successful rerun uses the fixed filter label and readiness handling.

No unrelated full audit or live-provider refresh was run. No push, deployment, production booking or shared migration occurred.

## Working-tree and operational limits

The four pre-existing Next-generated metadata edits were preserved before work in `preserved-edits/`. Running the new local servers adds their generated type-directory entries; these metadata files are excluded from attributable commits. The original main checkout's submission-document edit and branch remain untouched.

This is a local sample workspace. Existing hosted-release requirements still apply, including transactional shared scheduling/CAS, durable coordination, tenant isolation and provider/account authorization. The dataset does not turn fixture approval examples into executable live bookings. When calculation evidence expires, use the explicit planning action as appropriate; never alter timestamps to make history current.

# ReCircuit geospatial routing — actual local results

**Local synthetic workflow verified; live customer/provider integration remains unverified.** Separately, the HeiGIT directed-matrix and geometry adapter was VERIFIED LIVE using public documentation locations. MapTiler browser rendering and provider-account origin enforcement remain BLOCKED. Nothing was deployed.

Branch: `feature/geospatial-pickup-routing`. Worktree: `C:\Users\Manish\Downloads\ReCircuit-Local\.data\geospatial-20261023\worktree`. Starting release: `78faed277c13c4bedc121645386ffea3dd74963c`. Foundation checkpoint `5ad7cb1`; workspace/service checkpoint `0f46106`. Final documentation/polish commit is the commit containing this report; the exact final HEAD and worktree status are recorded in `C:\Users\Manish\Downloads\ReCircuit-Local\.data\geospatial-20261023\evidence\final-state.json` after commit.

## Implemented paths and behaviour

- `apps/portals/src/lib/geospatial/contracts.ts`: validated Pickup, Vehicle, Geocode, Matrix, Calculation and persisted RouteProposal models, units, fingerprints and pure conversion.
- `optimizer.ts` / `validator.ts`: multi-vehicle capacity/material/depot/window-aware bounded optimizer, complete small-instance exhaustive oracle, independent schedule/load/conservation/total replay, same-scope baseline comparison.
- `providers.ts` / `heigit.server.ts`: closed synthetic providers, private allowlisted OSRM adapter, current fixed-origin HeiGIT adapter, bounded request/element accounting, explicit unreachable/error handling and geometry.
- `verification-bridge.ts` / `windows.ts`: approved household/request-confirmed leg, independent observed-item/fee/address checks, stale-source refusal and strict actual dispatcher slot parsing. Requested slot remains a preference.
- `service.ts` / `runtime.server.ts` / `authorization.server.ts`: tenant-authorized preview, manual coordinate review, versioned fleet/depot settings, idempotent generation, source-change checks, exclusive local proposal history and revalidated reload. Server-only credentials and exact-origin routing protection.
- `/api/routing`, `/admin/routing`, `RoutingFleetEditor.tsx`: actual operator workspace, explicit generation, structured fleet and coordinate controls, readable estimates, numbered map/list, missing-data/error/loading/stale states, history and transparent comparison.
- `scripts/start-routing-preview.mjs`: verified loopback port 3200 launcher; selective ignored-env loading, isolated local sources, no browser provider key exposure. Existing operator console links to routing; existing household UI is unchanged.

## Numerical trace through every boundary

Actual saved proposal `1adbb9e0-25ab-42a8-976a-4840a0b5bb5f`; correlation `cc346f19-bcaf-4308-9906-84a1257e0eb2`; input fingerprint `cecd99d64befd30ddd9c43386bb12767c9176ce8690a46e7509e1ef7273efaec`. Full immutable input and result are retained in the isolated planning store referenced by `application-data-path.txt`; no customer contact data is in the proposal snapshot.

Four existing **synthetic** bookings were read through server authorization. Each had four battery units at **0.5 kg total row weight**, matching independent approved-household evidence. Conversion produced four stable pickups at 0.5 kg each; coordinates were explicitly reviewed, service duration explicitly assumed at 60 seconds with a source/version, and the planning vehicle/depot form saved a 10 kg capacity, zero-initial-load vehicle. No requested window was converted into confirmation.

The directed matrix used five ordered nodes including the start/return depot. The chosen sequence has four forward edges of 130 m / 13 s and a return edge of 470 m / 47 s: **990 m and 99 travel seconds**. Four services contribute 240 s; waiting is 0; total is **339 s**. Cumulative pickup load is 0.5 → 1 → 1.5 → **2 kg**. Independent replay matched every stop and total, then schema-validated immutable persistence survived authorized API read and UI reload. The equal-input baseline is also 990 m: **0 m / 0% planned improvement**, not invented savings. No fuel/emissions factor was invented.

Same-key generation returned the same proposal, without adding another version. Changing a planning assumption made the old proposal stale while preserving its bytes. Actual source-booking SHA256 before and after routing was `50af6d2d00fe3d144324fc8f4473b56f5ba2db51e021c20e1cea003d815014f9`. This proves the seeded booking file, including approval-related source evidence, booking references, fees, requested/assigned fields and collection statuses, was unchanged by these routing actions. Historical production bookings were neither altered nor used as synthetic data.

## Executed checks

- Baseline: shared package compile exit 0, repository lint exit 0, four test files / 91 tests exit 0.
- Final affected regressions: **24 files / 354 tests passed**, exit 0 (`versioned-fleet-regressions.log`). Two non-default seed/live tests were skipped in that ordinary suite and were executed separately when explicitly enabled; no skipped live test is claimed as a live pass.
- Portal typecheck exit 0 (`versioned-fleet-typecheck.log`); repository lint exit 0 (`versioned-fleet-lint.log`); affected portal production build exit 0 (`versioned-fleet-build.log`, and final visual polish build). No household source changed, so a new household build was not needed. Existing household/core approval, expiry, routing, tracking and provider safeguards were included in regressions.
- Real application browser audit exit 0 (`versioned-fleet-browser.log`): authorization, structured fleet form, conversion/review, matrix/optimization/independent validation, persistence/API/UI/reload, idempotency, stale history and byte-identical booking source.
- Supplemental UI audit exit 0 (`release-ui-failure-states.log`): clearly labelled API-response fixtures for otherwise hard-to-hold empty, ambiguous, disabled, long-text and pending states. These are UI inspections, not actual live provider failures.
- Every accepted UI state has captures at 1366×768, 1440×900, 1920×1080, 390×844 and 768×1024, plus 200% reflow at 683/720/960 CSS px. Effective widths were asserted in the main harness; native browser-menu zoom itself was not operated. No page overflow or detected WCAG A/AA axe violations in the accepted captures. Keyboard reachability/focus and reduced-motion emulation were checked; this is not a complete accessibility conformance claim.
- Secret/preservation scan: no actual HeiGIT/MapTiler credential bytes in source, built client assets or saved evidence; env is ignored/untracked. Original user report and 04:00 / 02:56 MP4 hashes matched preserved values. Existing raw footage, interrupted runs, historical policy quotes and booking evidence were not overwritten.

Raw commands, exits, durations and initial failures are append-only in `execution.jsonl`. Initial failures retained include the CR-only env parser (zero API calls), unused import/FormData/constant-loop lint findings, a real Next internal-host/origin mismatch, and a browser harness race that correctly encountered the busy guard during an unfinished fleet save. Fixes and successful reruns are separate logs. No failed result was deleted or renamed a pass.

## Failure and security audit reconciliation

| Required case | Identifiable executed evidence |
|---|---|
| Missing weight/capacity/duration | Conversion and failure-contract tests reject missing/NaN fields; initial real preparation screenshot shows exclusions |
| Ambiguous address | Ambiguous Geocode conversion rejection + labelled ambiguous-coordinate UI fixture |
| Cross-tenant booking/vehicle | Conversion, service source/vehicle tests, unauthorized API and object-ID read tests |
| Provider disabled | Provider refusal tests + provider-disabled UI fixture; no fabricated zero-cost fallback |
| Rate limit/timeout | Two-attempt private provider bound, HeiGIT no-auto-retry 429/timeout tests; no success snapshot |
| Partial/unreachable matrix | Dimension/unit/fallback/null-edge tests; unreachable return depot cannot be served |
| Capacity overflow | Independent replay rejects corruption; multi-vehicle, full initial load and material exclusions tested |
| Impossible confirmed window | Completion-window test, hand schedule and strict overnight/date parser |
| Booking changes during generation | Delayed provider test changes source, rejects save, persists no proposal |
| Coordinate/vehicle/assumption changes | Source fingerprints and settings version tests; actual UI stale-after-assumption-change read |
| Repeated generation | Actual API idempotency + reload test; simultaneous generation returns busy |
| Map unavailable | Entire real UI runs with MapTiler disabled; geometry failure preserves independently validated list; material geometry mismatch disclosed |
| No eligible pickups | Service refuses generation + disabled action in no-eligible-pickups UI fixture |
| Incomparable baseline | Equal-scope requirement, negative signed delta and zero denominator tests |
| Feature disabled | Actual exported API-handler test returns 503 before source read; labelled disabled UI fixture |

TC1–TC4 preservation was checked through existing portal, core and household regression tests and unchanged synthetic booking bytes, **not a new hosted booking run**. Laptop acceptance and fees, paper/battery separation, explicit over-cap approval, decline badges and requested-versus-collected semantics remain separate from routing. Independent booking verification remains authoritative; routing cannot mint it.

## UI states and screenshots

| State | Execution kind | Outcome |
|---|---|---|
| initial-no-data | Actual local application | 0 page overflow; no detected axe A/AA violations |
| preparation-before-updates | Actual local application | 0 page overflow; no detected axe A/AA violations |
| ready-for-explicit-generation | Actual local application | 0 page overflow; no detected axe A/AA violations |
| current-proposal-map-independent | Actual local application | 0 page overflow; no detected axe A/AA violations |
| reload-restored-proposal | Actual local application | 0 page overflow; no detected axe A/AA violations |
| stale-proposal-after-assumption-change | Actual local application | 0 page overflow; no detected axe A/AA violations |
| unauthorized-error-summary | Actual local application | 0 page overflow; no detected axe A/AA violations |
| no-eligible-pickups | UI-only response fixture | 0 page overflow; no detected axe A/AA violations |
| ambiguous-coordinate | UI-only response fixture | 0 page overflow; no detected axe A/AA violations |
| feature-disabled | UI-only response fixture | 0 page overflow; no detected axe A/AA violations |
| provider-disabled | UI-only response fixture | 0 page overflow; no detected axe A/AA violations |
| long-reference-address | UI-only response fixture | 0 page overflow; no detected axe A/AA violations |
| loading | UI-only response fixture | 0 page overflow; no detected axe A/AA violations |

Actual application screenshots: `C:\Users\Manish\Downloads\ReCircuit-Local\.data\geospatial-20261023\evidence\browser-1792782744362`. Supplemental screenshots: `C:\Users\Manish\Downloads\ReCircuit-Local\.data\geospatial-20261023\evidence\browser-states-1792781862648`. Curated copies:

- [1366 desktop](screenshots/proposal-1366x768.png), [1440 desktop](screenshots/proposal-1440x900.png), [1920 desktop](screenshots/proposal-1920x1080.png)
- [390 mobile](screenshots/proposal-390x844.png), [200% reflow](screenshots/proposal-1366-200percent-reflow.png)
- [Stale proposal](screenshots/stale-1440x900.png), [Provider-disabled UI fixture](screenshots/provider-disabled-1440x900.png)

## Bounded synthetic benchmarks

Single-process observed samples from `benchmark-1792781220000.json`; not production latency promises. Heap deltas are noisy and can be negative due to garbage collection. Exact enumeration ceiling is seven stops / one vehicle; all candidate evaluations are capped at 20000. A heuristic failure is not proof of infeasibility.

| Synthetic stops | Runtime ms | Evaluations | Served | Planned m | Guarantee |
|---|---|---|---|---|---|
| 1 | 15.618 | 5 | 1 | 300 | proven-optimum |
| 4 | 1.670 | 58 | 4 | 990 | proven-optimum |
| 7 | 26.059 | 5131 | 7 | 1680 | proven-optimum |
| 20 | 10.781 | 830 | 20 | 4670 | heuristic-feasible |
| 50 | 62.666 | 4365 | 50 | 19710 | heuristic-feasible |

## Live status, boundaries and remaining blockers

The current HeiGIT adapter is **IMPLEMENTED** and **VERIFIED LIVE for one public two-node sample**, including asymmetric directed travel and matching road geometry within rounding. It is not live-verified for India/customer addresses, fleet optimization, traffic or dispatch. The full app flow is **EXECUTED and VERIFIED locally with synthetic data**. It is **NOT DEPLOYED**.

MapTiler origin-account configuration and permitted/unpermitted **browser** enforcement are **BLOCKED**: no dashboard session/management access is available. The single metadata request with an unapproved Origin returning 200 is **inconclusive**, not proof about browser enforcement. Keys remain server-side and browser exposure is disabled. Authorized local origins are exactly `http://localhost:3200` and `http://127.0.0.1:3200`; 3200 was actually checked and used. No wildcard or production origin was enabled.

Actual production homepage origins were recovered from preserved release evidence and read-only checked: household `https://recircuit.automconsultancy.in` and portals `https://recircuit-deccan.vercel.app`, `https://recircuit-paperplus.vercel.app`, `https://recircuit-quickscrap.vercel.app` returned HTTP 200. They are reported, **not approved/enabled for MapTiler**; HTTP 200 is not immutable deployment/commit verification. Unrelated previews were not added.

Production routing intentionally remains disabled. Current local file storage is not a shared durable/multi-worker production implementation. Production operator identities, distributed persistence/coordination, provider-compliant private-address storage/retention and customer-data authorization need further reviewed integration before deployment. No shared migrations were applied, no production configuration or records changed, no push/deployment occurred. No driver application, mid-route unloading, arbitrary capacities/units, unsupported emissions model, or all-size optimum is claimed.

The exact rollout prerequisites, quota/element model, environment **names only**, privacy/attribution restrictions, local commands, recovery and rollback are in [OPERATIONS](OPERATIONS.md). [CONTRACTS](CONTRACTS.md) documents all boundary schemas/units/side effects. [STAGES](STAGES.md) records local gate results and explicit blocked checks. The [separate synthetic storyboard](SYNTHETIC-STORYBOARD.md) preserves the existing submission video and contains no invented environmental outcome.

# Routing post-implementation audit — 24 October 2026 IST

**LOCAL VERIFIED for the bounded synthetic, map-independent workspace. NOT READY for production routing.** Six reproduced defects were corrected. All final executed checks pass. Account quota verification, live geocoding and MapTiler browser enforcement/rendering remain blocked or unimplemented as detailed below. No deployment or hosted-readiness claim is made.

## Checkpoint and preservation

Audited implementation: `c432537eeef78704d0618e9b8f7bd41a920718b7`.
Remediation commit: `61161ea848c465ee8d9d5bc4a95c22f4c46284f9`.
Branch: `feature/geospatial-pickup-routing`.
Worktree: `C:\Users\Manish\Downloads\ReCircuit-Local\.data\geospatial-20261023\worktree`.
The final documentation commit and clean status are recorded after commit in `C:\Users\Manish\Downloads\ReCircuit-Local\.data\routing-post-audit\evidence\final-state.json`.

The main branch remains `ui/recircuit-household-redesign` at `78faed277c13c4bedc121645386ffea3dd74963c`, with its pre-existing unstaged submission report edit preserved. No reset, clean, cherry-pick, merge, push or deployment was performed. The existing worktrees and implementation commits remain intact. No applicable nonempty AGENTS.md was found in the repository, affected source paths or inspected ancestor instruction paths; the user-level `.codex/AGENTS.md` was empty.

Raw evidence is separate from all previous runs: `C:\Users\Manish\Downloads\ReCircuit-Local\.data\routing-post-audit\evidence` (abbreviated **E** below). Previous routing reports, failures and screenshots were not overwritten. New synthetic source storage is identified by `E/application-data-path.txt`; existing browser regression storage is separately under `.data/routing-post-audit/e2e-storage` and `e2e-household`.

`E/security-preservation.json` confirms ignored/untracked `.env.local`, both expected credential names present without their values, zero actual credential-byte matches in 369 source files, 33 final built client files and 144 then-current audit artifacts. The existing submission report SHA256 remains `48e8820075f065c136f16158b0c8f6244d373623d11f482326fcbf8a1c9f3329`. Both MP4s match their prior hashes, including the original 02:56 submission cut. Source changes are confined to geospatial implementation/tests, audit harness configuration and this new audit documentation. Existing Groq configuration, historical extraction evidence, QuickScrap pricing/quotes and historical DEC-46179/DEC-43489 records were not edited.

## Executed checks

Every command below is stored with UTC start/end timestamps, exact argv, elapsed wall time and exit in `E/execution.jsonl`. UTC 23 October corresponds to 24 October IST for this audit. Milliseconds below are wrapper measurements, including process startup; they are not invented development-time measurements.

| Check | Actual command inside routing worktree | Exit | Wall ms | Evidence |
|---|---|---:|---:|---|
| Fresh original baseline | `node node_modules/vitest/vitest.mjs run` | 0 | 6679 | baseline-tests.log; 419 passed, 2 opt-in tests skipped |
| Final regressions | `node node_modules/vitest/vitest.mjs run` | 0 | 6593 | release-tests-final.log; **470 passed / 37 files**, 2 opt-in tests skipped |
| Existing browser workflows, routing disabled | `node node_modules/@playwright/test/cli.js test tests/e2e/test-cases-dashboard.spec.ts tests/e2e/item-fidelity-browser.spec.ts tests/e2e/security-deep.spec.ts --output=…/playwright-results` | 0 | 78135 | existing-e2e.log; **17 passed** |
| Real routing browser flow | `node scripts/audit-geospatial.mjs` | 0 | 17889 | browser.log; browser-1792783388973/results.json |
| Supplemental response-fixture UI states | `node scripts/audit-geospatial-states.mjs` | 0 | 11578 | browser-states.log; browser-states-* results.json |
| Actual local API failures/security | `node ../../routing-post-audit/api-audit.mjs` | 0 | 2677 | actual-api.log; api-checks.json; **11 checks** |
| Full repository typecheck | `cmd.exe /d /c npm.cmd run typecheck` | 0 | 7756 | release-typecheck.log |
| Repository lint | `node node_modules/eslint/bin/eslint.js . --ext .ts,.tsx --max-warnings 0` | 0 | 12268 | release-lint-final.log |
| Affected production build | `node node_modules/next/dist/bin/next build apps/portals` | 0 | 14800 | release-build.log; NEXT_DIST_DIR=.next-routing-post-audit-build |
| Credential/preservation check | `node ../../routing-post-audit/preservation.mjs` | 0 | 604 | preservation.log; security-preservation.json |

Build output was isolated from the running browser servers. Next-generated tsconfig additions were copied to `E/generated-portal-tsconfig.json`, verified to be the only configuration changes, then removed. No unrelated configuration was discarded. Household source was unchanged; its existing browser tests and full typecheck ran, while a new household production build was not required by these portal-only fixes.

The seed opt-in test was executed successfully while launching fresh synthetic storage. The opt-in live test stayed skipped and is not counted as a live pass. The final suite contains 51 more passing tests than the fresh 419-test baseline.

## Defects and remediation

| Defect | Severity / impact | Reproduction preserved | Root fix and regression |
|---|---|---|---|
| Provider configuration absent from proposal currency | High correctness: proposals could remain current after changing road provider/profile/configuration | reproductions-refined.log: expected false, received true | Required `MatrixProvider.configurationId`; stable non-secret identities for all adapters; include identity in source fingerprint. post-audit.test.ts |
| Direct write exposed incomplete immutable history | High availability/integrity: simulated partial disk failure left a malformed committed JSON file and broke all history reads | reproductions-refined.log: JSON parse failure after partial write | service.ts writes a unique hidden pending file, flushes, then atomically hard-links without overwrite; pending cleanup; safe retry and duplicate preservation tested |
| Stored proposal inner tenant not bound to owning tenant | High isolation under damaged/imported local storage: a proposal relabelled at the outer record could expose another tenant's input snapshot | reproductions-refined.log with a correctly isolated empty second-tenant source | read rejects inner tenant mismatch before consulting current source; post-audit.test.ts |
| Aggregate weight overflow crashed conversion | Medium availability: individually finite rows summed to Infinity and threw instead of excluding the booking | reproductions-refined.log: non-finite loadKg exception | contracts.ts checks aggregate finiteness and returns LOAD_OR_MATERIAL_UNKNOWN; four batteries / TOTAL ROW 0.5 kg regression remains passing |
| Budget-blocked requests inflated usage counters | Medium evidence accuracy: second matrix counted elements despite no HTTP request; blocked geometry counted a request | accounting-material-reproduction.log: 8 elements vs actual 4 | HeiGIT accounting increments only after the request gate accepts an HTTP attempt; tested matrix and geometry refusals |
| Material-incompatible stops received a generic search reason | Low operator clarity | accounting-material-reproduction.log | optimizer.ts gives specific no-vehicle, incompatible-material and insufficient available-capacity reasons; general search/window failure remains explicitly bounded, not proven infeasibility |

No validation was disabled or failing assertion weakened. One new audit test initially mutated a shared fixture depot object and its matrix node simultaneously; its reproduction was corrected to replace only the vehicle depot. This harness failure is preserved in expanded-contracts.log. The first tenant reproduction was also refined to avoid a source-identity rejection masking the storage issue. The initial typecheck failure was a new test's widened verification literals; parsing with the actual Verification schema corrected it. Both failed and passing logs remain separate. There were no pre-existing failing baseline tests.

## End-to-end reconciliation

Fresh actual-application proposal: `415cf4a8-1344-420b-a56d-f5f29bd712bb`.
Correlation: `ddbf923d-119f-4447-9315-f4171532850c`.
Input fingerprint: `00e64ced7bcfb7c203f710d01e477477c88301947772caef988b472c8861b7cb`.
All immutable proposal bytes remain in the isolated store referenced by `application-data-path.txt`.

1. Header authorization establishes `deccan` server-side. Read four fictional `synthetic-stop-000` … `003` bookings, with approved-household, independent REQUEST_CONFIRMED evidence. No routing action creates or upgrades that evidence.
2. Each booking has quantity 4 and **total row weight 0.5 kg**. Stable pickup IDs and references survive conversion, API response, persistence and reload. Total planned load is **2 kg**, not 8 kg. Operational assignment remains unchanged.
3. Explicit operator review records fictional coordinates, reviewer, coordinate version and 60-second assumption provenance. Fleet form records one 10 kg vehicle, zero initial load, battery compatibility and explicit start/return depot. Requested preference is retained; confirmed window is absent.
4. Five directed matrix nodes include the depot. Four forward edges contribute 4 × 130 m / 13 s; return contributes 470 m / 47 s. Independently reconciled totals are **990 m, 99 travel seconds, 240 service seconds, 0 waiting, 339 total seconds**. Cumulative loads are 0.5, 1, 1.5, 2 kg.
5. Optimizer exact small-instance result and independent replay agree. Schema-validated immutable persistence, authorized response and real UI reload preserve the same proposal ID and input fingerprint. Retrying its key returns the same version.
6. Baseline uses the identical input snapshot, vehicles, depots, matrix and assumptions: 990 m. Planned difference is **0 m / 0%**. Versions are listed separately; no aggregate savings are summed. Fuel/emissions are explicitly unavailable because no factor is configured.
7. Editing an assumption makes the old proposal stale without rewriting it. Fresh actual API tests also prove concurrent generation returns one saved version, with other overlapping requests rejected as busy and the subsequent same-key request returning the persisted version.

Actual source-booking SHA256 before/after every real-browser routing action: `50af6d2d00fe3d144324fc8f4473b56f5ba2db51e021c20e1cea003d815014f9`. `api-checks.json` separately hashes the complete relevant booking JSON before/after each API scenario, including approval-related source fields, fees, references, requested/assigned windows and collection statuses. Its missing-load and impossible-window setup deliberately edits only asserted synthetic records between checks, restores the source afterward, and never treats those setup edits as routing actions. Final source hash matches the original.

## Failure execution and existing safeguards

Actual local APIs exercised wrong-token denial, unknown proposal denial, cross-tenant vehicle refusal, unowned booking review refusal, vehicle count and payload limits, no-vehicle failure, concurrency/idempotency, explicit capacity exclusions, missing-load exclusion and impossible hard-window unassignment. In-process source-change races, unreachable matrices, geometry failure and partial provider responses are executed with controlled service/transport tests. Ambiguous address, loading and disabled-provider screenshots are labelled UI-response fixtures; they do not prove actual live provider failure handling.

| Existing scenario | Actual evidence | Result and limit |
|---|---|---|
| TC1 laptop | test-cases-dashboard browser + item-fidelity real local booking/tracking regression | PASS local: accepted laptop rule outcome and approved 2.5 kg form/storage/independent tracking fidelity |
| TC2 paper versus battery | actual `/test-cases` browser rule execution + core routing tests | PASS local rule isolation; no inference from paper acceptance to batteries |
| TC3 over-cap approval / decline | `/test-cases` execution, security-deep booking refusal and core approval/plan-hash tests; leg-display-status decline tests | PASS covered local rules/guards; no new hosted decline/booking run and no separate new visual decline-page audit |
| TC4 requested/routed is not collected | `/test-cases`, independent tracking/item-fidelity tests, state-machine collection evidence tests, unchanged routing booking bytes | PASS local; routing status remains PROPOSAL_ONLY_NOT_DISPATCH |

Routing was disabled on the separate three-portal/household E2E servers. They operated normally through all 17 selected tests. Stale plan hash, fee/material changes, no approval, duplicate execution, expired evidence, fixture isolation, missing tracking data, wrong quantity/weight/identity and independent verification remain covered. Existing unit tests verify requested versus dispatcher-assigned semantics, current QuickScrap ₹50 fee engine and historical extraction/provider presentation. This is not a new hosted verification of historical records or all household routes.

## Visual and accessibility results

Real `/admin/routing` interactions: token/date read, structured fleet/depot save, coordinate preparation, explicit generation, history/reload, stale state and unauthorized summary. `/api/routing` was inspected through the actual application, not only direct exported handlers. Map-independent ordered stops remain available with no external tiles. The screenshot review inspected the 1440 desktop and 390 mobile images in addition to browser automation across every requested viewport.

**Desktop:** 1366×768, 1440×900, 1920×1080. Seven actual states were captured at each width; no page overflow or page errors. Real cards, prominent explicit action, estimate scope, requested/confirmed distinction and readable stop sequence are present. No detected axe WCAG A/AA violations at the instrumented 1366 width.

**Mobile/tablet:** 390×844 and 768×1024. The same seven states were captured without page overflow; no detected axe WCAG A/AA violations at 390. Mobile is vertically long but controls and text reflow without clipping.

**200%:** reflow checked at 683, 720 and 960 CSS px for the three desktop widths, with effective innerWidth asserted and no overflow. Native browser-menu zoom was not operated. Keyboard focus reachability and reduced-motion media were checked; a full manual keyboard traversal, screen-reader session and comprehensive contrast certification were not performed. Axe's checks are not a claim of full accessibility conformance.

Six supplemental UI-only states cover empty, ambiguous, feature-disabled, provider-disabled, long references/addresses and loading at all eight widths/reflow sizes. Their screenshots and assertions are distinct from the actual seven-state flow.

Representative actual captures in `E/browser-1792783388973`:

- current-proposal-map-independent-1366x768.png
- current-proposal-map-independent-1440x900.png
- current-proposal-map-independent-1920x1080.png
- current-proposal-map-independent-390x844.png
- current-proposal-map-independent-768x1024.png
- current-proposal-map-independent-1366-200percent-reflow.png
- stale-proposal-after-assumption-change-1440x900.png

No existing submission video was replaced. A future routing demonstration would need separate newly captured routing scenes; these synthetic screenshots must not be presented as historical live booking evidence.

## Providers, documented paths and live limits

Official documentation was freshly read during the audit. The [HeiGIT migration table](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912) specifies `/openrouteservice/v2/matrix`, `/openrouteservice/v2/directions`, and the separate `/pelias/v1` geocoding service. Code uses the correct service/version prefix, rather than a blind host substitution. [Coordinate documentation](https://giscience.github.io/openrouteservice/frequently-asked-questions) specifies lon/lat order, which mocked transport assertions verify. The [API landing page](https://api.heigit.org/) identifies Standard-key and account-dashboard entry points; this does not prove this particular account's current plan/remaining quota.

**New live authenticated requests in this audit: 0; matrix elements: 0; geocoding: 0; directions: 0; MapTiler map loads: 0.** Account/session access sufficient to establish current free usage was unavailable, so the task's preflight condition was not satisfied. No billing/upgrade was enabled and no quota-exhaustion tests were attempted. Existing earlier implementation-run matrix/geometry responses were inspected as historical artifacts only; they are not substituted for fresh audit execution. There is no new LIVE PROVIDERS VERIFIED verdict.

The workspace implements manual reviewed coordinates and a closed synthetic geocoder. A HeiGIT/Pelias geocoding adapter is **not implemented**, so valid/ambiguous/low-precision real-provider parsing and live geocoding are not claimed. Reviewed provenance, address-change invalidation, invalid coordinate ranges and no silent fallback are tested. Two numerically valid reversed coordinates cannot be detected automatically by range validation; operators must verify the review location.

[MapTiler documentation](https://docs.maptiler.com/guides/developer/credentials/api-key/) describes Allowed HTTP origins on the browser key. Account settings and permitted/unpermitted browser enforcement remain **BLOCKED**. Local origins stay exactly `http://localhost:3200` and `http://127.0.0.1:3200`; the actual UI ran on loopback 3200. No production origin or wildcard was enabled. A prior HTTP 200 metadata probe is inconclusive. The launcher forces browser exposure off. The page currently renders schematic/available road SVG geometry and ordered stops; it does **not** consume the gated key or implement a MapTiler tile renderer. Configuring account restrictions alone will therefore not complete map integration.

## Measured limits and release verdict

Fresh offline measurements are in the timestamped `E/audit-performance-*.json`; each row records conversion, optimization, independent replay, stop/vehicle counts, served/unassigned, objective, feasibility and zero HTTP/element usage. Samples vary with concurrent work and are not latency promises. Example final sample: 50 stops / 4 vehicles, 21.179 ms conversion, 102.156 ms optimization, 11.333 ms replay, 50 served, 0 unassigned, 19710 planned m, 4365 evaluations. Seven stops / one vehicle: 40.632 ms optimization, 1680 m. Independent enumerators at 1–7 asymmetric stops match optimum with zero objective gap.

Supported solver boundary remains 50 stops / 8 vehicles / 64 matrix nodes / 20000 candidate evaluations. HeiGIT adapter additionally caps 10 nodes and 1–4 HTTP requests per instance (runtime public-only wrapper uses 2). Exact all-served proof is limited to ≤7 stops / one vehicle; larger results remain feasible heuristics. No local search is implemented, so local-search move validation is not applicable. Single load dimension kg only; no arbitrary units or unsupported multidimensional capacity claims.

**LOCAL VERIFIED:** bounded synthetic conversion/review/planning/independent replay/immutable storage/API/UI/reload, existing local workflow regressions and documented estimate scope. The six reproduced local defects are fixed and all required affected checks pass.

**BLOCKED:** fresh live provider smoke tests pending verified free-account quota; MapTiler account restriction settings and actual allowed/disallowed browser tests. No real-provider geocoding or tile-loading verification.

**NOT READY:** unrestricted live/customer or production rollout. Production routing remains intentionally refused by runtime. Shared durable storage, distributed concurrency, stronger individual operator identity/authorization integration, privacy/retention review, a real geocoding adapter and tile renderer require implementation/review and provider verification. Local hard-link publication handles process-interrupted writes but is not a claim of distributed or power-loss durability. No unresolved reproduced authorization or booking-lifecycle defect remains within the verified local scope.

The detailed requirement → source → execution → result matrix is in [AUDIT_REQUIREMENTS.md](AUDIT_REQUIREMENTS.md).

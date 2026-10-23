# Routing implementation and gap closure — 24 October 2026 IST

**IMPLEMENTED and LOCALLY EXECUTED:** explicit geocoding/candidate review, a gated MapTiler raster renderer, immutable preparation provenance, and SQL-backed routing history/coordination. **NOT READY FOR PRODUCTION.** Current provider-account verification, native multi-backend PostgreSQL/PostgREST verification and existing dependency advisories remain release blockers. This report describes tested scope, not a claim that all defects have been eliminated.

## Checkpoints and preserved work

- Verified starting checkpoint: `b1b2109a8e0f364a814d53cf1073205a1b579a7c`, clean routing worktree.
- Routing feature/security checkpoint: `11019971b5400b0764b0fa36d2d8c8db74c8cda8`.
- Household action-readiness checkpoint: `81177587faeb89d0690057e763bd9552c6537310`.
- Final launcher gate correction: `45db42b6c6509f302116987a786c40d89a11559d` (explicit free-quota confirmation forwarding; default remains false; syntax checked).
- Branch: `feature/geospatial-pickup-routing`.
- Worktree: `C:\Users\Manish\Downloads\ReCircuit-Local\.data\geospatial-20261023\worktree`.
- Final documentation HEAD/status: recorded after commit in `C:\Users\Manish\Downloads\ReCircuit-Local\.data\routing-gap-20261024\evidence\final-state.json`.

The main `ui/recircuit-household-redesign` branch remains at `78faed277c13c4bedc121645386ffea3dd74963c`. Its pre-existing submission report edit was preserved, unstaged. Existing routing reports and failed runs remain separate historical artifacts. No release-branch modification, reset, cleanup, history rewrite, push, deployment, shared migration or production booking/record change occurred. Existing DEC-46179/DEC-43489 evidence, Groq configuration, historical extraction provenance and fee quotes were not edited.

No applicable nonempty AGENTS.md was found in the inspected repository/source/ancestor instruction paths; the inspected user-level `.codex/AGENTS.md` was empty. Existing repository conventions guided Next/TypeScript, Supabase-style privileged RPCs, immutable local records, Vitest/Playwright and isolated PGlite verification.

Evidence directory (**E**): `C:\Users\Manish\Downloads\ReCircuit-Local\.data\routing-gap-20261024\evidence`. `execution.jsonl` records actual commands, UTC timestamps, exit results and wall times. These UTC runs occurred on 24 October in Asia/Calcutta. Exact execution tables are generated in [GAP_EXECUTION.md](GAP_EXECUTION.md); boundaries and requirements are in [GAP_REQUIREMENTS.md](GAP_REQUIREMENTS.md).

## Previous gaps versus current execution

| Previously reported gap | What was completed | Current verification limit |
|---|---|---|
| No automatic geocoder | Server-only HeiGIT/Pelias adapter, explicit authorized action, bounded requests/cache, candidate validation, review/corrections, versioned provenance, address/config invalidation | Real transport exhaustively mocked; actual app uses a visibly synthetic closed registry. Fresh live calls blocked by quota preflight. Public-landmark allowlist prevents customer-address transmission |
| No MapTiler renderer | Leaflet raster integration, explicit load, two feature/restriction gates, exact-origin key release, attribution, ordered route overlays, tile-error fallback | Renderer exercised with labelled intercepted tile responses; actual account settings and permitted/unpermitted live browser tests remain blocked. Real key stays withheld |
| Process-local persistence only | Supabase-compatible SQL adapter, transactional additive migration/rollback, database-owned leases, immutable versions, ownership/CAS/idempotency | SQL and disk persistence executed in PGlite, including separate application processes and real Next HTTP/UI. Native PostgreSQL multi-backend and actual PostgREST deployment are not verified |
| Proposal provenance only indirectly recoverable | New proposals embed immutable reviewed-coordinate metadata and settings version, checked against pickup versions/coordinates on read | Old proposals remain readable without invented metadata; new configuration fingerprints safely make historical proposals stale |
| 200% CSS reflow only | Genuine Chromium tab zoom using documented `chrome.tabs.setZoom/getZoom` in a disposable profile | Actual factor 2, doubled devicePixelRatio and measured half-width CSS layout at all three desktop sizes |

## Geocoding implementation

Sources: `apps/portals/src/lib/geospatial/geocoding.ts`, `geocoding.server.ts`, `service.ts`, `runtime.server.ts`, `/api/routing`, and `RoutingGeocodeReview.tsx`.

An authorized operator explicitly chooses **Find coordinate candidates** for an existing owned booking. The caller cannot supply a free-form address, provider URL, tenant or fake verification. The server derives the original address and fingerprint from its source. Production routing stays refused. The HeiGIT pilot allows only its explicitly registered public test location; arbitrary private/customer addresses are refused before fetch. The preview synthetic provider recognizes only four exact fictional source addresses and labels its results `synthetic-registered-geocoder`.

The [official migration table](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912) identifies `https://api.heigit.org/pelias/v1/search`, separate from matrix/directions under `/openrouteservice/v2/`; the [geocoder documentation](https://giscience.github.io/openrouteservice/api-reference/endpoints/geocoder/) identifies Pelias. Credentials use the server Authorization header. The adapter validates GeoJSON Point lon/lat order, finite ranges, response size ≤256 KiB, candidate count ≤5, confidence and precision. It does not swap coordinates or substitute city centres. No match is failure, multiple matches are ambiguous, and even a high-confidence single match requires review. A low-precision locality result is never silently promoted to resolved.

There are no automatic retries. Requests serialize, identical pending requests deduplicate, successful responses have a bounded tenant/address/configuration cache, and an instance has an explicit 1–4 request budget (default 2). Cached retrieval timestamps are retained rather than refreshed. Provider status/body, address and credentials are absent from routine diagnostic errors. 401/403, 429, 5xx, malformed bodies, oversize responses, network errors and timeout/abort are tested with transports; no live error/quota attack was performed.

Candidate selection remains an explicit operator action. Saving review binds booking/address, result ID, candidate ID, provider configuration, retrieval time, reviewer, precision and reviewed coordinate version. Editing the selected coordinate requires a separate correction reason. Original booking addresses remain unchanged. Fresh candidate retrieval invalidates an older coordinate review until review is saved again. Address/provider changes invalidate incompatible review links. Settings and attempts are immutable versions; candidates never create independent booking verification.

## Map implementation and restrictions

Sources: `RoutingMap.tsx`, `authorization.server.ts`, portal layout/CSS, `geometry.ts`, `service.ts` and the map section in `/admin/routing`.

The browser key is released only when **both** `ROUTING_MAP_ENABLED=true` and `MAPTILER_ORIGIN_RESTRICTIONS_VERIFIED=true`, an exact allowed origin matches, and the key exists. The isolated launcher forces restrictions unverified. Actual UI port was 3200; authorized origins remain exactly `http://localhost:3200` and `http://127.0.0.1:3200`. No production or wildcard origin was enabled.

The renderer loads only after **Load restricted basemap**. It follows [MapTiler's raster XYZ guide](https://docs.maptiler.com/leaflet/examples/raster-tiles-in-leaflet-js/), `streets-v4/256/{z}/{x}/{y}.png`, using Leaflet and visible MapTiler/OpenStreetMap attribution. Raster XYZ intentionally does not require a separate GL style JSON request. Loading, zooming and resizing do not initiate geocoding, directions or route generation. A tile access/quota/error removes the basemap without automatic retry and preserves the ordered stops and labelled schematic.

Directions requests use the proposed vehicle's start depot, ordered pickups and return depot. Returned vertices receive a conservative 350 m snapping/order sanity check; unrelated/reversed geometry is rejected. This is not proof of road-network accuracy. Material matrix/geometry disagreement now uses schematic lines in both renderers. Straight connectors remain explicitly schematic and do not become driving directions. Actual live geometry accuracy is not claimed by an intercepted raster test.

Real key exposure, live style/tile loading and allowed/denied provider browser enforcement are **BLOCKED**. A fresh computer-use inventory found no browser/account surfaces (`apps: [], browsers: []`). No dashboard setting was changed. A prior HTTP 200 metadata probe remains inconclusive and was not repeated.

## Shared persistence and concurrency

Sources: `shared-store.server.ts`, the `RoutingPersistence` interface, `runtime.server.ts`, `supabase/migrations/0007_routing_preparation.sql`, and `supabase/rollback/0007_routing_preparation.sql`.

The migration adds only routing-owned tables/functions. It is transactional and additive; previous application tables/records are untouched. Anonymous/authenticated browser roles have no routing schema/RPC access. Server-established tenants scope all reads and writes. Immutable history keys are tenant/kind/version, with tenant-scoped unique proposal IDs and request keys. SQL checks tenant, lease and exact next version inside a transaction; input tenant is bound for proposals. Application schema validation and independent replay remain required before save and on reload.

Every mutation uses a database-owned tenant lease through `routing_lock`, not a process-local lock when using the shared adapter. AsyncLocalStorage carries the lease capability only inside that operation. A stale holder cannot append after losing its exact token. Leases do not expire automatically during external work. A crashed holder remains blocked until an operator stops/reconciles the worker and releases the exact lease. Release/append failures never report an unqualified successful generation; inspect immutable history and retry the original request key.

Actual verification included:

- Migration reapplication and role/RLS/function privilege checks in isolated PGlite.
- Atomic version conflicts, immutable rows, tenant refusal, failed writes and lease recovery.
- Three independent Node application processes against an actual SQL-backed loopback RPC bridge: holder, rejected contender, then a successful later client. Two history versions survived without a lost update.
- Real Next application APIs and the full browser vertical slice against **disk-backed** PGlite through a Supabase-compatible loopback bridge. After closing and reopening the database, **29 rows** matched the retained snapshot: 24 settings versions and 5 proposal versions. Evidence: `shared-application-sql.json`; source location: `shared-data-path.txt`.
- Non-destructive rollback revoking server RPC execute permissions, preserving all history, followed by successful migration reapplication.

The bridge executed real SQL; it was not an in-memory repository mock. It was also **not actual PostgREST**, and PGlite uses a single embedded backend. Cross-process application coordination is locally executed, while native multi-backend PostgreSQL isolation/network/failover behavior remains unverified. No `postgres`, `psql` or `docker` executable was found on PATH during this task. No external database was contacted.

Runtime activation is limited to explicit `supabase-local-test`, a loopback HTTP origin and a test-mode flag. The launcher supplies only a synthetic local role value to that bridge. Production runtime still refuses routing even if the adapter compiles or the migration exists.

## Defects and hardening register

| Finding | Severity / evidence | Correction / executed regression |
|---|---|---|
| Different served ID sets collided when joined with `|` | HIGH correctness; `baseline-scope-reproduction.log` expected false, got true | validator.ts compares JSON-encoded sorted ID arrays; current gap-regressions and full suite pass |
| Buttons appeared usable before client handlers were ready | MEDIUM usability; delayed-JavaScript reproduction failed with enabled SSR buttons; cold dashboard runs also stalled | Household examples page disables actions until hydration; status explains preparation. Delayed-JS and final full 18-test browser run pass |
| Response wait began before action readiness | LOW harness accuracy; cold-run failures retained | Existing dashboard test waits for enabled action before starting the response deadline; all rule assertions retained, diagnostics persisted. Final run passes |
| Removed map left an invalid labelled generic container | LOW accessibility; initial actual map-failure axe result `aria-prohibited-attr` | RoutingMap uses a valid region and hides the failed empty container; eight-state reruns have no detected A/AA violations |
| Visible proposal did not immediately become stale after a fresh source/settings read | MEDIUM correctness; source inspection, not a claimed pre-fix browser reproduction | Workspace load invalidates existing visible currency using returned source fingerprint/expiry; actual browser checks stale heading without manually reloading the history item |
| Unknown provider settings silently selected defaults | HIGH configuration accuracy; source-inspected gap | Explicit provider-value allowlists reject unknown values; runtime configuration tests pass |
| Road overlay could remain visible despite material mismatch | MEDIUM map accuracy; source-inspected hardening | Both renderer paths filter mismatched geometry; order/snap sanity regression rejects reversed/unrelated vertices |
| Preparation provenance was not self-contained in proposal | MEDIUM auditability gap | New immutable preparation snapshot plus linkage validation; altered metadata rejection and actual SQL/browser reload verified |
| Existing dependency advisories | CRITICAL/HIGH/MODERATE; npm audit exit 1 | Compatible `zod-to-json-schema` 3.24.0→3.25.2 update removed one high advisory. **13 remain: 3 critical, 4 high, 6 moderate.** Major framework/test/AI dependency upgrades were not forced as an unrelated repository migration |

The six earlier fixes remain covered by fresh executed tests: provider freshness, partial-file publication, stored tenant isolation, aggregate weight overflow, provider accounting and material-specific exclusion reasons. No assertions or safeguards were disabled to obtain a pass.

All failed runs remain: initial new-test typing/lint issues, actual map-failure accessibility finding, a reused-fixture harness assumption, the scope-comparison reproduction, cold dashboard failures, and the delayed-JavaScript reproduction. The first source-level hydration guard alone did not make every cold dev run pass; readiness-aware test synchronization and final diagnostic reruns are recorded. Final successful execution is evidence for the tested state, not proof that no cold-runtime issue can recur.

The first two successful API helper invocations reused their aggregate `api-checks.json` filename; command logs for both remain, and the retained aggregate is the SQL-backed invocation. The reusable harness now writes unique summaries, and `final-actual-api` generated a separate successful 11-check result. This output-handling limitation is not hidden or represented as distinct retained raw summaries for those first two passes.

## Actual checks and screenshots

- Fresh starting suite: **470 passed**, exit 0. Final complete suite after compatible dependency update: **503 passed / 42 files**, exit 0. Three opt-in tests skipped in the ordinary suite: seed, live smoke and subprocess client. Seed and subprocess client were executed separately; live smoke was not.
- Final selected existing browser suite: **18 passed**, exit 0, including TC1–TC4 and delayed hydration. Three earlier browser runs failed; see retained logs/contexts rather than treating only the final run as history.
- Actual full Next API audit: **11 checks passed** for both local-file and isolated SQL application storage. Negative HTTP-handler harness additionally exercised corrupt stored totals, streamed overflow and redacted provider/write failures. That harness injected service dependencies; it is distinct from the full Next browser/API execution.
- Repository lint/typecheck: final exits 0. Portal production build and final household production build: exits 0. Generated outputs were isolated; generated tsconfig additions were preserved as evidence and removed only after confirming no other configuration differences.
- Actual browser states: initial workspace, ambiguous geocode pending review, all reviewed, current proposal/fallback, reloaded provenance, mocked tile rendering, mocked tile failure, and immediate visible stale state.
- Desktop: 1366×768, 1440×900, 1920×1080. Mobile/tablet: 390×844, 768×1024. Every accepted state was inspected by the harness at those sizes and three half-width reflow sizes, without page overflow. Axe A/AA checks at 1366 and 390 detected no violations in accepted runs. Four keyboard focus steps recorded visible outlines; forms, radio selection, generation, history and map zoom were exercised. This is not a complete WCAG or screen-reader certification.
- Actual **200% browser zoom**, not only resized viewports: Chromium reported factor 2 and devicePixelRatio 2, with innerWidth 683/720/960 for the three desktop viewports, no overflow. The documented extension API was used only inside a disposable owned test profile; no user browser profile/settings were changed.

Final SQL-backed browser evidence: `E/gap-browser-1792794995476/results.json`. Representative PNGs in that directory:

- `proposal-gated-map-fallback-1366x768.png`, `…-1440x900.png`, `…-1920x1080.png`.
- `ambiguous-geocode-awaiting-review-1440x900.png`.
- `proposal-gated-map-fallback-390x844.png` and `…-768x1024.png`.
- `map-renderer-synthetic-tile-transport-1440x900.png` — intercepted test tiles, **not a live basemap**.
- `map-failure-preserves-stop-list-1440x900.png`.
- `source-read-immediately-invalidates-visible-proposal-1440x900.png`.

Actual zoom captures and measured browser factors: `E/native-zoom-1792795614692`. The previous routing screenshots, submission videos and interrupted runs were not replaced. Any future routing video scene must be separately labelled as a new synthetic/local demonstration until hosted/live verification occurs.

The zoom harness follows the documented [Chrome tabs zoom API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom) and [Playwright isolated-extension workflow](https://playwright.dev/docs/chrome-extensions). It does not infer actual browser zoom from a CSS-only scale.

## Complete trace and analytics reconciliation

Actual SQL-backed proposal **ae474437-5686-4560-b4d4-93432794efb9**, version 5; correlation **6f49f9af-d756-462f-b1c4-a49baeb8cd88**.
Input fingerprint: `3e27fced5705cb1cd5128d2abcfba78a17c39625fadce6c9b2a051615d4fa455`.
Source fingerprint: `32e5584f62dae5ab8f006bb4a372effab6733a4330bd0091fc49ceb37fea84aa`.
Preparation settings version: **23**; all four reviewed coordinate records retain provider/result/reviewer/version links inside the proposal snapshot.

Authorization read four approved-household, independently verified fictional bookings. Explicit geocoding produced labelled synthetic candidates; the first was ambiguous and remained excluded until review. Operator candidate selection/review and a configured 10 kg vehicle produced four stable pickups. Each row has quantity 4 and **TOTAL ROW weight 0.5 kg**, so cumulative load is 0.5→1→1.5→2 kg, not 8 kg.

The five-node directed matrix includes the start/return depot. Four forward edges are 130 m/13 s; return is 470 m/47 s. Independent sums are **990 m, 99 travel s, 240 service s, 0 wait s, 339 total s**. Independent replay passes before SQL save and on read. The same saved ID/provenance survives API/UI reload. Editing the preparation assumption makes the visible saved proposal stale after the next authorized read, preserving its history bytes.

The baseline uses the same pickups, vehicle/depot configuration, matrix and assumptions, also 990 m: **0 m / 0% planned difference**. Zero denominator, signed negative differences, different scopes and delimiter-containing IDs are tested. Versions are not summed as savings. Fuel/emissions remain **unavailable**: no sourced factor/date/geography/scope has been configured, and neither zero emissions nor measured savings is invented. Requested slots remain preferences; dispatcher-confirmed windows constrain completion. Routing remains `PROPOSAL_ONLY_NOT_DISPATCH`.

Every real routing action preserved the full source-booking file hash: `50af6d2d00fe3d144324fc8f4473b56f5ba2db51e021c20e1cea003d815014f9`. Failure test setup changed only asserted synthetic rows between cases and restored original bytes afterward. API snapshots and complete browser hashes prove routing did not change approval-related source evidence, fees, references, assignment, slots or collection status. No production records were loaded into destructive tests.

TC1 laptop acceptance/planning, TC2 paper/battery separation, TC3 over-cap approval/no unapproved booking, and TC4 pre-collection status distinctions passed through existing rule tests and selected real local browser safeguards. Plan binding, duplicate prevention, independent verification, requested/assigned slots, current QuickScrap ₹50 fees and historical extraction/quote presentation remain covered in the fresh full suite. Feature-disabled workflows used separate local storage. This is not a new hosted historical-booking verification or a new visual audit of every household route.

Offline measured benchmarks remain bounded at 50 pickups/8 vehicles/64 nodes/20000 evaluations. Exact all-served proof is only ≤7 pickups/one vehicle; larger solutions are feasible heuristics. Independent asymmetric oracles at 1–7 stops match with zero gap. No local-search implementation exists, so no local-search proof is claimed. Single load dimension kg only. `audit-performance-*.json` records conversion/optimization/replay times, counts, feasibility, objective and zero provider requests/elements; timings are measured samples, not latency promises.

## Live calls, preservation and release actions

**Fresh live authenticated provider requests: 0.** Geocoding 0; matrix 0 elements; directions 0; MapTiler live tile/style loads 0. Provider documentation and npm registry reads are not live routing smoke tests. Current account free quota could not be confirmed, so the explicit live preflight condition was not satisfied. No billing or upgrade was enabled. There is **no new LIVE VERIFIED provider verdict**. Earlier successful matrix/geometry artifacts remain historical evidence only.

Key values were read only locally for credential-byte scans, without printing them. `.env.local` is ignored and untracked. Final scans include changed/tracked source, both built client bundles and saved evidence; zero actual key matches. The original report SHA256 and 04:00/02:56 video hashes matched their preserved values. No actual HeiGIT key entered a client path; no actual MapTiler key was released to the browser.

Remaining exact actions before any production decision:

1. Inspect the HeiGIT account plan and remaining free quotas. Only then run the minimal allowed public-landmark geocode/matrix/directions smoke using the documented service paths; retain timestamps/counts without headers/keys.
2. Confirm the MapTiler account's free plan and available quota. Following the [official key guide](https://docs.maptiler.com/guides/developer/credentials/api-key/), use **API keys → Edit** to configure Allowed HTTP origins for the two authorized local origins in the provider-supported format. Retain redacted setting evidence. Test an allowed and denied browser origin with real tile requests; do not infer enforcement from one metadata 200 or assume provider port granularity. Keep both application gates off until verified. No production domain/wildcard is authorized by this work.
3. Run migration 0007, shared adapter and independent-client concurrency/failure tests against isolated native PostgreSQL and real PostgREST/Supabase local infrastructure. Verify grants, JSON RPC behavior, durability/lease reconciliation and backup/restore. Current PGlite/bridge results do not substitute for that gate.
4. Review individual operator identity/authorization, customer-address provider consent/retention and production source integration. Public-test allowlists and production runtime refusal stay in place until separately reviewed.
5. Resolve the **13 remaining npm advisories**, including critical Next/Vitest-chain findings, through a reviewed major-dependency migration with fresh application builds/regressions. No forced major upgrade was hidden in this feature branch.

Rollback preparation is non-destructive: stop routing workers, reconcile any held lease/history, disable routing/map/external-provider flags, then use the prepared routing-only privilege revocation. Retain history; do not drop tables or bypass an active lease. Reapplying migration 0007 restores the grants after review. These instructions were executed only in isolated SQL tests, never on a shared database.

**Release verdict: IMPLEMENTED / LOCALLY EXECUTED for the tested local feature; BLOCKED for account/live and native production-infrastructure verification; NOT READY FOR PRODUCTION.** No push, deployment, paid provider use, production mutation or video replacement occurred.

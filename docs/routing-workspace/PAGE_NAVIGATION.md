# Routing page navigation — 24 October 2026

The previous anchor sidebar is replaced with real Next.js pages. Each route renders its own useful content inside a shared ReCircuit layout, rather than repeating the entire workspace. Existing map, diagram fallback, ordered stops, provider restrictions and operational safeguards remain.

## Isolated work

- Inspected latest UI branch: `ui/routing-workspace-desktop-20261024`, clean at `fffed52a5dbe983775a968dc6188237c73363979`.
- New branch: `ui/routing-page-navigation-20261024`, created from that exact commit.
- Worktree: `C:\Users\Manish\Downloads\ReCircuit-Local\.data\routing-navigation-20261024\worktree`.
- Final commit and status: [post-commit final-state.json](../../../evidence/final-state.json).
- The root worktree's unrelated resumed submission report remains modified exactly as before. Both the prior UI and remediation worktrees remain at their original commits without tracked changes.

## Pages and local URLs

| Route | Actual content | Local URL |
| --- | --- | --- |
| `/admin/routing` | Current preparation counts, saved distance/resource time, appropriate next action, latest proposal for the selected service date, one map and ordered stops | <http://127.0.0.1:3200/admin/routing?date=2026-10-24> |
| `/admin/routing/preparation` | Eligible/excluded filters, exclusion reasons, candidate provider/state, retrieval/expiry, recorded coordinate review, service assumptions, existing explicit review controls and expandable evidence | <http://127.0.0.1:3200/admin/routing/preparation?date=2026-10-24> |
| `/admin/routing/fleet` | Actual capacity, initial load, compatible categories, operating windows, start/return depots and provenance; existing selection, vehicle form and validated JSON editor | <http://127.0.0.1:3200/admin/routing/fleet?date=2026-10-24> |
| `/admin/routing/proposals` | Actual version metadata, combined search/freshness/service-date filters, stored totals, provider retrieval/expiry and links to owned details | <http://127.0.0.1:3200/admin/routing/proposals?date=2026-10-24> |
| `/admin/routing/proposals/[id]` | Saved map/stops, totals, independent/baseline replay, comparison, service/load assumptions and expandable calculation provenance | Version 2: <http://127.0.0.1:3200/admin/routing/proposals/03637ea0-8c9e-4d59-a008-ab71e8cc9a23?date=2026-10-24> |

Existing version 1 also remains accessible at <http://127.0.0.1:3200/admin/routing/proposals/f2c4e2cd-9b45-469c-9286-85439f62ad51?date=2026-10-24>. Browser interaction directly opened version 2, selected/searched version 1 in history and tested version navigation; it did not separately capture version 1's complete detail page.

The isolated pilot uses the synthetic token `synthetic-public-routing-test-token`. This is not a production credential. Direct visits and refresh show the clear token-entry flow. Reading local records does not generate a route or contact live routing providers. The basemap still requires an explicit Load interactive map action.

## State, authentication and endpoint changes

The shared App Router layout retains authentication only in React memory while routing pages are mounted. Service date travels in the non-secret `date` query parameter. Search and history filters also use explicit non-secret query fields, so Back/Forward restores them. Refresh, a new tab or leaving the layout requires authentication again. Forget token clears the layout's data and credential state. An actual 401 also clears authenticated state. No token is serialized into a URL, cookie, localStorage or sessionStorage.

The server layout remains rendered per request with `dynamic = "force-dynamic"`; SSR and hydration warnings are not suppressed. Sidebar `Link` URLs are distinct pages with pathname-derived active state, including proposal details selecting Saved proposals. The skip link is the only intentional in-page accessibility anchor.

The portal route allowlist now admits only the four named routing paths and UUID detail paths for the existing server-selected recycler. Unknown routing paths remain rejected. Existing cross-recycler public route restrictions were retained and tested.

The existing authorized `GET /api/routing` gained `?view=proposals`. The catalog derives actual metadata from immutable stored versions, reuses the same schema, independent replay, input fingerprint, ownership and freshness validation as individual reads, and invokes no provider. Both catalog and detail endpoints retain header authorization, server-derived tenant, `Cache-Control: no-store` and `Vary: x-admin-token`. Tests verify missing-token 401, cross-tenant detail 404, an empty other-tenant catalog and rejection of corrupt stored evidence. A caller cannot select a tenant in the URL.

All mutations remain the existing explicit review/geocode/vehicles/generate API operations. Ownership, public-location restrictions, verification, expiry, source validation and lifecycle rules were not relaxed. Browser checks submitted no routing POST, created no proposal or booking and refreshed no geocoding/matrix/directions evidence. Offline regression tests use isolated synthetic temporary data.

The display readiness helper observes candidate-backed evidence expiry without rewriting records, and preserves independent manual reviews. Historical plans retain stale labels, stored service dates and clear review actions. A details page for a different workspace date explicitly explains the difference. No savings, capabilities, operational assignment or collection status is inferred.

## Actual verification

| Check | Actual result |
| --- | --- |
| Six focused regression files | 64 tests passed, exit 0 |
| Changed-source lint | exit 0 |
| Portal TypeScript | exit 0; final post-map-fix result is in the execution ledger |
| Affected portal production build | exit 0; final post-map-fix result is in the execution ledger |
| Normal Chrome direct-entry/navigation/layout run | exit 0; five routes, five viewports each |
| Additional form/filter/mobile interaction run | exit 0 |
| Native Chromium 200% zoom | exit 0; five pages × three desktop sizes = 15 cases |
| Local production startup | all five locked page entries HTTP 200; missing-token catalog 401; authenticated production routing remains intentionally blocked by the existing 503 `ROUTING_LOCAL_PREVIEW_ONLY` guard |
| Real MapTiler rendering | PASS on overview and owned proposal details; real PNG imagery, numbered stop, zoom and attribution |
| Tile failure/retry | PASS with actual browser network blocking, auto diagram fallback, ordered list retained and explicit restoration of real tiles |
| No provider requests from normal navigation | PASS after the resize-teardown correction, with the original strict request-count assertion retained |

Normal installed Chrome was run visibly in persistent profiles without incognito or the `--disable-extensions` argument. This is an isolated automation profile, not a claim about the user's unidentified extension profile. No hydration errors appeared in accepted final browser checks. The prior `fdprocessedid` investigation remains closed; no warning suppression or SSR workaround was introduced.

### Desktop results

Every page was actually rendered and captured at **1366×768, 1440×900 and 1920×1080**, with no horizontal page overflow. The overview and detail maps were checked with real tiles; the numbered stop remained inside map bounds after viewport changes. Fleet details use the full card width when a single resource exists. History uses a contained accessible table scroll region when necessary.

### Mobile/tablet results

Every page was captured at **390×844 and 768×1024**, with no horizontal page overflow. Real 390px navigation, correct active links, date changes, Back navigation and in-memory authentication were exercised. The mobile navigation bar and history table scroll within their own regions. The map, fallback and ordered stops stack without removing information.

Native 200% zoom was measured using `chrome.tabs.setZoom/getZoom` in isolated bundled Chromium, with physical CDP viewport screenshots and explicit card/page bounds checks. It was not CSS scaling. Native normal-Chrome 200% automation remains unverified; no result from a different browser is labelled as normal Chrome.

### Changed interactions

Actual checks cover direct entry on each route; wrong-token failure; refresh losing the token but retaining destination/date; sidebar navigation; owned detail links; browser Back/Forward; search, freshness and service-date filters; filter form restoration; useful no-match states; missing proposal 404; Forget token; keyboard review disclosure; field requirements; empty fleet selection disabling save; malformed JSON blocking a POST; visible keyboard focus; and reduced-motion preference.

Empty history matches are exercised using the real stored stale versions and filters. The current dataset has one excluded booking, one planning resource and two historical versions. No fictitious UI rows or mocked tile success were introduced. Current/fresh catalog and expiry-boundary cases are covered by focused synthetic tests, not presented as fresh live evidence.

## Evidence and preserved failures

Evidence root in the original repository: `.data/routing-navigation-20261024/evidence`. Exact commands, exits and timings are in [PAGE_NAVIGATION_EXECUTION.md](PAGE_NAVIGATION_EXECUTION.md). Raw failures and screenshots were preserved.

| Evidence | Relative location under the evidence root |
| --- | --- |
| Accepted direct-entry, auth, Back/Forward and 25 layout captures | `navigation-1792829430043/` |
| Forms, filters, mobile links, date Back/Forward and keyboard checks | `interactions-1792829636073/` |
| Native 200% measurements and screenshots | `zoom-1792829708860/` |
| Five real-map-enabled page captures at every viewport, fallback/retry | `live-pages-1792829945882/` |
| Accepted real-map navigation closure and desktop screenshots | `live-closure-1792830310440/` |
| Locked production SSR HTML and actual guard results | `production-entry-*.html`, `production-start-*.json` |
| Original single-page before image | prior evidence: `.data/routing-workspace-ui-20261024/evidence/desktop-review-1792827597810.png` |

The first browser failure correctly exposed the old middleware route allowlist's 404. Another run began before cold API compilation finished. A screenshot taken before hydration injected Playwright's default caret style and caused a warning; the installed screenshotter source confirms that mutation. Accepted captures wait for ready entry controls and use `caret: "initial"`. No application warning was hidden or suppressed. Both original failure traces remain.

Lint caught unsafe method-interface destructuring types and unguarded FormData stringification; both were corrected. Additional form tests exposed implicit textarea/select labels whose text included their contents; explicit label associations corrected those real form semantics. Their failed traces remain.

The first production smoke used an HTML substring matcher that missed React's text-separator comments; its matcher was corrected to inspect decoded text while preserving locked-entry assertions. Its authenticated-data expectation also exposed the pre-existing unconditional production pilot guard. The accepted smoke checks that exact 503 code as a protective negative result; it does not claim production data access succeeds.

The first live run passed all six functional stages but failed its last screenshot after finding the background page reloaded into the locked entry. Its functional evidence and failure image remain. A smaller follow-up then reproduced an actual extra z15 tile request on leaving the map. Waiting for imagery readiness did not fix it. The map resize observer was corrected to reject detached or zero-size elements during route teardown; the same request-count assertion then passed. No assertion or deadline was weakened. The final live closure uses one tab and keeps production-smoke execution separate.

## Preservation and limitations

Provider account preflight and origin-enforcement evidence were reused, not re-audited. Exact application origins remain `http://localhost:3200` and `http://127.0.0.1:3200`; the already-authorized provider hostname restrictions remain unchanged. The port-3210 inspection server withheld the browser key. The port-3200 pilot reads the ignored root env file without printing values and has no HeiGIT credential or enabled external routing. Only explicit map loads requested real MapTiler imagery; historical real HeiGIT geometry was reused with stale labels. Response events can include cached imagery and are not a billed-request count.

The prior owned preview/browser processes were stopped using their recorded control files; their metadata, screenshots, worktrees and data remain. The current preview uses a separate copy of the twelve historical pilot files. Focused preservation scans verify byte-identical data copies, existing video hashes, the unrelated report hash, unchanged old worktree commits/status and absence of known provider-key bytes from source, static bundles and submitted artifacts. Private browser caches are excluded because the authorized public browser key necessarily travels to MapTiler. No key is tracked or committed.

Remaining limitations: coordinate/matrix evidence is expired and must be refreshed through the existing authorized workflow with explicit review before new calculation. Production routing remains disabled by the original `ROUTING_LOCAL_PREVIEW_ONLY` guard; this task does not enable production. Native normal-Chrome 200% still needs manual confirmation. The old extension injector remains unidentified. Existing React/middleware/module-type warnings remain outside this navigation task. No hosted verification, full security audit, dependency audit, migration, push, deployment, production record change or video replacement occurred.

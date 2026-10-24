# Routing workspace UI polish — 24 October 2026

The routing workspace now has one primary interactive map beside the ordered stop list on desktop. The diagram starts collapsed, opens automatically after tile failure, and closes after an explicit successful retry. The stop list remains rendered in every map state. MapTiler, OpenStreetMap and saved HeiGIT attribution remain visible.

## Isolation and access

- Branch: `ui/routing-workspace-desktop-20261024`.
- Worktree: `C:\Users\Manish\Downloads\ReCircuit-Local\.data\routing-workspace-ui-20261024\worktree`.
- Actual remediation base: `5f7c3f209465c401a7c5599f1c6e3f58dd2970e1`; the original remediation worktree remains clean at that HEAD.
- Final commit and post-commit status are recorded in [final-state.json](../../../evidence/final-state.json), generated after the local commit.
- Running local preview: <http://127.0.0.1:3200/admin/routing>. A normal Chrome window is left open with the live basemap loaded.
- In another tab, the isolated synthetic pilot uses operator token `synthetic-public-routing-test-token`. Read eligible bookings, then choose Load interactive map. This is a synthetic local test credential, not a production credential.

The original owned port-3200 preview process was stopped using its recorded stop-file protocol. Its worktree, historical data, screenshots and process metadata were retained. The new preview uses a byte-identical isolated copy of the twelve historical pilot files. The port-3210 map-disabled inspection process was also stopped. No production records or provider settings changed.

## Corrections

- ReCircuit sidebar navigation, current-section highlighting, skip link and a data-derived three-stage workflow.
- Consistent route-scoped typography, spacing, cards, status badges, buttons and form treatment. Other portal routes and global styles are unchanged.
- Read-only access controls collapse after reading. The newest saved proposal opens automatically; selecting an earlier version and rereading retains that selection. Reading does not calculate, book or dispatch.
- Four metrics show actual request count, eligible count, saved distance and the sum of route durations. Duration is explicitly total resource time, not parallel elapsed time. Display rounding does not modify solver inputs or fractional weights; overnight stop times retain a day offset.
- A prominent historical/stale notice explains expired evidence or changed inputs and links to preparation. Expired pilot coordinates still prevent generation. No freshness label or evidence timestamp was rewritten.
- Balanced desktop map and stop panel; responsive stacking on smaller screens. Numbered markers correspond to route stop order. Coincident start/return depots use one labelled marker.
- Container resizing refits the saved route, keeping the numbered stop visible when moving from desktop to mobile. User panning and zooming do not themselves reset the map.
- Tile failure shows a useful error, automatically opens the tile-free diagram and preserves the ordered stop list. Retry is explicit. Technical connection details remain expandable.
- Fleet selection, vehicle forms and advanced JSON editing remain available in compact disclosures. History remains scrollable and selectable. Technical provenance and baseline comparison move into expandable evidence details.
- Requested preferences, dispatcher confirmation, cumulative load, unassigned reasons, preparation exclusions and independent replay status remain distinct. No operational assignment or collection status is inferred.

No API, solver, persistence, provider-release guard, ownership check, public-coordinate allowlist, expiry check or server-rendering configuration was changed. No hydration warning suppression was added.

## Actual browser inspection

Only `/admin/routing` is claimed as browser-inspected for this task. Other portal pages were not re-audited. Linked preparation, fleet and saved-history sections were exercised on that route.

Normal installed Chrome `155.0.8059.85` ran visibly using a persistent profile, without `--incognito` or `--disable-extensions`. This is a fresh automation profile, not the user's affected extension profile. There were no hydration warnings or `fdprocessedid` attributes in the focused inspected application. The previously reported browser-side injector remains unidentified; SSR and its warnings remain enabled.

| Desktop viewport | Actual result |
| --- | --- |
| 1366 × 768 | Real tiles and numbered stop visible; map/stop columns aligned; no horizontal page overflow |
| 1440 × 900 | Real tiles, route, stop list, zoom controls and attribution; no horizontal page overflow |
| 1920 × 1080 | Balanced wider workspace; real tiles and stop panel; no horizontal page overflow |

| Mobile/tablet viewport | Actual result |
| --- | --- |
| 390 × 844 | Stacked layout; route refits with numbered stop inside map bounds; ordered list retained below; no horizontal page overflow |
| 768 × 1024 | Responsive navigation and stacked map/stops; real tiles; no horizontal page overflow |

Keyboard Enter toggles the diagram; focus is visible during keyboard navigation. Reduced-motion preference was checked. Native required/min/max form attributes and the disabled empty fleet selection were checked without saving. Actual unauthorized local-token handling shows a useful summary with collapsed diagnostics. A GET-only UI fixture exercised empty requests/fleet/history; it is not live evidence. No browser test submitted a routing POST or generated a proposal.

Real tile success used no substituted imagery, mocked success or intercepted tile response. A CDP network block tested failure, then removing that block and pressing Retry restored real tiles. The final responsive run observed 53 PNG response events, all HTTP 200; cached responses may be included, so this is not a billed-request count. The process has no HeiGIT credential and external routing disabled. Saved real HeiGIT geometry is reused as explicitly historical evidence; geocoding, matrix and directions were not refreshed.

Native 200% zoom passed at all three desktop sizes in bundled Chromium using a zoom-only test extension and `chrome.tabs.setZoom/getZoom`. Observed CSS widths were 683, 720 and 960; devicePixelRatio doubled and page overflow remained false. Corrected CDP viewport captures preserve physical screenshot dimensions. The earlier full-page zoom captures were clipped by the capture harness and remain preserved, not accepted as visual proof. Native normal-Chrome zoom automation did not take effect via the attempted preference/keyboard methods; no normal-Chrome 200% result is claimed. Normal Chrome's five regular viewport results above are separate passing checks.

## Before/after evidence

All paths below are relative to the original repository. Existing evidence was reused without rewriting it.

| Evidence | Path |
| --- | --- |
| Before: live map plus duplicate diagram | `.data/release-blockers-20261024/evidence/maptiler-only-1792824484707/actual-live-map-desktop-1440x900.png` |
| After: complete desktop route workspace | `.data/routing-workspace-ui-20261024/evidence/desktop-review-1792827597810.png` |
| Final normal-Chrome viewport/full-page screenshots | `.data/routing-workspace-ui-20261024/evidence/final-live-1792827514907/` |
| Mobile live map | `final-live-1792827514907/live-workspace-390x844.png` within that evidence directory |
| Actual network-failure fallback | `final-live-1792827514907/live-network-failure-fallback.png` |
| Final live-browser assertions and sanitized tile results | `final-live-1792827514907/live-browser.json` |
| Map-disabled, form, history, keyboard and empty-state checks | `focused-browser.json` and corresponding screenshots in that evidence directory |
| Accepted native 200% captures and measurements | `native-zoom-1792827730476/` |
| Running normal-Chrome window and owned-server metadata | `visible-workspace-*.json`, `server-3200-1792827091677.json` |

Desktop, mobile and corrected zoom screenshots were visually inspected. The provider's earlier allowed/denied-origin evidence was reused; provider restrictions were not re-audited or changed for this UI task. Browser key release remains restricted by the existing exact application origins `http://localhost:3200` and `http://127.0.0.1:3200`.

## Focused checks

See [EXECUTION.md](EXECUTION.md) for actual commands, timestamps, wall times, exits and retained raw logs.

| Final relevant check | Actual result |
| --- | --- |
| Presentation + service + public-pilot + geocoding regression tests | 4 files / 57 tests passed, exit 0 |
| Changed TypeScript/TSX files lint | exit 0, no warnings |
| Portal source TypeScript check after the final map correction | exit 0 |
| Affected portal production build after the final map correction | exit 0 |
| Final responsive real-map Chrome interaction/layout run | exit 0 |
| Native 200% zoom and corrected viewport capture | exit 0 |
| Focused preservation scan | exit 0; source, static bundles and submitted artifacts have no known provider-key bytes |

The source tsconfig's only development-generated additions were restored from the pre-start byte copy. No dependency, household build, full security audit or full test suite was repeated. The normal-Chrome and zoom checks use the local development preview; a production-browser smoke test is not claimed. The affected production build does include its own TypeScript and page-generation checks.

## Preserved failures and limits

The execution ledger preserves every failed harness invocation. Causes were an incorrect helper working-directory path; matching Next's empty announcer instead of the application alert; an ambiguous heading selector; CSS uppercase text in an assertion; a focus test without keyboard modality; a fixture that incorrectly retained the previous selection; a navigation selector that included aria-hidden numbering; and ineffective native normal-Chrome zoom methods. Locators, input state or verification method were corrected; application assertions and deadlines were not weakened. The native zoom full-page capture defect was corrected with physical CDP viewport captures. Intermediate screenshots and raw failure logs remain.

The first direct typecheck found a nullable comparison display value; it was corrected before builds. Screenshot review found the responsive map-fit defect; the final focused browser run now asserts that the numbered marker stays within the map rectangle at every tested viewport.

Remaining limits: historical evidence is expired and cannot authorize a new calculation without the existing public-location refresh and explicit review safeguards. This UI task intentionally performs no refresh or new booking. The browser-side extension responsible for the earlier hydration attribute is unknown. Native normal-Chrome 200% zoom still needs a manual confirmation. Existing Next warnings about React 18, middleware convention and the Tailwind config module type remain outside this UI scope; an existing favicon 404 was observed during initial development checks. No hosted or deployment verification occurred.

Original remediation/root commits and worktrees remain intact. The unrelated resumed submission report's hash and both original/submission MP4 hashes match their recorded values. Both isolated pilot data copies match all twelve original files. Existing raw/interrupted recordings and evidence were not edited or removed. If this UI is later deployed, routing-workspace footage would need recapture; no existing video was replaced.

No push, deployment, production activation, production data changes, customer-location transmission or paid service was requested by these checks.

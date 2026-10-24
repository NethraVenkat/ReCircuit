# Authorized live public-location verification — 24 October 2026

This follow-up supersedes the **local live-provider blockers only** in the earlier checkpoint. Production remains disabled and unverified. Earlier reports, failures and evidence are retained unchanged.

Evidence directory: `C:\Users\Manish\Downloads\ReCircuit-Local\.data\release-blockers-20261024\evidence\live-authorized-1792822660060` (E below). Base commit: `8b34e83f34255d38f32bea9e4cc8d4be2fc6bbaf`, branch `remediation/routing-release-blockers-20261024`.

## Preflight and bounds

The user explicitly supplied account confirmation as preflight: HeiGIT had 3000 geocoding, 500 matrix and 2000 directions requests remaining when checked; MapTiler was on Free with zero displayed usage. The user confirmed the existing key's `localhost` and `127.0.0.1` restrictions were saved and reopened, and explicitly accepted their hostname-level granularity. These are **user-attested account observations**, not dashboard observations made by this agent. No new dashboard session was required.

The application remains restricted to `http://localhost:3200` and `http://127.0.0.1:3200`. No production origin or wildcard was enabled. Root `.env.local` was checked ignored and untracked before keys were read into process memory. No keys were printed or committed. HeiGIT stayed server-side; the intended MapTiler browser key was released to the isolated local application only after real browser enforcement passed.

Only a registered public landmark and the public ORS-documentation depot coordinate were transmitted. The booking, household attestation, load and vehicle are explicitly synthetic files in E/public-test-data; they are not production records or a real independently verified pickup. No booking endpoint or operational assignment was invoked.

## Actual results

| Check | Actual result | Evidence |
| --- | --- | --- |
| Real browser tile request from `http://localhost:3200` | HTTP 200, image/png, 30211 bytes, decoded 256×256 | E/tile-enforcement.json |
| Real browser tile request from `http://127.0.0.1:3200` | HTTP 200, image/png, 30211 bytes, decoded 256×256 | E/tile-enforcement.json |
| Real browser tile request from `http://rejected.recircuit.test:3200` | HTTP 403; no successful image | E/tile-enforcement.json |
| Actual browser Origin/Referer | Browser-generated and matched each tested origin; provider responses were not intercepted | E/tile-enforcement.json |
| Original English landmark geocode | Five unrelated/ambiguous candidates; none approved | E/live-geocode.json |
| Corrected official-name query | Returned multiple candidates; explicitly selected `Schloss Heidelberg, Heidelberg, BW, Germany`, lon 8.714553 / lat 49.409451 | E/live-geocode-1792822820334.json |
| Directed 2×2 road matrix | HTTP 200; outbound 5094.06 m / 810.68 s, return 3170.38 m / 622.79 s; four elements | E/upstream-metadata.jsonl, E/live-routing-results.json |
| Directions: depot → landmark → return | HTTP 200; 272 geometry points, 8264.5 m / 1433.5 s; no material matrix mismatch | Same files |
| Optimized proposal | One synthetic stop, 8264.44 planned m, 1433.47 travel s, independent replay valid | E/live-proposal.json |
| Persistence and duplicate prevention | Saved/reloaded proposal equal; same request key reused the same proposal; synthetic booking bytes unchanged | E/live-routing-results.json |
| Live map | Real 18-tile viewport, all HTTP 200, decoded images, visible road overlay and stop labels, MapTiler/OSM attribution, no horizontal page overflow at 1440×900 | E/live-map-browser-1792823111849.json and screenshots |
| Final read after expiry | Saved map remained visible, proposal correctly labelled stale; zero additional tile/provider requests | E/final-browser-check.json, E/live-map-final-desktop-1440x900.png |

The first tile attempt was denied by the execution sandbox before provider responses: a separate unauthenticated diagnostic established Node `EACCES` and Chromium `ERR_NETWORK_ACCESS_DENIED`. The successful bounded rerun used authorized network permission. That failed evidence is retained under sibling `live-authorized-1792822624751`.

The first matrix generation failed at approximately the existing eight-second deadline and returned the old generic application error. No upstream status or raw exception was captured for that attempt, so timeout is an inference from timing, not a retained upstream diagnostic. One deliberate retry with the **unchanged** eight-second deadline returned HTTP 200. There were no automatic retries. The adapter now returns the redacted `HEIGIT_NETWORK_OR_TIMEOUT` code for future transport failures.

Usage accounting for this follow-up: **two geocoding requests, two matrix attempts / eight requested elements, one directions request, and 39 authenticated tile requests** (two permitted probes, one denied probe, 18 initial-render tiles and 18 corrected-render tiles). The timed-out attempt may have reached/billed the provider; remaining account counters were not re-read. Two unkeyed MapTiler logo requests accompanied the map renders. The three sandbox-blocked tile attempts had no provider response and are recorded separately. No paid usage or billing change was requested.

The initial tile probe's `sha256` fields reflect an empty buffer returned by Playwright's response-body accessor; they are **not image-content hashes** and were not used to pass enforcement. The browser's successful image decode, nonzero blob size and HTTP status are the relevant positive checks. Original raw evidence is retained.

## Corrections required by the live checks

- The public registry maps the unchanged English address/fingerprint to the landmark's official fixed query, `Schloss Heidelberg`. The [official venue page](https://www.schloss-heidelberg.de/besuchsinformation/anfahrt/) supplies that name. The provider configuration fingerprint changes, so previous evidence is not silently relabelled. Multiple candidates still require explicit review; neither the Swiss match nor unrelated venues were approved.
- A schematic-wide SVG width rule also matched Leaflet's overlay SVG and hid the actual road line. It now targets figure SVGs only. The corrected overlay measured 1572×430 pixels and the green road path was visually inspected in the real-tile screenshot. The before capture is preserved as E/live-map-desktop-1440x900.png; the after is E/live-map-desktop-1440x900-1792823111849.png.
- Copy now distinguishes the diagram's lack of tile loading from the optional live basemap and reports enabled map access truthfully.
- Next normalized the internal request URL's port, so relying on URL origin alone could release the browser key for an unapproved actual Host. Map configuration now checks the actual Host and any caller Origin and ignores forwarded host claims. The failed HTTP reproduction is preserved. After correction, real HTTP checks withheld the key for localhost:3201, 127.0.0.1:3201 and the unapproved hostname; mutation checks returned 403 for those origins. Missing operator authentication returned 401. Allowed-origin invalid payloads returned 400 after passing the origin guard, without writing records. E/exact-application-origins-1792823244174.json records the successful run.

## Relevant verification only

No full suite, dependency audit or household build was repeated. Final commands ran after the final source change, with raw output in the parent evidence directory and actual timings/exits in its append-only execution.jsonl:

| Label | Scope | Exit |
| --- | --- | ---: |
| live-final-focused-regressions | Six relevant test files, **98 tests passed**: public pilot, geocoding, provider/audit contracts, failure contracts, service/authentication and negative API cases | 0 |
| live-final-changed-lint | Nine changed TypeScript/TSX source and test files, zero warnings allowed | 0 |
| live-portal-typecheck | Portal TypeScript project, no emit | 0 |
| live-final-portal-build | Affected portal production build; includes TypeScript validation | 0 |

Earlier focused checks/builds and failed HTTP harness executions are retained. The initial Node-fetch Host-spoofing harness did not preserve the requested Host reliably; explicit `http.request` then reproduced and verified the actual application defect without weakening the assertions. No successful claim relies on that initial harness.

Next's generated preview tsconfig additions were preserved in E/generated-preview-tsconfig-preserved.json and only those known additions were removed; initial tracked configuration was restored. No unrelated edits were discarded.

## Local viewing and limits

The isolated development server is left running at `http://127.0.0.1:3200/admin/routing`, and the populated live map is open in a visible local browser. Source data and process/stop-file metadata are in E. The local operator token is a synthetic test credential, not a production credential. The original launcher remains map-disabled by default; this session used the evidence-gated external local harness, not a production configuration change.

The five-minute geocode/matrix validity period has elapsed. The saved public-test proposal is now stale and is shown as such on the final read; historical roads remain displayable. No extra calls were made to refresh its validity. Road data is a static driving-car sample, not live traffic, customer-address permission, a dispatch instruction or proof of actual collection. The venue's [official access page](https://www.schloss-heidelberg.de/besuchsinformation/anfahrt/) also says direct driving access to the castle address is unavailable; this public API sample must not be treated as an operational access plan.

The provider permits the authorized hostnames across ports; application checks retain exact port-3200 gating. The negative browser sample demonstrates rejection for the tested unrelated hostname, not universal resistance to forged non-browser headers. Hosted/production verification, production identity/privacy review, current traffic/access restrictions and general customer geocoding remain outside this authorized local check. Existing videos and production records were untouched; no push or deployment occurred.

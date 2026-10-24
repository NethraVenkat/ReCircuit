# MapTiler-only live-map verification — PASS

24 October 2026, 06:48–06:52 UTC. Started from verified HEAD `a29a914fd70302c3837a3e1f55241573de9d2893` on `remediation/routing-release-blockers-20261024`; the worktree was clean. The root checkout's existing submission-report edit was preserved.

E = `C:\Users\Manish\Downloads\ReCircuit-Local\.data\release-blockers-20261024\evidence\maptiler-only-1792824484707`. Earlier evidence and final-state files were not overwritten. This follow-up performed only MapTiler checks and local workspace reads.

## Separate gate results

| Gate | Actual result | Evidence |
| --- | --- | --- |
| **Allowed-host tiles: PASS** | Header probes and real controlled Chromium requests from both `http://localhost:3200` and `http://127.0.0.1:3200` returned **HTTP 200 / image/png**. Each successful browser request decoded a **256×256**, **30211-byte** image. | E/enforcement.json |
| **Denied-host enforcement: PASS** | Header probe and actual Chromium request from `http://rejected.recircuit.test:3200` returned **HTTP 403 / image/png**. Browser-generated Origin and Referer matched the unapproved origin. | E/enforcement.json |
| **Actual browser rendering: PASS** | The real routing workspace at 1440×900 loaded and decoded **18 real MapTiler tiles**, all **HTTP 200 / image/png**. Historical road overlay, `Proposed stop 1`, depot labels, MapTiler/OSM attribution, logo and both zoom controls were visible. No horizontal page overflow. | E/workspace-browser.json, E/actual-live-map-desktop-1440x900.png |
| **Stop-list fallback: PASS** | In a separate failure-only browser context, Chromium blocked tile networking. The actual tile error summary appeared; the ordered `SYNTHETIC-PUBLIC-CASTLE` stop and stored road diagram remained visible. No fake tile/error HTTP response was supplied. | E/tile-network-failure-stop-list-preserved.png; workspace-browser.json |
| **Exact application origins: PASS** | Eleven local HTTP checks confirmed map-key release for the two port-3200 Hosts, no release for port 3201 or the unrelated hostname, mutation-origin rejection with HTTP 403, and missing-token rejection with HTTP 401. Valid origins with deliberately invalid action payloads returned HTTP 400 without record writes. | E/exact-application-origins-1792824626084.json |

The provider's denied response is itself a 512×512 PNG error image. Its image content type does **not** mean access succeeded: HTTP 403 determined rejection. Header probes were not counted as rendering proof. The separate controlled-origin browser checks and the actual routing workspace render supply that proof.

The controlled test page was served on loopback port 3200, with Chromium's resolver mapping only the deliberate unapproved `.test` hostname to loopback. Requests to MapTiler were real; provider responses were not intercepted, substituted or fulfilled with fixtures. The successful workspace browser used no tile interception. The separate failure check used Chromium `Network.setBlockedURLs`; it generated 18 local inspector-blocked tile attempts and zero provider tile responses. This was a network-failure test, never a success claim.

## Preflight, configuration and usage

The existing user confirmation was accepted: MapTiler Free plan with zero displayed usage when checked, and saved/reopened `localhost` and `127.0.0.1` hostname rules. Hostname granularity was explicitly authorized. No additional dashboard login was requested and no provider restriction was changed.

The root `.env.local` was verified Git-ignored and untracked before reading `MAPTILER_API_KEY` locally. Its value was kept in process memory and the intended gated browser configuration; no credential-bearing URLs, response payloads or keys were saved in reports or screenshots.

The previous owned test server was stopped through its recorded stop file. The new map-only launcher checked that all fresh enforcement checks passed **before** enabling local browser-key release. Its application allowlist remains exactly:

- `http://localhost:3200`
- `http://127.0.0.1:3200`

The launcher copied the existing local historical data into E/historical-data. **HeiGIT has no key in this new process; external routing/geocoding and quota authorization flags are disabled.** Its credential-free request metadata file E/heigit-traffic.jsonl remained empty. No geocoding, matrix or directions refresh was performed.

Total authenticated MapTiler tile requests in this follow-up: **24** — three header probes, three controlled-browser requests and 18 workspace tiles. Twenty-two returned HTTP 200 and two intentional denied-origin probes returned HTTP 403. Failure-only browser-blocked attempts are separate and were not provider responses. Public unkeyed logo assets also loaded. No automatic refresh, paid usage or billing change was requested. Account usage counters were not re-read; preflight is user-attested.

## Historical geometry and preservation

The map displays saved proposal version 2, ID `03637ea0-8c9e-4d59-a008-ab71e8cc9a23`, with its **272-point real HeiGIT geometry from the earlier verified run**. Its matrix retrieval time remains `2026-10-24T06:38:50.273Z`. It is historical evidence, not a freshly calculated route. The screenshot explicitly displays **“Proposed routes — stale inputs; recalculate”**. Generation remains disabled for the expired/ineligible preparation.

All 12 copied data files were compared byte-for-byte with the original pilot data and remained equal. Saved proposal hashes were also checked after browser inspection. Next's two generated preview configuration changes were saved in E/generated-next-env.d.ts and E/generated-tsconfig.json, then only those known generated changes were restored to the before-run bytes. No application source correction was necessary.

Focused credential checks found **zero MapTiler key-byte matches** in the new evidence, helper scripts, reports and preview browser static files. Both screenshots were visually inspected and contain no displayed key. The unrelated root submission-report hash is unchanged. E/focused-finish-checks.json records these checks.

## Viewing locally

The successful map is left open in the visible local browser, and the isolated map-only server remains running:

**http://127.0.0.1:3200/admin/routing**

For another browser session, use the intentionally synthetic local test token `synthetic-public-routing-test-token`, keep service date `2026-10-24`, choose **Read eligible bookings → Version 2 → Load restricted basemap**. This test token is not a production credential. The actual MapTiler and HeiGIT keys must not be pasted into the operator field or URL.

The evidence-gated helper commands are preserved under the parent remediation directory: `maptiler-preflight.mjs`, `maptiler-local-app.mjs`, `maptiler-workspace-browser.mjs`, `maptiler-app-origins.mjs` and `maptiler-finish-checks.mjs`. The new server and browser have their own stop files recorded under E; unrelated processes were not killed.

## Checks and remaining limits

All bounded provider assertions, actual workspace rendering assertions, fallback assertions, eleven application-origin/authentication checks and focused preservation checks passed. No full suite, dependency audit, unrelated build or production build was repeated, because application code did not change. Only this report and its status link were committed.

Provider restrictions intentionally cover the authorized hostnames across ports. Application key release remains limited to the exact port-3200 origins. The denied-browser result covers the tested unrelated hostname, not a universal assertion about spoofed non-browser headers. Zoom controls were visibly inspected; extra zoom traffic was avoided. This run verifies the 1440×900 desktop viewport, not a new responsive audit.

This is a live basemap over a stale public-test proposal with a synthetic load, booking attestation and vehicle. It does not establish operational access, current road conditions, customer-address permission, dispatch or collection. Production maps/routing remain disabled and unverified. No production records, environment, provider restriction, existing video, push or deployment were changed.

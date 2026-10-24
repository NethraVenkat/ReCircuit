# Live provider gate — BLOCKED

**Historical checkpoint:** the user subsequently supplied account preflight and explicitly authorized hostname-level restrictions. The local live-provider follow-up passed real browser tile enforcement and public-location routing; see [LIVE_PUBLIC_VERIFICATION.md](LIVE_PUBLIC_VERIFICATION.md). The original blocked observations below are retained as history. Production remains disabled.

No fresh authenticated HeiGIT or MapTiler request was made during this remediation task. Current account plans and remaining free allowances were **not observed**, so no permission to incur paid usage was inferred from the presence of keys. Historic live probes in earlier reports remain historical and are not substituted for these gates.

| Required gate | Actual result |
|---|---|
| HeiGIT account plan / remaining free quota | BLOCKED: no available authenticated account/browser surface. Current account landing page supplies no account data through the available read-only access. |
| MapTiler account plan / remaining free quota | BLOCKED: available account links redirect to sign-in; no authenticated dashboard surface. |
| HeiGIT live Pelias geocoding | BLOCKED by quota preflight; zero fresh authenticated calls. |
| HeiGIT live directed matrix | BLOCKED by quota preflight; zero fresh calls / matrix elements. |
| HeiGIT live directions | BLOCKED by quota preflight; zero fresh calls. |
| Actual MapTiler account restriction settings | BLOCKED: settings not accessible; no setting was changed. Documented hostname semantics also do not establish the authorized port-specific restriction. |
| Live browser tiles / allowed and denied provider enforcement | BLOCKED: real key stays withheld; zero live tile calls. Intercepted renderer tests are explicitly fixtures. |

The computer-use inventory actually returned `apps: []`, `browsers: []`. [MapTiler keys](https://cloud.maptiler.com/account/keys/) and [settings](https://cloud.maptiler.com/account/settings) returned sign-in redirects through the available read-only web access. This is an access limitation, not evidence of the account's plan or quota. No credentials, unrelated account content, billing changes or new keys were requested.

## Current documented endpoints and restriction mechanism

The [official HeiGIT migration table](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912) separates:

- Pelias: `https://api.heigit.org/pelias/v1/search`.
- Directed driving matrix: `https://api.heigit.org/openrouteservice/v2/matrix/driving-car`.
- Directions: `https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson`.

[HeiGIT's current API landing page](https://api.heigit.org/) links the account dashboard; the migration notice says the quota displayed there applies to api.heigit.org. A public statement that a free Standard key exists does not establish this user's current plan, remaining requests/elements or billing behavior. Those values remain unknown.

[MapTiler's current key guide](https://docs.maptiler.com/guides/developer/credentials/api-key/) documents Allowed HTTP origins in the key settings, and specifically instructs local development entries **without protocol or port**: `localhost` or `127.0.0.1`. It also says `?` permits missing-Origin requests and documents wildcards. Neither `?` nor a wildcard was configured. Its documented local rule is hostname based; **inference from that mechanism:** it cannot establish permission limited specifically to port 3200. This is not an experimentally observed account restriction result. An application exact-origin check cannot prove provider-side enforcement once a browser key is exposed.

The authorized application origins remain exactly:

- `http://localhost:3200`
- `http://127.0.0.1:3200`

Actual routing UI port **3200** was verified repeatedly in real browser/application runs. No extra UI port, production origin, preview domain or wildcard was enabled. The launcher forces `MAPTILER_ORIGIN_RESTRICTIONS_VERIFIED=false`; real browser-key release remains disabled. Merely entering the documented hostname-only rules would not prove that other ports are denied, so the task does not silently broaden the user's authorization.

## Offline defect corrected while external gates remain blocked

Previously the runtime geocoder allowed Heidelberg Castle, but its matrix wrapper accepted only two fixed ORS-documentation coordinates. A valid returned/reviewed landmark candidate could therefore never reach the runtime road matrix. That was a real integration gap; it was not hidden by removing a limitation.

`public-pilot.server.ts` now keeps a closed named public-landmark registry. The geocoder checks its exact public text, tenant and address fingerprint before transport. Matrix/directions accept the named landmark only when its stored candidate/result, tenant, public address fingerprint, provider configuration, retrieval timestamp, expiry and explicit review agree, with the exact selected coordinate. Arbitrary manual substitutions/private inputs remain blocked before road traffic. Existing closed public ORS-documentation points remain supported. This does not authorize general customer geocoding or change production guards. Configuration fingerprints change so older public-mode records become stale without rewriting their historical provenance.

`public-pilot.test.ts` exercises actual adapters with **mocked transport only**: public query → candidate → explicit review → asymmetric directed matrix → optimization → independent replay → directions in start/pickup/return order → immutable save/reload/idempotency. It checks lon/lat order, requested metres/durations, node mapping, cache retrieval timestamps and refusal of private queries/corrected coordinates. Three mocked requests (one geocode, one 2×2 matrix/four elements, one directions) are not live account usage or real road measurements. UI copy describes the registered-test boundary without claiming live success.

## Exact actions needed to unblock

1. In an authorized signed-in [HeiGIT account](https://account.heigit.org/), inspect the existing key's current plan, remaining geocode/matrix/directions allowances, applicable element/rate limits, reset times and billing behavior. Record timestamped redacted evidence. Confirm an explicitly budgeted one-landmark run fits the remaining free allowance; do not upgrade or activate billing.
2. In the existing MapTiler account, inspect current plan/remaining quota and key settings; keep key values hidden in evidence. Confirm the provider's actual supported restriction mode and port semantics. The documented hostname rules alone do not prove 3200-only enforcement: obtain provider-supported exact-origin enforcement or resolve that limitation before exposing the key. Do not silently replace the authorized exact origins with a broader rule.
3. After genuine account/restriction preflight, run the registered public scenario through the real application and retain usage/provenance: one geocode, a two-node directed matrix (four requested elements) and directions for depot/landmark/return. Confirm actual returned costs, geometry, cache timestamps and save/reload; do not substitute the mocked numerical fixture.
4. Only after the provider restriction gate is established, perform bounded real tile loads from an allowed browser origin and a controlled unapproved origin, including an unapproved same-host port if claiming port-specific enforcement. Inspect actual provider rejection, attribution, overlays and stop-list fallback. Strip keys/query credentials/auth headers from saved traffic. A metadata HTTP 200, app middleware check or intercepted tile cannot pass this test.
5. Keep production routing/maps disabled. Production origin inspection, hosted deployment verification, real customer-address processing and identity/privacy authorization are separate outstanding work, not implied by these local results.

No repeated request for origins/keys is needed. The specific blocker is authenticated account/quota/settings access plus proof of restriction granularity, not missing origin preferences.

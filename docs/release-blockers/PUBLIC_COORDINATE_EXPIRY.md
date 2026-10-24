# Public pilot coordinate rejection — diagnosed and corrected

24 October 2026. Base commit `1d95e62637912473699f36a4b054ce8ce38999ee`; isolated branch `remediation/routing-release-blockers-20261024`. Evidence E = `C:\Users\Manish\Downloads\ReCircuit-Local\.data\release-blockers-20261024\evidence\coordinate-pilot-1792823769748`.

## Actual cause

The current pilot was inspected, not reconstructed from the earlier report. Its settings version 6 held these exact coordinates (longitude, latitude):

| Node | Saved coordinate | Authorization comparison |
| --- | --- | --- |
| Start and return depot, `public-ors-docs-depot` | 8.67842, 49.40664 | Exact match to the second registered ORS-documentation point and required public-depot ID prefix |
| Pickup, `public-heigit-heidelberg-castle` | 8.714553, 49.409451 | Exact match to the selected stored `Schloss Heidelberg, Heidelberg, BW, Germany` candidate and its explicit review |

There was **no numerical coordinate mismatch** and no reason to broaden the allowlist. The dynamic landmark permission also requires fresh evidence. The reviewed candidate result `c7b7a306-99b1-4c7d-bafa-81c7d3f61a55` expired at **06:25:20.318 UTC**. At 06:36:53 UTC, generation was reproduced returning HTTP 400 / `HEIGIT_PUBLIC_TEST_COORDINATES_ONLY`, with the upstream request metadata unchanged: the guard rejected it before any external traffic. E/before.json and E/reproduced-error.json retain the actual state and reproduction.

The defect was an inconsistency between the preview and provider guard. The preview checked provider configuration but still treated the expired review as eligible. The unchanged public-coordinate guard correctly refused its stale proof and produced the generic coordinate-only rejection.

## Correction and preserved safeguards

The preview now excludes a review tied to expired candidate evidence at the exact expiry boundary and returns `COORDINATE_EVIDENCE_EXPIRED`. The rendered explanation asks the operator to find fresh candidates and explicitly review again. Missing, superseded or configuration-mismatched source evidence also prevents eligibility; a new candidate result does not inherit the old review's approval. Reading a saved proposal also marks it stale when its coordinate evidence expires, even if its matrix remains fresh.

The public allowlist, exact coordinate equality, registered node identity, source/address/tenant fingerprints, five-minute validity, explicit review requirement and provider-side public-location wrapper are unchanged. No tolerance, timestamp extension, automatic approval, customer-address permission or alternate routing provider was introduced.

To correct the pilot data, one fresh real geocode was requested and the Germany castle candidate was explicitly reviewed again. Its coordinate was unchanged; its fresh result ID is `23d1d79b-050d-460b-ab6a-a6b379a1d466`, retrieved at 06:38:35.966 UTC and expiring at 06:43:35.966 UTC. The existing depot/fleet configuration was retained. The new review records the new source result ID and review time in appended settings; it does not rewrite the old provenance.

All pre-existing settings and proposal files were compared byte-for-byte after recalculation and remained equal. The synthetic booking also remained unchanged. E/before-planning is a preserved pre-change copy; the original reports, videos and production records were not edited.

## Actual recalculation results

Proposal **version 2**, ID `03637ea0-8c9e-4d59-a008-ab71e8cc9a23`, was generated, independently replayed, saved and reloaded successfully.

| Real upstream endpoint | HTTP | Actual result |
| --- | ---: | --- |
| HeiGIT Pelias search | 200 | Fresh ambiguous candidate set; correct Germany candidate explicitly selected |
| HeiGIT driving-car matrix | 200 | Four elements; outbound 5094.06 m / 810.68 s, return 3170.38 m / 622.79 s |
| HeiGIT driving-car directions | 200 | 272 points; 8264.5 m / 1433.5 s; matrix mismatch false |

The optimized matrix total is **8264.44 planned metres**. These are **real HeiGIT responses**, not fixtures or intercepted responses: the already-running server used its actual adapters and key, and credential-free upstream instrumentation recorded the three HTTP 200 responses. See E/upstream-generate-*.jsonl, E/fresh-geocode.json, E/recalculated-proposal.json and E/recalculation-results.json. Exactly **one geocode, one matrix / four elements and one directions request** were made in this follow-up; no retries, tile calls or additional provider probes were made. The earlier user-confirmed free-allowance preflight was reused.

## Focused checks only

| Check | Actual result |
| --- | --- |
| Public-pilot, geocoding and service regression files | **47 tests passed**, exit 0 (`coordinate-verified-focused-regressions`) |
| Changed-file ESLint | Three changed source/test files, exit 0 (`coordinate-verified-changed-lint`) |
| Portal TypeScript project | Exit 0 (`coordinate-verified-portal-typecheck`) |
| Real browser inspection of saved version 2 | Current-input heading and provider road diagram visible at 1440×900; no page overflow; zero external browser requests, exit 0 (`coordinate-proposal-browser`) |

Raw command outputs and exact execution timings/exits are in the parent evidence directory's append-only execution.jsonl. Tests cover the exact expiry boundary, saved-proposal staleness while its matrix is still fresh, no transport or history mutation on rejection, refusal to re-review an expired candidate, loss/supersession of provenance, changed depot coordinates, unregistered depot identity, private queries and pickup coordinate substitutions.

An initial attempt to reuse the old browser tab found no matching target tab; it was not counted as inspection. The successful inspection used a fresh local-only browser, with all non-local requests blocked and the basemap left unrequested. E/recalculated-proposal-browser.png is the resulting actual page capture. It displays real stored provider geometry without making tile requests.

No full audit, full suite, dependency audit, production build, push or deployment was rerun. Relevant source was compiled by the local Next server, checked with TypeScript and exercised by the focused tests and browser read.

## Validity and remaining limits

Version 2 was current at the 06:40 UTC browser inspection. Its matrix expires at **06:43:50.273 UTC** and its selected geocode at **06:43:35.966 UTC**; this correction preserves those lifetimes. Subsequent expiry requires another fresh candidate and explicit review before recalculation. An old historical road line is not fresh authorization. No automatic quota-consuming refresh is enabled.

This remains a public-location API pilot with a synthetic load, vehicle and booking attestation. It does not establish customer-address authorization, operational driving access, dispatch, collection, current traffic or production readiness. The local server remains isolated on port 3200.

# Geospatial routing execution board

Starting checkpoint: 78faed277c13c4bedc121645386ffea3dd74963c, verified on ui/recircuit-household-redesign. Isolated branch feature/geospatial-pickup-routing under .data/geospatial-20261023/worktree. Root report edit preserved (SHA256 48e8820075f065c136f16158b0c8f6244d373623d11f482326fcbf8a1c9f3329).

Evidence and append-only execution log: ../evidence, relative to this worktree. Existing .data runs, three worktrees, ignored environment/build artifacts and external submission videos are preserved. No environment contents are copied. No production action is authorized.

| Stage | State | Evidence / remaining gate |
|---|---|---|
| 0 baseline and architecture | IN PROGRESS | inspection completed; baseline checks pending |
| 1 validated conversion | NOT STARTED | |
| 2 providers | NOT STARTED | official sources read 2026-10-23; external execution prohibited |
| 3 optimizer / independent validation | NOT STARTED | |
| 4 services / persistence / security | NOT STARTED | |
| 5 operator workspace | NOT STARTED | |
| 6 complete verification | NOT STARTED | |
| 7 release preparation | NOT STARTED | |

## Integration decisions

Use the existing TypeScript Next.js recycler portal and its tenant-bound operator surface, not a driver application. Existing routing in core allocates materials to recyclers; it is not a fleet/road optimizer. Geospatial planning is a separate domain, with no booking mutation methods in its service dependency.

Portal RECEIVED / CONFIRMED / SCHEDULED status is not independent verification. A matching, version-bound independent verification attestation is required for preparation. Requested windows remain preferences. A confirmed time must come from explicit dispatcher evidence; ambiguous legacy window strings cannot be parsed into invented hard windows. Unknown total row weights, capacity and service duration block readiness. Four battery units at 0.5 kg row weight contribute 0.5 kg.

Permission model: fail closed unless feature flag and server-side operator token are configured; require explicit header token (no query token) and fixed configured tenant. Every booking, vehicle, coordinate and proposal is checked against that tenant. No caller-selected tenant or arbitrary fetch target. JSON mutations require same-origin and header authorization. Local planning storage is separate from booking persistence. Shared/cloud persistence deployment remains disabled until separately reviewed.

```mermaid
flowchart LR
 A[Authorized tenant booking read] --> B[Pure eligibility + version conversion]
 B --> C[Reviewed coordinates and preparation evidence]
 C --> D[Immutable fingerprinted snapshot]
 D --> E[Directed matrix provider]
 E --> F[Bounded optimizer]
 F --> G[Separate constraint validator]
 G --> H[Versioned proposal-only store]
 H --> I[Authorized operator map and stop list]
 I --> J[Comparable baseline and assumption estimates]
```

Changed paths planned: apps/portals/src/lib/geospatial/*; apps/portals/src/app/api/routing/*; apps/portals/src/app/admin/routing/*; focused unit/integration/browser harnesses; docs/geospatial/*. No booking lifecycle schema migration is planned. No LLM is used for geospatial calculations.

## Provider references (accessed 2026-10-23)

- https://project-osrm.org/docs/v26.5.0/http — directed table distance/duration and route geometry; longitude,latitude input order. A self-hosted, explicitly approved OSRM origin is the initial road adapter candidate. No public demo endpoint default.
- https://operations.osmfoundation.org/policies/nominatim/ — public endpoint maximum one request per second, identification and attribution requirements; do not send private customer addresses. Manual reviewed coordinates and exact-match synthetic fixtures are initial geocoding paths.
- https://operations.osmfoundation.org/policies/tiles/ — free OSM data does not imply unrestricted hosted tiles; no SLA. No automatic public tile requests; schematic offline map fallback must be labelled.
- https://developers.google.com/maps/documentation/routes/compute_route_matrix and https://developers.google.com/maps/documentation/routes/usage-and-billing — matrix billed by origin × destination elements, with per-element failures and request limits. Paid execution is prohibited; credentials/billing/legal storage review required before enabling.
- https://developers.google.com/optimization/routing and https://developers.google.com/optimization/routing/routing_options — routing has bounded search controls and multiple strategies. Keep implementation in current stack; deterministic bounded insertion plus exact small-instance enumeration can avoid adding another runtime. Do not claim a heuristic is optimal.

Provider implementation is not live verification. Coverage, deployment-specific limits, retention and caching terms require provider-specific review before live activation; no blanket permission to persist commercial-provider responses is inferred.

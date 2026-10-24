# Native PostgreSQL / real PostgREST execution

**NATIVE DATABASE VERIFIED** for the dedicated synthetic local topology below. This is not a production Supabase/Auth/identity or whole-stack recovery certification. Production routing remains refused.

E = `.data/release-blockers-20261024/evidence` under the original repository. Exact commands/times/exits are in `execution.jsonl`, `native-provision.jsonl`, `native-sql-execution.jsonl` and `native-durability-execution.jsonl`. Setup/test helper sources are preserved beside E in the isolated remediation directory; no credentials are command arguments.

## Actual infrastructure

- PostgreSQL **18.6**, official EDB Windows binary archive selected through PostgreSQL's documented binary-distribution route. Project-local extraction of bin/lib/share; no installer, Windows service registration, global PATH change or Docker cleanup.
- Archive SHA-256: `e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2`. This is the observed HTTPS-download hash, **not** an independently published EDB checksum verification.
- PostgREST **16.5**, official GitHub Windows release; archive SHA-256 `17f595b0d8dd37473d0231417dea07c5ac9f791282ff5b017fae51ff29e5de2f` matched the publisher's release-asset digest.
- Dedicated database `recircuit_remediation_synthetic`, only IPv4 loopback PostgreSQL `127.0.0.1:35432`, real PostgREST `127.0.0.1:35431`, actual Next UI `127.0.0.1:3200`. Native process identities are in `postgrest-process-*.json`, the cluster's `postmaster.pid`, native server logs and SQL backend records. Actual parallel RPC probes used backend PIDs **21556** and **43272**.
- Synthetic owner/authenticator passwords and HS256 JWT secret/tokens live only in ignored local infrastructure files; never committed or sent to a customer/production service. Authenticator is a dedicated nonsuperuser NOINHERIT login; service role/anon/authenticated are separate roles. PostgREST pool size 5. SCRAM host/local authentication and PostgreSQL data checksums enabled; fsync remains enabled.
- No installed postgres/psql/pg_ctl/postgrest/docker was found on PATH. WSL executable existed, but no global subsystem installation was needed or attempted.

Sources: [PostgreSQL Windows distributions](https://www.postgresql.org/download/windows/), [EDB binary archives](https://www.enterprisedb.com/download-postgresql-binaries), [PostgREST installation](https://docs.postgrest.org/en/stable/explanations/install.html), [official PostgREST release](https://github.com/PostgREST/postgrest/releases/tag/v16.5).

## Migration, transport and authorization

Migration 0007 was applied verbatim twice to the new database after checking current database, server address/port, data directory and owner. Its prerequisites are the dedicated roles plus PostgreSQL's built-in public schema/PLpgSQL; it has no table dependency on unrelated migrations 0001–0006. This does not claim the entire Supabase migration chain was exercised natively.

Actual signatures: `routing_lock(text,uuid,boolean)`, `routing_history(text,text)`, `routing_append(text,text,jsonb,uuid)`. SECURITY DEFINER and fixed `search_path=pg_catalog, public` were inspected from PostgreSQL catalogs. Both routing tables have RLS enabled. Anonymous/authenticated roles have no routing schema or RPC privileges. Real PostgREST requests with no JWT, authenticated-browser JWT and invalid JWT were rejected. Service-role requests returned real serialized booleans/JSON arrays/documents. An explicitly added test-only delayed RPC confirmed different simultaneous native backend processes and schema-cache reload; it is not part of migration 0007 or a production feature.

The application uses `SupabaseRoutingStore`'s default transport with a new narrowly guarded direct PostgREST test path. Native PostgREST exposes `/rpc`; hosted Supabase continues its existing `/rest/v1/rpc` path. Native mode requires explicit local persistence/shared-test/backend flags, exact loopback HTTP origin and a separate synthetic test token. Production/nonlocal targets, redirects and unsupported RPC names are refused; transport failures omit credential/body details. No SQL/RPC bridge or injected in-memory repository substitutes for real PostgREST in these results. Focused tests exercise the guards.

The service role intentionally has all-tenant privileged RPC access. Tenant authority in application flows comes from the server's RECYCLER_ID and ownership/source checks, not an arbitrary client tenant. This test is not a claim of production per-user JWT tenant authorization. Cross-tenant SQL document mismatches, out-of-scope tenant values and Next vehicle/booking-ID mutations were refused; independent tenant histories remained separate.

## Concurrency, failure and recovery actually executed

`native-database-contracts-*` / `native-database-checks-*.json`:

- Two simultaneous lease attempts produced exactly one winner. Stale token write/release failed; concurrent same-version appends produced one immutable version and one conflict.
- Duplicate request-key insertion aborted without a partial successful proposal/version. The intentionally incomplete SQL-only uniqueness fixture is labelled as such; a separate process using the real default application adapter rejected it through runtime schema validation. SQL acceptance is never treated as independent application validity.
- Immutable UPDATE failed. Explicit transaction rollback preserved exact prior history. A deliberately failing transactional copy of migration 0007 rolled back an injected sentinel and retained all prior rows; normal verbatim reapplication also passed.

`native-multiprocess-recovery-*` and final rerun `native-multiprocess-recovery-final-*`:

- Separate Node/Vitest application processes used the default real PostgREST adapter. A contender was refused while a holder owned the committed lease.
- Only that owned holder process tree was forcibly terminated. Its lease remained held and no partial successful history appeared. Wrong-token reconciliation failed. After confirming the holder stopped and reconciling persisted history, exact-token release allowed a later independent application process to append the next version.
- A separate real psql backend held an uncommitted lease and append; terminating that identified owned backend rolled back both. A final rerun preserved an already nonempty application history and asserted exact prior counts. No unsafe lease expiry or removed assertion was introduced.

Manual real-world recovery remains: stop/reconcile the affected worker, inspect immutable history and external effects, recover the exact held capability in a private administrative session, then release that exact tenant/token and retry the original request key. Do not clear leases by age or automatically retry external side effects. This task exercised the procedure only with synthetic routing records.

## Actual application and durability trace

`native-application-browser-*` executes eight actual UI states, explicit candidate selection/review, generate, SQL save/reload, provenance and changed-assumption stale detection. The geocoder/matrix are explicitly synthetic; map tiles were labelled intercepted fixtures. `native-application-api-*` passed all 11 actual Next HTTP cases including concurrent generation/idempotency and infeasible capacity/windows. The booking file's SHA-256 remained `50af6d2d00fe3d144324fc8f4473b56f5ba2db51e021c20e1cea003d815014f9`.

A fresh current proposal was then generated through the native-backed Next API for restart verification:

- ID `77c3833d-fe5f-42f4-978f-c577f4377184`, version **5**; correlation `b3d84f09-61c9-41dc-a616-bc015835ca25`.
- Proposal/current state, immutable input, reviewed coordinate provenance, independent replay, baseline and all stored history were captured in `native-durable-proposal-before.json`. The initial UI automatic candidate flow is synthetic; the later durability/API preparation uses explicitly reviewed fixture coordinates, not live AI/geocoding success.
- Native routing rollback returned real service-role HTTP **403**, preserving all rows. Reapplication and actual PostgREST schema reload restored access.
- Native `pg_dump -Fc` and transactional `pg_restore` into a different dedicated database reconciled **27 immutable history rows plus every lease row** at that checkpoint. Canonical complete-relation hash before/restore/restart: `9a9b090883a2ec412151bf79f4b02e768d6c259f48b861a361c2abcff2b3dfb7`.
- Actual PostgreSQL shutdown/restart retained the same hash, and real PostgREST reconnected. The actual Next process was separately restarted. API replay returned the entire proposal equal to its earlier snapshot, `current:true`, independent validation true and `PROPOSAL_ONLY_NOT_DISPATCH`. The actual reloaded UI was inspected/captured at 1440×900. Booking bytes matched. Evidence: `native-reloaded-1792809732785/results.json` and PNG.
- A later focused recovered-client rerun intentionally appended one further QuickScrap **synthetic settings** version; the 27-row durability count/hash above is a precisely identified checkpoint, not a fabricated final aggregate.

Native-backed UI states were checked at 1366×768, 1440×900, 1920×1080, 390×844 and 768×1024, plus actual 200% Chromium zoom at all three desktop sizes after restart. Keyboard/overflow/axe checks passed within their bounded scope; no full WCAG certification is claimed.

## Preserved failures and native-specific differences

- `native-init-*` failed because synchronous pg_ctl output capture retained inherited handles after pg_ctl itself exited 0 and PostgreSQL was already ready; the wrapper timed out. The failed wrapper is not called PASS. A separate exact-target SQL check resumed safely without reinitializing the cluster; later control commands used direct log-file handles. Original raw commands and correction note remain.
- First native restore failed on `CREATE SCHEMA public` because a fresh PostgreSQL database already supplies that schema. Its database/dump/log were preserved. A different newly created restore database was checked for an empty default public schema, that empty schema alone was removed, and the dump was restored transactionally. Corrected rollback/backup/restart run exited 0. This native restore behavior was not established by previous PGlite tests.
- Initial new client-test typing failed on an excess fresh-literal property. A typed local variable corrected it; the actual separate-process recovery checks were rerun against nonempty history, preserving every version/count assertion. No migration/assertion was weakened.

No production/shared migration, record/booking edit, paid API request, deployment, push or video replacement occurred. Remaining live-account/quota/origin checks and production identity/privacy authorization are separate release blockers.

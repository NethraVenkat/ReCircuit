# Cloud persistence

Household production processes require `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` in their server environment. Portal production
processes additionally require `RECYCLER_ID` and `CAPTCHA_SECRET`. Never expose
the service role to a browser. Root `.env.local` is not automatically inherited
by every process. `DATABASE_URL` does not select a repository.

Apply reviewed pending Supabase migrations through 0006. Do not reset, seed or
reapply earlier migrations. `supabase/config.toml` manages only the API schema
list; preserve undeclared remote configuration.

## Storage and consistency

`SupabaseHouseholdRepository` preserves the existing `IRepository` contract.
`household_records.record` contains the full request, items, plan, approval,
household metadata, policy sources, original retrieval/expiry times and audits.
This deliberately avoids lossy mapping into the older demo relational tables.
Jobs and action records have dedicated tables. Browser roles have no grants or
policies for these records; RLS is enabled. Ownership checks remain mandatory in
the API because the backend service role bypasses RLS. Read queries also filter
by the authenticated household's owner hash.

Whole-record writes use revisions to reject competing snapshots. Household
mutations use database request locks; AsyncLocalStorage only transports the lock
token, and is not the lock authority. PostgreSQL serializes lock acquisition and
saves with transaction advisory locks. Job dequeue uses `FOR UPDATE SKIP LOCKED`.
The database validates persisted approval hashes and evidence freshness at state
transitions and again when atomically reserving a unique submission action.
The worker reserves that action immediately before clicking submit, after human
input. An uncertain outcome is not permission to submit again. Portal booking
creation uses its existing unique recycler/client key and commits the initial
event in the same transaction; retries recover the same booking.

Request locks intentionally have no automatic expiry: expiring a lock while a
browser may still be submitting would permit duplicate side effects. After a
process crash, an operator must reconcile the stored leg, action reservation and
recycler record, then explicitly release only the affected lock. Running jobs
also require reconciliation after worker failure. Do not blanket-clear locks,
reservations or running jobs. These are database records, not local dependencies.

All portal database errors are explicit. Switch updates persist every interface
field and consume one-shot values atomically. CAPTCHA signatures and human input
remain unchanged; nonce consumption uses a unique database key across processes.
The synchronous/in-memory CAPTCHA verifier is disabled in production.

## Private evidence

Worker screenshots and verification JSON are written to the private
`recircuit-evidence` Storage bucket. Stored references use
`storage://recircuit-evidence/...`; public URLs are never used. Source evidence
and browser action traces retain these references in durable records.
`GET /api/evidence-access?requestId=...&reference=...` checks household ownership
and exact reference membership in the request or its action records before
issuing a 60-second signed URL. Storage failure aborts the operation; it does not
fall back to local screenshots or best-effort audit files.

## Local mode and operational limits

Development without cloud credentials retains FileRepository. Explicit
`RECIRCUIT_PERSISTENCE=local` isolates Playwright tests from root cloud credentials.
This setting, FileRepository and embedded PGlite are refused in production.
Legacy intake/plan/approve/book/policy CLI demos are local-only and reject cloud
or production environments. Production operations use the household API.

Historical local requests, DEC screenshots, verification ledgers and earlier
verification snapshots are preserved in place. This change does not silently
import old demo/test archives into live household data or rewrite their evidence.
They remain local archives; cloud API listings contain cloud-backed records.
Importing historical records would need an explicit inventory, owner mapping and
evidence-reference reconciliation, especially for expired approvals.

New production household records, jobs, actions, nonces and required evidence
have no filesystem persistence dependency. The policy cache is optional process
memory; persisted plans retain their own source snapshots. A running browser and
an in-progress human CAPTCHA session are still process resources and cannot be
recovered from Storage alone. The current household UI cannot resume a stopped
worker session. Portal URLs still need explicit configuration for a hosted
environment; localhost defaults and local Chromium are development/runtime
configuration concerns, not cloud persistence. This work is not a deployment or
a deployment-readiness assertion.

## Verification

After building the core and db packages, run the unit suite and both Next builds.
Use a separate `NEXT_DIST_DIR` for production builds while a dev server is active.

- `node node_modules/vite-node/vite-node.mjs scripts/check-cloud-persistence.mjs`
  exercises real Supabase with unique synthetic records and exact cleanup.
- `node scripts/check-cloud-household-browser.mjs` uses a local production server
  on localhost:3300 to verify cloud plan/approval persistence across restart and
  owned private evidence access. It makes no booking submission.
- The existing household Playwright journey uses isolated local test stores.

Both cloud checks read `.env.local` privately. Their evidence and exit codes are
written under `.data/cloud-persistence-20261023`. Never print environment values
or signed evidence URLs in test reports.

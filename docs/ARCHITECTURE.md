# ReCircuit — Architecture

Autonomous reverse-logistics agent for household recycling.
Status: **design (Stage 0)**. Nothing below is implemented yet; see `STATUS.md`.

## 1. Design principles

1. **The LLM interprets; code decides.** The LLM parses text, reads messy policy pages and explains plans. Eligibility, money, approval and state transitions are deterministic TypeScript in `packages/core`, unit-tested without any network. Eligibility, pricing, and routing (Stage 5) MUST use canonical taxonomy categories (the 16 canonical categories defined in `CANONICAL_CATEGORIES` via `isCanonicalCategory`), never coarse domain categories (`ItemCategory`).
2. **No evidence, no transition.** Every leg state change goes through `transitionState()`, which rejects a move whose required evidence is missing.
3. **The browser acts on real pages.** Booking and verification happen by driving the mock recycler websites in Browserbase sessions (or local Playwright in offline dev). The ReCircuit agent and verifier never call portal JSON APIs; they operate HTML pages via browser.
4. **Fail closed.** Extraction failure, timeout, missing reference or tracking mismatch stops the leg in a visible state (`FAILED`, `NEEDS_HUMAN`, or stays put). It never reports success it did not observe.
5. **Small, one language.** TypeScript end to end, npm workspaces, three deployable apps, one database.

## 2. System overview

```
                ┌──────────────────────────── apps/web (Next.js, Vercel) ───────────────────────────┐
 Household ───▶ │ Intake · Items · Eligibility matrix · Plan comparison · Approval card · Proof      │
                │ Ledger timeline · Agent trace · Metrics · /test-cases · Demo reset · Replay        │
                └───────────────┬───────────────────────────────────────────────▲───────────────────┘
                                │ API routes write jobs                         │ Realtime / polling
                                ▼                                               │
                ┌──────────────────────────── Supabase (Postgres + Storage) ─────┴──────────────────┐
                │ requests · items · recyclers · recycler_policies · plans · plan_legs · approvals  │
                │ browser_actions · status_events · test_runs · jobs · agent_trace · storage/evidence│
                └───────────────┬───────────────────────────────────────────────▲───────────────────┘
                                │ worker claims jobs (SELECT … FOR UPDATE SKIP LOCKED)│ writes evidence
                                ▼                                               │
                ┌──────────────────────────── apps/worker (Node, Railway/Render) ───────────────────┐
                │ Orchestrator (explicit state machine)                                             │
                │  ├─ IntakeParser      (LLM, fast model)  → zod-validated items                    │
                │  ├─ PolicyReader      (Stagehand extract) → zod-validated policy + screenshot     │
                │  ├─ core.eligibility  (deterministic)                                             │
                │  ├─ core.routing      (deterministic plan enumeration + scoring)                  │
                │  ├─ core.approval     (deterministic gate, plan-hash binding)                     │
                │  ├─ Booker            (Stagehand act + Playwright fallback, idempotency)          │
                │  └─ Verifier          (NEW Browserbase session, reads /track)                     │
                └───────────────┬───────────────────────────────────────────────────────────────────┘
                                │ Browserbase cloud browsers (live view + replay)
                                ▼
                ┌──────────────────── apps/portals (Next.js, 3 Vercel deployments) ─────────────────┐
                │ Deccan E-Cycle      PaperPlus Kabadi (CAPTCHA)      QuickScrap Hyd (unregistered) │
                │ home · policy · fees · book · confirmation · track · /admin (simulated events)   │
                └───────────────────────────────────────────────────────────────────────────────────┘
```

Browserbase browsers run in the cloud, so **the portals must be publicly reachable** (deployed) for any real browser run. Local development uses local Playwright (`BROWSER_MODE=local`) against `localhost` portals.

## 3. Repository layout (planned)

```
recircuit/
  apps/
    web/        Next.js dashboard + API routes (no long-running work)
    portals/    Next.js mock recycler sites; RECYCLER_ID env selects Deccan / PaperPlus / QuickScrap
    worker/     Node agent worker: orchestrator, browser tools, verifier
  packages/
    core/       Pure TS: domain types, state machine, evidence rules, eligibility,
                pricing, routing, approval, idempotency keys, metrics. Zero I/O.
    db/         Supabase client, typed queries, job queue helpers
    llm/        Provider wrapper, prompts, zod schemas, mockable for tests
  supabase/
    migrations/ SQL schema (agent tables + portal tables in schema `portal`)
    seed.sql    Recyclers + dated CPCB snapshot entries (synthetic)
  tests/
    e2e/        Playwright end-to-end against local portals
  docs/
```

Why three portal deployments from one codebase: each gets its own origin and URL (credible "three different websites"), layouts differ per `RECYCLER_ID`, and there is only one code path to maintain.

## 4. Components

| Component | Responsibility | Uses LLM? | Key outputs |
| --- | --- | --- | --- |
| IntakeParser | Text → `{location, feeCapInr, items[]}`; confidence per field; `NEEDS_CLARIFICATION` when low | Yes (fast model) | `items`, trace event |
| PolicyReader | Open each recycler site, find policy/fee pages, extract with schema; retry once, then fail safe | Yes (via Stagehand extract) | `recycler_policies` row + screenshot + session/replay id |
| core.eligibility | Item × recycler → `ACCEPTED / REJECTED / UNKNOWN` with reason quoting extracted rule. Evaluated strictly using canonical taxonomy categories (16 categories via `isCanonicalCategory`), never coarse `ItemCategory` | No | matrix |
| core.pricing | Fees (incl. weight-based fee tiers), payouts, minimums, net | No | per-leg money |
| core.routing | Enumerate feasible assignments (≤ 3 recyclers ⇒ ≤ 27 for 3 items), score deterministically, explain | No | `plans` + `plan_legs` |
| core.approval | Decide if approval is required and why; bind approval to `plan_hash`; invalidate on change | No | `approvals` |
| Booker | Navigate booking page, fill fields, detect human-verification, submit, capture reference + screenshot. Operates via browser HTML form filling; never calls portal JSON APIs | Stagehand act; Playwright fallback | `browser_actions`, `REQUEST_SUBMITTED` |
| Verifier | Fresh session, `/track?ref=…`, compare observed vs intended. Operates via browser HTML inspection; never calls portal JSON APIs | Extraction only | `REQUEST_CONFIRMED` / `PICKUP_SCHEDULED` / mismatch |
| Downstream poller | Re-reads tracking page for admin-simulated events (picked up, weight) | No | `PICKED_UP`, `WEIGHED` (labelled SIMULATED) |
| Test runner | Executes TC1–TC4 scenarios, computes pass/fail from results | No | `test_runs` |

## 5. State machine (summary)

Two levels:

- **Request pipeline:** `DRAFT → ITEMS_PARSED → RECYCLERS_DISCOVERED → POLICIES_READ → ELIGIBILITY_CHECKED → PLAN_CREATED → AWAITING_APPROVAL → APPROVED` (plus `NEEDS_CLARIFICATION`, `FAILED`).
- **Leg lifecycle (per recycler booking):** `APPROVED → SUBMITTING → (NEEDS_HUMAN ⇄ SUBMITTING) → REQUEST_SUBMITTED → REQUEST_CONFIRMED → PICKUP_SCHEDULED → PICKED_UP → WEIGHED → RECEIVED_AT_RECYCLER → PROCESSED → RECYCLED → CERTIFICATE_ISSUED`, with `REJECTED` and `FAILED` exits.

Evidence required per transition (enforced in `packages/core`):

| Transition | Required evidence type |
| --- | --- |
| → `POLICIES_READ` | `policy_extract` (url, screenshot, extractedAt, sessionId) for each recycler used |
| → `AWAITING_APPROVAL` | `plan` (planId, planHash, approvalReason) |
| → `APPROVED` | `user_approval` (approvalId, planHash matching current plan) |
| → `SUBMITTING` | `idempotency_key` not previously used for a successful submit |
| → `NEEDS_HUMAN` | `human_verification_detected` (selector/text, screenshot, liveViewUrl) |
| → `REQUEST_SUBMITTED` | `form_submission` (confirmation screenshot, url) **and** `booking_reference` |
| → `REQUEST_CONFIRMED` | `tracking_lookup` from a **different session** showing the same reference |
| → `PICKUP_SCHEDULED` | `tracking_lookup` showing a slot |
| → `PICKED_UP` | `pickup_confirmation` (OTP/QR code shown on tracking page) — SIMULATED |
| → `WEIGHED` | `weight_ticket` (kg) — SIMULATED |
| → later states | recycler acknowledgement / processing record / certificate — FUTURE |

"Collected" in the UI maps only to `PICKED_UP` or later. Full table: `STATE_MACHINE.md` (Stage 1).

## 6. Idempotency and duplicate protection

- `idempotency_key = sha256(plan_hash + leg_id + recycler_id)`.
- `browser_actions` has a unique index on `(idempotency_key, action_type)` where `result = 'success'`.
- The booking form carries the key in a hidden `client_request_id` field; each portal stores it with a unique constraint and returns the **existing** reference on a repeat submit.
- Before resubmitting after a failure/timeout, the Booker first checks the tracking page by `client_request_id` lookup (`/track?client=`) to avoid double booking.

## 7. Approval model

Approval is required when any of: a booking will be submitted, any fee > 0, fee exceeds cap, recycler lacks registration in the dated snapshot, or the action is configured irreversible. Approval records store `plan_hash`; any plan change produces a new hash and invalidates the old approval. The Booker refuses to run unless `approvals.plan_hash == plans.plan_hash` and `decision = 'approved'`.

## 8. Human verification (CAPTCHA / OTP)

PaperPlus shows a simulated human-verification step marked `data-human-verification`. The Booker detects it, takes a screenshot, records `NEEDS_HUMAN` with the Browserbase **live view URL**, and polls (max N minutes) for the step to be completed by the user. It never fills or bypasses it.

## 9. LLM usage

| Task | Model class | Guardrail |
| --- | --- | --- |
| Item extraction, classification | Fast/cheap model | zod schema; confidence; invalid → retry once → `NEEDS_CLARIFICATION` |
| Policy extraction (Stagehand) | Fast/cheap model | zod schema; missing fee/accepts → `UNKNOWN`, never guessed |
| Plan explanation text | Stronger model (optional) | Explanation only; numbers come from core |

Provider and model names are environment variables (`LLM_PROVIDER`, `LLM_FAST_MODEL`, `LLM_STRONG_MODEL`). All LLM calls go through `packages/llm` so tests can inject fakes.

## 10. Deployment targets

| Part | Host | Notes |
| --- | --- | --- |
| apps/web | Vercel | Short API routes only |
| apps/portals ×3 | Vercel (3 projects, `RECYCLER_ID` env) | Must be public for Browserbase |
| apps/worker | Railway or Render | Long-running; polls `jobs` |
| Database, storage, realtime | Supabase | Free tier sufficient |
| Browsers | Browserbase | Partner credits |

## 11. Security

- Service-role key only in worker and server routes; never in the browser bundle.
- Synthetic personal data only (demo names/phones).
- Portal `/admin` protected by an `ADMIN_TOKEN` and labelled "Simulated downstream events".
- Structured JSON logs with request/leg ids; no secrets in logs.

# ReCircuit — Implementation Plan

Calendar: today is Sat 17 Oct 2026 (IST). Build & Submit opens Tue 20 Oct 11:00 IST and closes Fri 23 Oct (confirm exact time). Jury validation 23–26 Oct.

**Hard milestone:** core flow end to end (Stages 1–10) by **Wed 21 Oct night**. Nothing from Stage 11 starts before that.

## Order of work and why

The order builds the deterministic core first (cheap to test, never flaky), then the websites the agent needs, then the agent itself, then the proof and the UI. Each stage has its own tests and a gate.

| # | Stage | Depends on | Owner (suggested) | Target | Gate (must pass to continue) |
| --- | --- | --- | --- | --- | --- |
| 0 | Audit, docs, environment unblock | — | Manish | Sat 17 night | Toolchain installs; app + tests run locally |
| 1 | Data model + state machine (`packages/core`, migrations) | 0 | Manish | Sun 18 AM | All state-machine unit tests pass |
| 2 | Three mock portals + admin + reset | 0 | Nethra | Sun 18 | Each portal: submit, reference, track, dedupe, invalid rejected |
| 3 | Intake parser | 1 | Manish | Sun 18 PM | 7 parser tests pass with fake LLM; 3 live-LLM smoke runs |
| 4 | Policy discovery via browser | 2, 3 | Manish | Mon 19 | Policies for all 3 portals extracted with evidence; failure tests fail safe |
| 5 | Eligibility, pricing, split routing | 1 | Nirmal (core) | Mon 19 | TC1/TC2 logic tests, split plan beats single plan |
| 6 | Approval + safe actions | 5 | Nirmal | Mon 19 PM | TC3 logic + stale/modified/double approval tests |
| 7 | Browser booking agent | 4, 6 | Manish + Nethra | Tue 20 | ≥ 2 real browser bookings; CAPTCHA handoff; no duplicate on retry |
| 8 | Verifier + Proof Ledger | 7 | Manish | Tue 20 PM | New-session verification; TC4 cannot overclaim |
| 9 | Dashboard + agent trace + metrics | 5–8 | Nirmal | Tue 20 – Wed 21 | One request readable without logs |
| 10 | Official test suite `/test-cases` | 9 | Nirmal | Wed 21 | TC1–TC4 PASS computed from runs → **scope freeze** |
| 11 | Optional (max 2–3): CPCB badge, data-wipe checklist, Telugu/Tamil intake | 10 | Any | Thu 22 AM | Isolated; core tests still green |
| 12 | Failure hardening | 10 | Manish | Thu 22 | Failure matrix passes; no fabricated success |
| 13 | Deployment | 2, 10 | Nethra | Wed 21 – Thu 22 | Clean-browser smoke test on public URLs |
| 14 | Final verification | 12, 13 | All | Thu 22 night | lint, typecheck, unit, integration, build, smoke all recorded |
| 15 | Demo prep + replay mode | 14 | Nirmal | Fri 23 AM | 4-minute script rehearsed twice; replay labelled |

Stages 2 and 5–6 run in parallel with Stages 1/3/4 because they touch different packages.

## Stage details (what "done" means)

**Stage 1.** `packages/core`: `State`, `EvidenceType`, `TRANSITIONS`, `EVIDENCE_REQUIRED`, `canTransition(from, to, evidence)`, `transitionState(leg, to, evidence, store)` returning an audit event. Idempotency key builder. SQL migrations for all required tables plus `jobs` and `agent_trace`. Tests: valid path, invalid jumps (incl. `REQUEST_SUBMITTED → PICKED_UP`), missing evidence, wrong-session verification, duplicate action key.

**Stage 2.** `apps/portals` with three visibly different layouts. Server persistence in schema `portal`. Booking validation (pincode, phone, items allowed by that recycler, PaperPlus 5 kg minimum). `client_request_id` dedupe. `/track` by reference. `/admin` (token) to confirm, schedule, mark picked up (OTP shown on tracking page), enter weight. `POST /api/reset`. Tests via HTTP + Playwright.

**Stage 3.** Prompt + zod schema; units normalised (₹, kg, counts); defaults never invented (missing weight → `estimatedWeightKg` from a fixed lookup table labelled `estimated`, missing location → clarification). Tests use a fake LLM returning fixtures, including malformed JSON.

**Stage 4.** Stagehand `extract` with zod schemas per page; page discovery via `observe` on nav links; screenshot to Supabase Storage; session id + replay URL stored. Retry once, then `POLICY_UNREADABLE` → recycler excluded with reason. Tests: three portals; portal variants served with `?variant=malformed|nofee|changed` to simulate changes.

**Stage 5.** Matrix from policies only. Pricing: Deccan fee ₹180 if e-waste < 5 kg else 0; payouts per item; PaperPlus ₹12/kg, min 5 kg; QuickScrap ₹199 flat. Routing: enumerate all assignments, drop invalid (rejected/unknown item, minimum unmet), score = lexicographic (all items routed, no registration warning, cap respected, lower fee, higher net, fewer stops). Explanation strings generated from the scoring trace.

**Stage 6.** Approval reasons computed in core; approval bound to `plan_hash`; API refuses booking without matching approval. Tests: approve, reject, modified plan, stale approval, double approval (idempotent).

**Stage 7.** Booker per leg: key → open site → booking page → fill → verify field values read back → detect `data-human-verification` → `NEEDS_HUMAN` + live view → resume → submit → screenshot → extract reference (regex + schema). Playwright selectors as fallback on our own portals. Tests: normal, CAPTCHA, retry (no duplicate), portal 500, garbage confirmation, missing reference.

**Stage 8.** Verifier in a separate module and Browserbase session; compares reference, items, slot; mismatch → stays `REQUEST_SUBMITTED` with "could not verify yet". Ledger UI with screenshot and session links. TC4 tests.

**Stage 9.** Dashboard at `/r/[requestId]`: request, items, trace, matrix, plans, approval card, ledger, metrics (all computed from DB; demo data labelled).

**Stage 10.** `/test-cases` runs scenarios through the real pipeline (portals + browser in live mode; local Playwright in CI mode) and stores `test_runs`. PASS computed by assertions on stored results.

**Stages 11–15** as in the brief.

## Environment prerequisites (blocking Stage 0 exit)

1. Package installs: this cloud session cannot reach the npm registry (see `STATUS.md`). Either allow it, or build on a team laptop / linked computer.
2. Accounts and keys: Supabase project, Browserbase API key + project id, one LLM API key, Vercel, Railway/Render.
3. Outbound access from wherever the worker and tests run to: Supabase, Browserbase, the LLM API, and the deployed portals.

## Testing strategy

| Layer | Tool | Runs where | Network |
| --- | --- | --- | --- |
| Unit (core, parser with fake LLM) | Vitest | Anywhere | None |
| Portal integration | Vitest + fetch, Playwright | Local | Localhost only |
| Agent integration (local browser) | Playwright, `BROWSER_MODE=local` | Local / CI | LLM API (or fake) |
| Live agent run | Browserbase + Stagehand | Worker | All services |
| Smoke (deployed) | Playwright script | Any clean machine | Public URLs |

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Environment blocks installs | Resolve before Stage 1; build on a laptop if needed |
| Stagehand flakiness on stage | Our own portals have stable `data-testid`s for Playwright fallback; replay mode |
| Browserbase cannot reach localhost | Deploy portals early (Stage 2 end) |
| LLM rate limits / cost | Fast model; cache policy extraction per page hash |
| Scope creep | Stage 11 locked until TC1–TC4 pass |

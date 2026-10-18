# ReCircuit — Hackathon Requirements and Traceability

Sources: official problem brief ("E-waste & Recycling Pickup Coordinator", Social Impact & Sustainability AI), hackathon rules, and the team build spec. Status column is updated as stages complete; nothing is PASS until a test run proves it.

Status legend: `NOT STARTED` · `IN PROGRESS` · `PASS` · `PARTIAL` · `FAIL`

## A. Official brief

| ID | Requirement (official) | Feature | Component | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| O-1 | Collect item type, quantity, location; stable IDs; validate before agent runs | Intake parser + validation | `packages/core` intake, `packages/llm` schema, `items` table | `intake.test.ts` (14 cases) | Parsed items JSON stored per request with stable RFC4122 v4 UUIDs | PASS |
| O-2 | Retrieve from recycler sites and pickup forms; store source URLs and retrieval times | Policy discovery | PolicyReader (Playwright/Stagehand) | `policy-reader.test.ts`, `policies.spec.ts` | `recycler_policies.source_url`, `extracted_at`, screenshot | PARTIAL (Local Playwright discovery verified; Browserbase cloud pending keys) |
| O-3 | Match accepted materials and fees; save evidence and reason; uncertain state when evidence missing | Eligibility + pricing | `core/eligibility`, `core/pricing` | `routing.test.ts` (13 tests) | Matrix cell reason quotes extracted rule; `UNKNOWN` state | PASS |
| O-4 | Book pickup after approval; show destination and change first; store approved version; no duplicate on retry | Approval gate + Booker + idempotency | `core/approval`, Booker, `approvals`, `browser_actions` | `approval.test.ts`, `booker.test.ts` | Approval record with `plan_hash`; one portal booking per key | PARTIAL (Approval gate complete; browser booking execution is Stage 7) |
| O-5 | Verify separately from the action; capture observed vs intended; keep failed/pending visible | Independent verifier | Verifier (new session) | `verifier.test.ts` | `status_events` with tracking screenshot and different session id | NOT STARTED |
| O-6 | Result view: pickup plan traceable to input record; unresolved items shown | Dashboard + Proof Ledger | `apps/web` `/r/[id]` | E2E dashboard test | Screenshot of dashboard | NOT STARTED |
| O-7 | Four labelled runs with input, expected, actual, evidence; explain differences | Test-case page | `apps/web` `/test-cases`, `test_runs` | Stage 10 suite | `test_runs` rows | NOT STARTED |
| O-8 | Human approval before hard-to-undo actions | Approval gate | `core/approval` | `approval.test.ts` | Booker refuses without matching approval | PASS |
| O-9 | Synthetic data for personal info | Demo data | Seed + forms | Review | Seed file | NOT STARTED |
| O-10 | Do not bypass OTP or CAPTCHA; safe manual step | Human handoff | Booker detection, PaperPlus verification step | `booker.captcha.test.ts` | `NEEDS_HUMAN` event with screenshot and live view link | NOT STARTED |
| O-11 | Deployed working agent, source evidence, presentation, test cases (mandatory submission) | Deployment, README, deck | All | Stage 13–14 smoke | Public URLs, repo, deck | NOT STARTED |

## B. Official test cases

| ID | Scenario → expected | Input (canonical) | Pass condition (computed) | Component | Test | Status |
| --- | --- | --- | --- | --- | --- | --- |
| TC1 | Old laptop accepted → pickup draft created | "One dead Dell laptop, Kukatpally, Hyderabad, max fee ₹200" | Deccan cell = ACCEPTED with quoted rule; a plan leg exists in `AWAITING_APPROVAL` or later; on approval leg reaches `REQUEST_SUBMITTED` with reference; states DRAFT/SUBMITTED/CONFIRMED/COLLECTED distinct | core + Booker | `tc1.test.ts` + `routing.test.ts` | IN PROGRESS (Building blocks verified in routing; booking execution is Stage 7) |
| TC2 | Centre takes paper but not batteries → batteries rejected | "2 batteries and 8 kg newspaper" | PaperPlus×battery = REJECTED with reason; no leg assigns batteries to PaperPlus; batteries routed to an accepting recycler if one exists | core/eligibility, routing | `tc2.test.ts` + `routing.test.ts` | IN PROGRESS (Building blocks verified in routing; split plan Deccan + PaperPlus generated) |
| TC3 | Fee above user's limit → approval asked | Deccan leg fee ₹180, cap ₹150 | Plan `approval_required = true` with reason `FEE_CAP_EXCEEDED`; zero `browser_actions` of type `submit` before an approval with matching hash | core/approval, Booker | `tc3.test.ts` + `routing.test.ts` | IN PROGRESS (Building blocks verified in routing; fee ₹180 > ₹150 cap flags FEE_CAP_EXCEEDED) |
| TC4 | Pickup requested → not reported as collected | Any submitted booking | Leg state ∈ {REQUEST_SUBMITTED, REQUEST_CONFIRMED, PICKUP_SCHEDULED}; UI "Collected" disabled; `transitionState(→PICKED_UP)` without `pickup_confirmation` throws | core/state, Verifier, UI | `tc4.test.ts` | IN PROGRESS (State machine invariants enforced; Verifier is Stage 8) |

## C. Product spec (P0)

| ID | P0 requirement | Component | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| P0-1 | Natural-language intake | `packages/core` intake + `packages/llm` | `intake.test.ts` (14 cases) | parsed request + items JSON | PASS |
| P0-2 | Structured item extraction | `packages/core/src/intake` | `intake.test.ts` | canonical items JSON with taxonomy and weights | PASS |
| P0-3 | City/location input | `packages/core/src/intake/localities` | `intake.test.ts` | locality + Hyderabad pincode resolution | PASS |
| P0-4 | Fee-cap input | `packages/core/src/intake/post-processor` | `intake.test.ts` | `feeCapInr` anti-hallucination validation | PASS |
| P0-5 | Three recycler portals, different layouts | apps/portals | portal unit + Playwright E2E | 3 local ports (3101, 3102, 3103), verified | PASS |
| P0-6 | Browser policy discovery & extraction | apps/worker + packages/core | `policy.test.ts`, `policy-reader.test.ts`, `policies.spec.ts` | local Playwright session discovery, verbatim quote validation, anti-hallucination checks, and `POLICY_UNREADABLE` fail closed | PARTIAL (Local mode complete; Browserbase cloud pending keys) |
| P0-7 | Evidence capture (screenshots + sessions) | apps/worker session + `PolicyEvidence` | `policies.spec.ts` | screenshot written to `.data/evidence`, sessionId + url in PolicyEvidence | PARTIAL (Local evidence complete; Supabase storage pending keys) |
| P0-8 | Eligibility matrix | core/eligibility + UI | `routing.test.ts` | matrix generated in CLI and routing tests with quoted rules | PASS |
| P0-9 | Cost/payout calculations | core/pricing | `routing.test.ts` | pricing engine totals, fees, and 15% proximity threshold warnings | PASS |
| P0-10 | Multi-recycler split routing | core/routing | `routing.test.ts` | split plan chosen in demo (Deccan + PaperPlus) | PASS |
| P0-11 | Plan comparison | core/routing + UI | `routing.test.ts` | 7-tier lexicographic ranking across alternative candidate plans | PASS |
| P0-12 | Explicit approval gate | core/approval + UI | `approval.test.ts` | `ApprovalCard`, `assertActionAllowed`, `npm run approve` CLI | PASS |
| P0-13 | Browser form filling | Booker | booker tests | session replay | NOT STARTED |
| P0-14 | Browser submission | Booker | booker tests | confirmation screenshot | NOT STARTED |
| P0-15 | Human CAPTCHA/OTP handoff | Booker | captcha test | NEEDS_HUMAN event | NOT STARTED |
| P0-16 | Idempotency protection | core + portal dedupe | retry test | single portal booking verified (portal dedupe only; agent-side idempotency is Stage 7) | PARTIAL |
| P0-17 | Booking-reference capture | Booker | missing-ref test | reference in event | NOT STARTED |
| P0-18 | Independent verifier | Verifier | verifier tests | different session id | NOT STARTED |
| P0-19 | Proof Ledger | web ledger | E2E | ledger screenshot | NOT STARTED |
| P0-20 | Status timeline | web ledger | E2E | timeline screenshot | NOT STARTED |
| P0-21 | Four official test cases | `/test-cases` | Stage 10 | test_runs | NOT STARTED |
| P0-22 | Agent metrics | core/metrics + UI | metrics tests | metrics panel (DEMO DATA label) | NOT STARTED |
| P0-23 | Public deployment | Vercel/Railway/Supabase | smoke test | URLs | NOT STARTED |
| P0-24 | README | repo | review | README.md | NOT STARTED |
| P0-25 | Demo reset mechanism | portals `/api/reset` + web reset | reset test | clean state after reset verified | PASS |

## D. Safety and development rules

| ID | Rule | Enforcement point | Test | Status |
| --- | --- | --- | --- | --- |
| S-1 | LLM never decides money, eligibility or state | core is LLM-free; LLM output only through zod schemas | code review + unit tests | PASS |
| S-2 | Never invent acceptance rules | Missing extract → `UNKNOWN` | `routing.test.ts` | PASS |
| S-3 | No transition without evidence | `transitionState` | state tests | PASS |
| S-4 | Retry never double-books | idempotency key + portal dedupe | retry test | IN PROGRESS |
| S-5 | CAPTCHA/OTP → human handoff only | Booker detection | captcha test | NOT STARTED |
| S-6 | Browser failures fail safe | retry limits, timeouts | hardening suite | NOT STARTED |
| S-7 | No keys in client or repo | env vars, `.env.example` | secret scan in CI | PASS |
| S-8 | Auditable actions | `agent_trace`, `browser_actions`, `status_events` | audit test | IN PROGRESS |
| S-9 | Simulated downstream events labelled | admin + tracking badges | UI & Playwright review | PASS |
| S-10 | No fabricated metrics; demo data labelled | metrics computed from DB | metrics test | NOT STARTED |

## E. Judging criteria coverage

| Criterion (points) | Where it is demonstrated |
| --- | --- |
| Problem fit & usefulness (20) | TC1–TC4 page; mixed household request |
| Agentic capability (25) | Agent trace: read → decide → ask → act → verify across 3 sites |
| Technical implementation (20) | State machine with evidence, idempotency, independent verifier |
| Innovation (15) | Split routing + Proof Ledger |
| User experience (10) | Dashboard, approval card, timeline |
| Presentation (10) | DEMO_SCRIPT.md, replay mode |

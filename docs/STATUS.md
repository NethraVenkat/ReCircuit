# ReCircuit — Build Status

## Stage 1 — Data Model + State Machine (Completed)

| Area | Status |
|---|---|
| Monorepo scaffold (npm workspaces) | ✅ Done |
| Root tsconfig, ESLint, Vitest | ✅ Done |
| `npm run build` (tsc emitting to dist/) | ✅ Done |
| `.gitignore`, `.env.example` | ✅ Done |
| `packages/core` — domain types (`feeCapInr`, RequestState, LegState) | ✅ Done |
| `packages/core` — Zod evidence schemas | ✅ Done |
| `packages/core` — state machine (Request pipeline + Leg lifecycle) | ✅ Done |
| `packages/core` — stale approval enforcement in `transitionState` | ✅ Done |
| `packages/core` — terminal states refusal (no exits) | ✅ Done |
| `packages/db` — placeholder | ✅ Done |
| `supabase/migrations/0001_init.sql` | ✅ Done |
| `supabase/seed.sql` (3 recyclers) | ✅ Done |
| `docs/STATE_MACHINE.md` | ✅ Done |
| Vitest tests — state machine (85 tests) | ✅ Done |

## Stage 2 — Mock Recycler Portals (Fixes & Audit Completed)

| Component / Requirement | Status |
|---|---|
| 3 distinct recycler sites (`deccan`, `paperplus`, `quickscrap`) | ✅ Done |
| Cross-platform launcher script `npm run portals:dev` | ✅ Done |
| `BookingRepository` — `FileRepository` (concurrency-locked, atomic writes) | ✅ Verified in tests |
| `BookingRepository` — `SupabaseRepository` (`0002_portal.sql`) | 🟡 UNTESTED until Supabase is configured |
| Public tracking endpoint `GET /api/bookings?ref=<ref>` | ✅ Done |
| ADMIN_TOKEN security: 503 "Admin disabled" when unset; timingSafeEqual auth | ✅ Done |
| Site selection: production requires `RECYCLER_ID`; cross-recycler 404s enforced | ✅ Done |
| Stateless HMAC CAPTCHA with SVG vector paths & nonce replay protection | ✅ Done |
| QuickScrap notice "Registration: application in process" + accordions | ✅ Done |
| Playwright E2E browser suite (`tests/e2e/portals.spec.ts` - 10 tests including Axe a11y & XSS) | ✅ Done |
| Vitest unit suite (`apps/portals/src/test/portal.test.ts` - 35 tests) | ✅ Done |
| Idempotency protection (P0-16) | 🟡 PARTIAL (portal dedupe only; agent-side idempotency is Stage 7) |

## Stage 3 — User Intake + Item Classification (Completed & Audited)

| Component / Requirement | Status |
|---|---|
| `packages/llm` — provider-agnostic `generateStructured` | ✅ Done (Anthropic, OpenAI, Fake adapters) |
| `packages/llm` — typed `LlmConfigurationError` on missing key & 429 exponential backoff with jitter | ✅ Done |
| `packages/llm` — auto-retry on malformed JSON or schema error; typed `LlmOutputError` | ✅ Done |
| `packages/core/src/intake/taxonomy.ts` — 16 canonical categories, 9 groups, 1-to-1 bijection with ItemCategory | ✅ Done |
| `packages/core/src/intake/localities.ts` — Hyderabad demo locality + pincode mapping | ✅ Done |
| `packages/core/src/intake/schema.ts` — Zod schemas for proposal and validated result | ✅ Done |
| `packages/core/src/intake/post-processor.ts` — anti-hallucination unit-context checks (`feeAppearsInCurrencyContext`, `weightAppearsInWeightContext`, `quantityAppearsInQuantityContext`) | ✅ Done |
| `packages/core/src/intake/post-processor.ts` — out-of-city rejection, missing paper weight check, vague item fallback | ✅ Done |
| `packages/core/src/intake/post-processor.ts` — `applyClarification` resolution and state transition | ✅ Done |
| `packages/core/src/intake/post-processor.ts` — dynamic mapping to domain Request category & hazardClass | ✅ Done |
| TypeScript RFC4122 v4 UUID assignment (never LLM) | ✅ Done |
| CLI `npm run intake -- "<text>"` | ✅ Done |
| Vitest tests — intake & classification (`intake.test.ts` - 22 tests, `llm.test.ts` - 6 tests) | ✅ Done |
| Embedded PostgreSQL migrations & schema verification (`migrations.test.ts` - 5 tests) | ✅ Done |

## Stage 4 — Browser Policy Discovery + Fixes (Completed)

| Component / Requirement | Status | Notes |
|---|---|---|
| Part A — Portals Reachability / Vercel Deployment | 🟡 LOCAL ONLY | Vercel CLI unauthenticated (`npx vercel login`); Supabase NOT CONFIGURED |
| `docs/DEPLOYMENT.md` & `.env.example` portal URLs | ✅ Done | Documented architecture, local defaults, and deployment commands |
| `apps/worker/src/browser/session.ts` | ✅ Done | OpenSession supports local Playwright & cloud Browserbase; local sessions prefixed `local-` |
| `@browserbasehq/stagehand` installation | ✅ Done | Strict `ConfigurationError` on missing Browserbase/LLM keys |
| `apps/worker/src/policy/discovery.ts` | ✅ Done | Discovers policy/rates links via DOM navigation (capped at 4 pages) |
| Generic Policy Extraction Schema (PRIMARY) | ✅ Done | AI extraction path with zero site-specific fields |
| Anti-Hallucination Validator (`anti-hallucination.ts`) | ✅ Done | Verbatim quote check in page text + numbers-in-quotes grounding check |
| Category Mapper (`mapRawNameToCanonicalCategories`) | ✅ Done | Pure TypeScript mapping from raw strings to canonical taxonomy |
| Honest Ground-Truth Fixtures (`portal-fixtures.ts`) | ✅ Done | Real captured page text and verified extractions for Deccan, PaperPlus, QuickScrap |
| Static HTML Fixture for Unseen Recycler (`greenloop.html`) | ✅ Done | Verified generic extraction on unseen recycler GreenLoop Secunderabad |
| Admin Failure Switch `hideFeeInfo` in `apps/portals` | ✅ Done | Returns partial extraction with `feesUnknown: true` |
| Labeled DOM Fallback (`extractionPath: "dom-fallback"`) | ✅ Done | Labeled fallback when AI path fails anti-hallucination |
| Policy Persistence & State Machine Transition | ✅ Done | Request transition `RECYCLERS_DISCOVERED` -> `POLICIES_READ` with evidence |
| Playwright E2E tests (`policies.spec.ts` - 5 tests) | ✅ Done | Live browser discovery, quote grounding, and failure switches (100% passing) |

## Stage 5 — Eligibility, Pricing, and Split Routing Engine (Completed)

| Component / Requirement | Status | Notes |
|---|---|---|
| Deterministic Eligibility Matrix (`core/routing/eligibility.ts`) | ✅ Done | Pure TypeScript mapping; pincode service area check; verbatim quote citation |
| Pricing Engine (`core/routing/pricing.ts`) | ✅ Done | Evaluates pickup fees, payouts, minimum weight, and preserves null for unstated |
| Weight Threshold Proximity (15% Rule) | ✅ Done | Warns when estimated weight is within 15% below threshold |
| Combinatorial Split Router (`core/routing/router.ts`) | ✅ Done | Evaluates item-to-recycler assignments, capped at 5,000 combinations |
| 7-Tier Lexicographic Plan Ranking | ✅ Done | Coverage > Warnings > Fee Cap > Lowest Fee > Highest Payout > Fewer Legs > Stable Tiebreak |
| Approval Gate Triggers | ✅ Done | Triggers `FEE_CAP_EXCEEDED`, `FEE_CHARGED`, `REGISTRY_WARNING`, `ESTIMATED_WEIGHT_NEAR_THRESHOLD` |
| SHA-256 Plan Hashing (`hashPlan`) | ✅ Done | Canonical hash for approval gate locking |
| State Machine Transitions | ✅ Done | Transitions `POLICIES_READ` -> `ELIGIBILITY_CHECKED` -> `PLAN_CREATED` |
| CLI Runner (`npm run plan`) | ✅ Done | Generates full plan, eligibility matrix, alternatives, and transitions from demo text |
| Vitest tests (`routing.test.ts` - 21 tests) | ✅ Done | TC1, TC2, TC3 building blocks, boundaries, and 500 property tests |
| Total Vitest tests: 201 passing across 8 files | ✅ Done | 0 warnings, 0 failures |
| Total Playwright E2E tests: 15 passing across 2 files | ✅ Done | 100% passing |

## Stage 6 — Approval Gate + Safe Action System (Completed)

| Component / Requirement | Status | Notes |
|---|---|---|
| Request State Machine Transitions (`requestApproval`, `recordDecision`) | ✅ Done | `PLAN_CREATED` -> `AWAITING_APPROVAL` -> `APPROVED` / `REJECTED` |
| Mandatory `BOOKING_SUBMISSION` Reason | ✅ Done | Every plan requires approval regardless of fee or cap |
| Slot Preferences (`{ day, window }`) | ✅ Done | Stored on Request/Plan and included in `hashPlan` canonicalization |
| Stale Approval Invalidation | ✅ Done | Plan or slot alterations change `planHash`, rendering prior approvals stale |
| Comprehensive Approval Card | ✅ Done | Domain model (`ApprovalCard`) and formatted CLI presentation |
| Deterministic Decision Recording | ✅ Done | `recordDecision` creates approved legs with idempotency keys; idempotent on duplicates |
| Safe Action Entry Point (`assertActionAllowed`) | ✅ Done | Enforces valid leg state, approved user decision, `planHash` match, unused idempotency key, and price parity |
| Fee Changed Guard (`FeeChangedReapprovalRequiredError`) | ✅ Done | Throws `FEE_CHANGED_REAPPROVAL_REQUIRED` if page fee differs from approved fee |
| Append-Only Action Audit Log | ✅ Done | Writes all allowed and blocked attempts to `.data/action-log.jsonl` |
| CLI Runners (`npm run plan`, `npm run approve`) | ✅ Done | `plan` persists to `.data/requests/<id>.json`; `approve` supports approve, reject, and `--choose-plan=<rank>` |
| Vitest tests (`packages/core/src/approval/approval.test.ts` - 12 tests) | ✅ Done | 10 required scenarios + slotPreference & card format |

## Stage 7 — Browser Booking Agent (Completed)

| Component / Requirement | Status | Notes |
|---|---|---|
| Domain Types & Routes (`apps/worker/src/booking/types.ts`, `selectors.ts`) | ✅ Done | Type contracts, routes, and reference validation regexes |
| Safe Action Pre-Flight Gate (`assertActionAllowed`) | ✅ Done | Verifies leg state, user approval, planHash match, unused idempotencyKey, and fee parity |
| Pure Browser HTML Form Filling | ✅ Done | Operates via Playwright browser page; never calls portal JSON APIs directly |
| DOM Readback Verification (`FormVerificationError`) | ✅ Done | Verifies live DOM input values match intended payload before submission |
| Human Verification Handoff (`NEEDS_HUMAN`) | ✅ Done | Rule S-5: Halts on CAPTCHA, captures proof screenshot & liveViewUrl, never guesses codes |
| Resumption Flow (`resumeLegWithCaptcha`) | ✅ Done | Resumes from `NEEDS_HUMAN` upon human-provided code and advances to `REQUEST_SUBMITTED` |
| Reference Extraction & Pattern Enforcement | ✅ Done | Extracts reference and asserts prefix regex; rejects omitted or malformed references |
| Server Outage & Failure Safety (`PortalServerError`) | ✅ Done | Detects HTTP 500 error banner and fails safe without advancing leg state |
| Idempotency Protection & Deduplication | ✅ Done | Injects deterministic `client_request_id`; marks `isDuplicate: true` on repeat submissions |
| State Machine Transitions & Audit Events | ✅ Done | Orchestrates `APPROVED -> SUBMITTING -> (NEEDS_HUMAN) -> REQUEST_SUBMITTED` |
| CLI Runner (`npm run book`) | ✅ Done | Interactive runner executing bookings and resuming CAPTCHA challenges from terminal |
| Vitest Unit & Integration Tests (`apps/worker/src/booking/booker.test.ts` - 12 tests) | ✅ Done | 12 test cases covering safe actions, readback, CAPTCHA, outages, references, and duplicates |
| Total Vitest tests: 225 passing across 10 files | ✅ Done | 0 warnings, 0 failures |
| Total Playwright E2E tests: 15 passing across 2 files | ✅ Done | 100% passing |

## Known Issues & Security Audit Findings

- `FileRepository` writes to local filesystem and does not persist on Vercel serverless; production deployment needs Supabase (`SUPABASE_URL` not yet configured).
- Vercel CLI is unauthenticated; portals run locally on ports 3101, 3102, 3103.
- Cloud Browserbase requires deployed public portal URLs and `BROWSERBASE_API_KEY`; local Playwright mode (`BROWSER_MODE=local`) runs offline.
- **Next.js & PostCSS Security Audit Notice**:
  - `npm audit --omit=dev` flags 2 package vulnerabilities in `apps/portals`: `next` (9.3.4-canary.0 to 16.3.0-preview.10; advisories GHSA-9g9p-9gw9-jx7f, GHSA-h25m-26qc-wcjf, GHSA-ggv3-7p47-pfv8, GHSA-3x4c-7xq6-9pq8, GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj, GHSA-3g8h-86w9-wvmq, GHSA-ffhc-5mcf-pf4q, GHSA-vfv6-92ff-j949, GHSA-gx5p-jg67-6x7h, GHSA-h64f-5h5j-jqjh, GHSA-c4j6-fc7j-m34r, GHSA-wfc6-r584-vfw7, GHSA-36qx-fr4f-26g5, GHSA-m99w-x7hq-7vfj, GHSA-89xv-2m56-2m9x, GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q, GHSA-4c39-4ccg-62r3, GHSA-p9j2-gv94-2wf4, GHSA-955p-x3mx-jcvp, GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4) and `postcss` (<=8.5.22; advisories GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849).
  - Next 14.2.x and 15.x do not provide backported patches for these advisories without upgrading to Next 16 (`next@16.4.2`), which requires React 19 and introduces breaking architectural changes. Because `apps/portals` does not use `next/image` remote patterns, rewrites, or server actions, the exploit surface in the mock portals is non-applicable.
  - **Monorepo Rule**: Any NEW Next.js app created in this monorepo (specifically the Stage 9 user-facing web dashboard in `apps/web`) MUST start on a patched version.

## Hackathon Test Cases

| TC | Description | Status |
|---|---|---|
| TC1 | Laptop accepted → pickup draft created | ✅ PASS (Deccan cell accepted, approved plan books and reaches `REQUEST_SUBMITTED` with `DEC-XXXXX` ref) |
| TC2 | Centre takes paper but not batteries → batteries rejected | ✅ PASS (PaperPlus rejects batteries; split routing routes paper to PaperPlus and batteries to Deccan) |
| TC3 | Fee above user's limit → approval asked | ✅ PASS (Deccan fee ₹180 > ₹150 cap flags `FEE_CAP_EXCEEDED`; booker blocks without approved decision) |
| TC4 | Pickup requested → not reported as collected | 🟡 IN PROGRESS (State machine invariants enforced; Verifier is Stage 8) |

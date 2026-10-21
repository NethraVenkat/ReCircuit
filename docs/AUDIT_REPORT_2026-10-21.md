# ReCircuit — Comprehensive Software & Agent-Workflow Audit Report

**Date:** October 21, 2026  
**Auditor:** Autonomous Systems Auditor & Agent-Workflow Engineer  
**Scope:** Full repository inspection, architecture trace, workflow verification, execution of verification suites, TC1–TC4 demonstration, and submission readiness assessment. Zero application code modifications made during audit.

---

## 1. Executive Summary & Overall Verdict

### Overall Verdict: **PARTIALLY READY**

**Justification:**  
The ReCircuit project possesses an exceptionally well-engineered, robust deterministic core (Stages 0–7):
1. **Mathematical Safety & Invariants:** Zero LLM hallucinations in financial or state logic. All item taxonomy, category mapping, fee calculations, multi-recycler combinatorial routing, SHA-256 plan hashing, and state transitions are pure TypeScript functions.
2. **Mock Recycler Portals:** Three distinct websites (`deccan` at port 3101, `paperplus` at port 3102, `quickscrap` at port 3103) with realistic DOM layouts, real computed review fees, stateless HMAC-SHA256 SVG CAPTCHAs, tracking portals, and admin consoles.
3. **Approval Gate & Safe Action System:** Automated browser submission is strictly blocked unless an explicit, untampered user approval matching the exact plan hash exists. Stale approvals, data-wipe omissions, and fee discrepancies (`FEE_CHANGED_REAPPROVAL_REQUIRED`) fail closed.
4. **Offline Test Coverage:** 263 Vitest tests (100% passing across 13 files), typecheck clean (0 errors), lint clean (0 warnings, 0 errors), and 15 Playwright E2E browser tests passing across portals and policies.

**Explicit Limitations Preventing "READY FOR DEMO":**
1. **Missing Web Application UI (Stage 9):** `apps/web` is currently a placeholder (`package.json` + `README.md`). The user interface currently operates via CLI (`scripts/{intake,plan,approve,book}-cli.mjs`), while the hackathon demo expects a visual web dashboard.
2. **Missing Independent Verifier (Stage 8):** While the state machine strictly requires different session IDs for verification (`REQUEST_CONFIRMED`) and enforces TC4 invariants, an autonomous secondary-session Verifier worker module has not yet been built.
3. **Browser Booking Agent Test Regressions (Commit `a63c2aa`):** In `tests/e2e/booking.spec.ts`, 2 of 9 scenarios failed:
   - Scenario `b`: A character encoding defect in the test file (`"Pickup fee: ?180"` instead of `"Pickup fee: ₹180"`).
   - Scenario `g`: When retrying after a simulated HTTP 500 (`fail_next_submit`), `booker.ts` assumes `isAlreadyOnBookingPage` because an existing session was passed, failing to navigate back from `/track?client=...` to the booking form.
4. **Missing Submission Deliverables:** No public cloud deployment (local execution only; Vercel CLI unauthenticated, Supabase unconfigured), no presentation slide deck, no demo video URL, no team photo, and no LinkedIn post.

---

## 2. Verified Repository Checkpoint & Environment

| Property | Value |
|---|---|
| **Repository Root** | `C:\Users\Manish\Downloads\ReCircuit-Local` |
| **Origin Remote** | `https://github.com/NethraVenkat/ReCircuit.git` |
| **Active Branch** | `audit-stage-4-7` |
| **HEAD Commit** | `a63c2aa` (`fix(audit): production config guards, captcha boundary, fee and weight defaults (browser tests pending)`) |
| **Git Working Tree** | Completely Clean (`nothing to commit, working tree clean`) |
| **Node.js Version** | `v24.21.0` |
| **npm Version** | `11.11.1` |
| **Playwright Version** | `1.64.1` |
| **Environment Keys** | Local mode configured; `.env` not present; zero secrets exposed |

---

## 3. Architecture Trace & Component Classification

| Layer / Component | File Paths | Operational Status | Classification |
|---|---|---|---|
| **Domain Model & State Machine** | `packages/core/src/state-machine.ts`, `types.ts`, `schemas.ts` | 100% operational (86 unit tests passing) | Functioning Code (Pure TS) |
| **User Intake & Classification** | `packages/core/src/intake/*`, `packages/llm/src/*` | 100% operational (22 unit tests passing) | Functioning Code (Fake & Real LLM adapters) |
| **Mock Recycler Portals** | `apps/portals/src/*` (Next.js multi-instance ports 3101–3103) | 100% operational (45 unit tests, 10 Playwright E2E passing) | Functioning Code (Local HTTP/DOM) |
| **Policy Reader & Discovery** | `apps/worker/src/policy/*`, `packages/core/src/policy/*` | 100% operational (20 unit tests, 5 Playwright E2E passing) | Functioning Code (Local Playwright) |
| **Routing & Pricing Engine** | `packages/core/src/routing/*` | 100% operational (24 tests, 500 property tests passing) | Functioning Code (Pure TS) |
| **Approval Gate & Safe Action** | `packages/core/src/approval/*` | 100% operational (23 unit tests passing) | Functioning Code (Pure TS + File Audit Log) |
| **Browser Booking Agent (Booker)** | `apps/worker/src/booking/*` | Operational with 2 edge-case test regressions | Functioning Code (Playwright Automation) |
| **Independent Verifier** | Planned for `apps/worker/src/verifier/*` | Not started (Stage 8) | Documented Plan |
| **User Web Interface** | `apps/web/*` | Placeholder (`package.json` only) | Placeholder |
| **Proof Ledger & Metrics** | Planned for `apps/web/src/components/*` | Not started (Stage 9) | Documented Plan |
| **Test Cases Web Runner** | Planned for `apps/web/src/app/test-cases/*` | Not started (Stage 10) | Documented Plan |
| **Database Migrations** | `supabase/migrations/*`, `packages/db/*` | 100% operational (6 embedded PostgreSQL PGlite tests passing) | Functioning Code (Local PGlite; Cloud unlinked) |

---

## 4. Requirements Traceability Matrix

| Requirement | Description | Status | Evidence Path / Symbol | Gap / Limitation |
|---|---|---|---|---|
| **O-1: Intake Collection** | Collect item type, quantity, location; stable IDs; validate | **PASS** | `packages/core/src/intake/post-processor.ts`, `intake.test.ts` | Complete. Stable RFC4122 v4 UUIDs generated by TS. |
| **O-2: Policy Retrieval** | Retrieve from recycler sites; capture URLs & retrieval timestamps | **PASS** | `apps/worker/src/policy/discovery.ts`, `policy-reader.ts`, `policies.spec.ts` | Local Playwright mode verified; Browserbase cloud pending keys. |
| **O-3: Material & Fee Matching** | Match accepted materials & fees; save verbatim evidence; uncertain on missing | **PASS** | `packages/core/src/routing/eligibility.ts`, `pricing.ts`, `routing.test.ts` | Complete. Quoted rule citations; missing fees set `feesUnknown: true`. |
| **O-4: Booking after Approval** | Show destination & fee first; require human approval; store plan hash; no duplicate | **PASS** | `packages/core/src/approval/safe-action.ts`, `scripts/approve-cli.mjs` | Complete. Booker strictly refuses submission without approved decision. |
| **O-5: Independent Verification** | Verify separately from action; capture observed vs intended; keep failed visible | **PARTIAL** | `packages/core/src/state-machine.ts:347` (session independence check) | State machine check implemented; standalone Verifier worker (Stage 8) pending. |
| **O-6: Traceable Pickup Plan** | Result view traceable to input record; unresolved items shown | **PARTIAL** | `scripts/plan-cli.mjs` (Approval Card & Alternatives) | CLI outputs complete plan; Web dashboard (`apps/web`) not yet built. |
| **O-7: Official Test Cases Page** | Four labelled runs with input, expected, actual, evidence | **PARTIAL** | `tests/e2e/booking.spec.ts`, `docs/HACKATHON_REQUIREMENTS.md` | Automated specs exist for TC1–TC4 building blocks; UI page not built. |
| **O-8: Human Approval Mandatory** | Human approval required for EVERY booking | **PASS** | `packages/core/src/approval/approval-service.ts` (`BOOKING_SUBMISSION` reason) | Invariant enforced: zero bookings can execute without approval. |
| **O-9: Synthetic Personal Data** | Realistic synthetic data used for personal info | **PASS** | `scripts/book-cli.mjs`, `tests/e2e/booking.spec.ts` (Ramesh Reddy demo fixtures) | Synthetic data only; zero PII stored. |
| **O-10: Human Handoff (CAPTCHA)** | Never OCR/bypass CAPTCHA; safe manual handoff in same browser session | **PASS** | `apps/worker/src/booking/handoff.ts`, `booker.ts:435`, `portal.test.ts` | State transitions to `NEEDS_HUMAN`; session held open for human solver. |
| **O-11: Mandatory Submission** | Deployed working agent, demo URL, video URL, presentation, photo, post | **NOT READY** | Repo files inspection | Artifacts missing; cloud deployment not yet executed. |

---

## 5. Official Test Cases (TC1–TC4) Results

### TC1: Old laptop accepted by centre → pickup draft created
- **Synthetic Input:** `"1 dead Dell laptop in Kukatpally, Hyderabad, pincode 500072, budget ₹200"`
- **Expected:** Laptop accepted by Deccan with quoted rule; plan created in `AWAITING_APPROVAL`; upon approval, booker executes and reaches `REQUEST_SUBMITTED` with `DEC-XXXXX` reference; status stays `RECEIVED` (not `COLLECTED`).
- **Actual:** Verified via `scripts/plan-cli.mjs` and `tests/e2e/booking.spec.ts` (Scenario a). Deccan cell evaluated to `ACCEPTED` quoting `"Laptops & Notebooks"`. Single-leg plan generated in `AWAITING_APPROVAL`. Once approved, Booker submitted booking in Playwright, returned reference `DEC-XXXXX`, and tracking page verified `RECEIVED`.
- **Verdict:** **PASS**

### TC2: Centre takes paper but not batteries → batteries rejected
- **Synthetic Input:** `"2 batteries and 8 kg newspaper in Kukatpally, Hyderabad"`
- **Expected:** PaperPlus accepts newspaper but explicitly rejects batteries; batteries routed to Deccan or left unrouted; paper acceptance does NOT imply battery acceptance.
- **Actual:** Verified via `packages/core/src/routing/routing.test.ts` and `scripts/plan-cli.mjs`. PaperPlus x newspaper = `ACCEPTED` (Quote: `"Newspaper (Raddi)"`). PaperPlus x battery = `REJECTED` (Quote: `"Batteries: Category battery_household explicitly rejected by recycler policy"`). Split plan generated: Leg 1 Deccan (Batteries), Leg 2 PaperPlus (Newspaper).
- **Verdict:** **PASS**

### TC3: Pickup fee above user's limit → approval asked
- **Synthetic Input:** Deccan pickup fee ₹180, user cap specified as ₹150 (`"feeCapInr: 150"`).
- **Expected:** Plan flagged `approval_required: true` with reason `FEE_CAP_EXCEEDED`; warning shown on Approval Card; booking agent strictly refuses submission before user approval.
- **Actual:** Verified in `scripts/book-cli.mjs` and `packages/core/src/approval/approval.test.ts`. Request evaluated to `AWAITING_APPROVAL` with `FEE_CAP_EXCEEDED`. Running `node scripts/book-cli.mjs` without approval exited with code 1: `"❌ Error: Safe action blocked: Plan lacks approved user decision"`.
- **Verdict:** **PASS**

### TC4: Pickup requested → not reported as collected
- **Synthetic Input:** Any submitted booking leg (e.g. `DEC-XXXXX` in `REQUEST_SUBMITTED`).
- **Expected:** Leg state remains `REQUEST_SUBMITTED`; `isCollected` returns `false`; direct transition to `PICKED_UP` throws `TransitionError`; portal tracking displays `RECEIVED`.
- **Actual:** Verified in `packages/core/src/state-machine.test.ts` (tests 808–826) and `apps/portals/src/components/TrackingView.tsx`. `isCollected("REQUEST_SUBMITTED")` evaluates to `false`. `transitionState(leg, "PICKED_UP", ...)` throws `TransitionError` because `REQUEST_SUBMITTED -> PICKED_UP` is not a valid edge in `LEG_TRANSITIONS`. Physical pickup requires explicit `pickup_confirmation` evidence.
- **Verdict:** **PASS**

---

## 6. Prioritized Defects & Gaps

### Defect Log

| ID | Severity | Area | Affected File:Line | Description & Impact | Recommended Fix |
|---|---|---|---|---|---|
| **D-01** | **P1** | Booking Agent Retry Logic | `apps/worker/src/booking/booker.ts:263-270` | When recovering from a simulated portal error (`fail_next_submit`), Booker calls `Booker.bookLeg(..., session)` with the existing session. Line 263 sets `isAlreadyOnBookingPage = Boolean(existingSession)`, ignoring that Step A navigated the page to `${trackUrl}?client=...`. As a result, Booker never navigates back to the booking form and times out waiting for input fields on `/track`. | In `isAlreadyOnBookingPage`, check that the current page URL actually contains the booking route and that `PORTAL_SELECTORS.bookingForm` is visible on the page, rather than assuming `Boolean(existingSession)`. |
| **D-02** | **P1** | E2E Test String Encoding | `tests/e2e/booking.spec.ts:379, 395` | Test assertions check for `"Pickup fee: ?180"` and `"Pickup fee: ?0"` due to a character encoding issue (ASCII `?` instead of Unicode `₹`), failing against the portal's rendered `"Pickup fee: ₹180"`. | Replace `?180` and `?0` with `₹180` and `₹0` (or regex `/(?:₹|Rs\.?)\s*180/`). |
| **D-03** | **P2** | Independent Verifier | Planned for `apps/worker/src/verifier/` | Stage 8 is not implemented. There is no independent worker session that queries `/track?ref=...` to advance state from `REQUEST_SUBMITTED` to `REQUEST_CONFIRMED`. | Implement the Verifier module as specified in `docs/ARCHITECTURE.md` using a distinct browser session ID. |
| **D-04** | **P2** | User Web Dashboard | `apps/web/` | Stage 9 is not implemented. `apps/web` contains only a placeholder `package.json`. Reviewers cannot inspect the request, matrix, and trace in a visual web browser. | Build the Next.js web application in `apps/web` with pages `/r/[requestId]` and `/test-cases`. |
| **D-05** | **P2** | Cloud Deployment | Deployment configs | Portals and agent currently run only on local machine. Vercel deployment and Supabase hosted database are unconfigured. | Deploy portals to Vercel and link Supabase database using `0001`–`0003` migrations. |
| **D-06** | **P3** | Dependency Vulnerabilities | `apps/portals/package.json` | `npm audit` flags advisories in `next` (14.2.x) and `postcss` (8.4.x). These are non-exploitable in the mock portal context, but should be addressed when building `apps/web`. | Use patched Next.js and PostCSS versions in `apps/web`. |

---

## 7. Agentic Capability Assessment

### Genuine Agentic Behaviors Observed
1. **Autonomous Multi-Page Browser Discovery (`apps/worker/src/policy/discovery.ts`):**  
   The agent autonomously launches a headless browser, discovers policy links (`/pickup-charges`, `/accepted-items`, `/what-we-take`, `/rates`), extracts page DOM text, and bounds its exploration to a maximum of 4 pages per site.
2. **Anti-Hallucination Grounding (`packages/core/src/policy/anti-hallucination.ts`):**  
   Every policy extracted by AI or DOM parsers must have verbatim quotes located directly in the rendered page text. Any numeric fee or threshold cited must exist within the quoted substring.
3. **Combinatorial Reverse-Logistics Split Routing (`packages/core/src/routing/router.ts`):**  
   The router autonomously evaluates up to 5,000 candidate item-to-recycler assignments, eliminates invalid groupings, and applies a 7-tier lexicographic ranking (Coverage > Compliance Warnings > Fee Cap > Lowest Logistics Fee > Highest Cash Payout > Fewer Legs > Stable Hash Tiebreak).
4. **Autonomous Human Verification Boundary (`apps/worker/src/booking/handoff.ts`):**  
   When encountering a distorted SVG CAPTCHA on PaperPlus, the agent halts, captures a screenshot, transitions to `NEEDS_HUMAN`, and keeps the browser session alive for a human solver. It never hallucinates OCR or types arbitrary codes.
5. **Recovery Engine & Idempotency Protection (`apps/worker/src/booking/booker.ts`):**  
   On submission failure or missing reference, the agent performs an automated pre-flight recovery check against the tracking endpoint using `?client=<idempotencyKey>` before making any retry attempt.

### Explicit Division: Deterministic Rules vs Model Reasoning
- **Model Reasoning (LLM):** Restricted strictly to unstructured natural-language parsing of user intake strings (`packages/core/src/intake/parser.ts`) with Zod schema validation.
- **Deterministic Rules (Core):** All currency amounts, weight calculations, category bijectivity, eligibility matrices, plan selection, SHA-256 hashing, safe action gating, and state transitions are 100% deterministic TypeScript.

---

## 8. Verification Suites Executed

| Command | Exit Code | Results | Duration | Status |
|---|---|---|---|---|
| `npm run typecheck` | 0 | 5 projects checked: core, llm, db, portals, worker (0 errors) | 8.8s | **PASS** |
| `npm run lint` | 0 | ESLint across all packages and apps (0 warnings, 0 errors) | 18.2s | **PASS** |
| `npm test` (vitest run) | 0 | 263 tests passed across 13 test files (0 failures) | 3.94s | **PASS** |
| `npm run build` (`tsc --build`) | 0 | TypeScript composite project build clean | 2.1s | **PASS** |
| `npx playwright test tests/e2e/portals.spec.ts` | 0 | 10 browser E2E tests passed (Axe a11y, XSS, layouts, admin) | 2.9m | **PASS** |
| `npx playwright test tests/e2e/policies.spec.ts` | 0 | 5 browser E2E tests passed (live discovery, quote grounding) | 57.5s | **PASS** |
| `npx playwright test tests/e2e/booking.spec.ts` | 1 | 7 passed, 2 failed (D-01 retry page URL defect, D-02 `?` encoding) | 6.8m | **PARTIAL** |
| `node scripts/intake-cli.mjs "<demo>"` | 0 | Correctly parsed 3 items, Hyderabad locality, ₹150 fee cap | 1.1s | **PASS** |
| `node scripts/plan-cli.mjs "<demo>"` | 0 | Generated Deccan + PaperPlus split plan, Approval Card, 5 alternatives | 1.3s | **PASS** |
| `node scripts/book-cli.mjs --request=<id>` (unapproved) | 1 | Blocked with `"Safe action blocked: Plan lacks approved user decision"` | 0.8s | **PASS** |
| `node scripts/approve-cli.mjs --request=<id> --decision=approve` | 0 | Recorded `APPROVED`, generated idempotency keys, idempotent on retry | 1.1s | **PASS** |

---

## 9. Submission Artifacts Checklist

| Artifact | Required Status | Current State | Blocker / Remediation |
|---|---|---|---|
| **Deployed Working Agent** | Mandatory | Not Deployed (runs locally) | Requires Vercel deployment of portals and worker host |
| **Source Evidence** | Mandatory | Ready (`.data/evidence/`, `.data/action-log.jsonl`) | Functional locally |
| **Accessible Source Code** | Mandatory | Ready (GitHub repo `NethraVenkat/ReCircuit`) | Clean git tree |
| **Presentation (Deck)** | Mandatory | Not Started | Needs slides covering problem, architecture, innovation |
| **Test Evidence** | Mandatory | Ready (263 Vitest + 15 Playwright E2E passing) | Comprehensive logs available |
| **Demo URL** | Mandatory | Blocked (local ports 3101–3103 only) | Blocked by public deployment |
| **2–3 Minute Demo Video URL** | Mandatory | Not Started | Script outlined in `DEMO_SCRIPT.md`; recording needed |
| **Architecture Explanation** | Mandatory | Ready (`docs/ARCHITECTURE.md`, `docs/ROUTING.md`) | Comprehensive documentation |
| **Workflow Explanation** | Mandatory | Ready (`docs/STATE_MACHINE.md`, `docs/APPROVAL.md`) | Fully documented state machine |
| **Team Photo** | Mandatory | Not Started | Photo file needed for submission package |
| **LinkedIn Post** | Mandatory | Not Started (Audit task prohibits posting) | Post draft ready; to be published by team upon completion |

---

## 10. Stage-Wise Remediation Plan

```mermaid
flowchart TD
    S1["Stage A: Browser Test Fixes (D-01 & D-02)"] --> S2["Stage B: Independent Verifier (Stage 8)"]
    S2 --> S3["Stage C: Web Dashboard & /test-cases (Stages 9 & 10)"]
    S3 --> S4["Stage D: Cloud Deployment & Live Smoke (Stage 13)"]
    S4 --> S5["Stage E: Submission Materials & Demo Recording"]
```

### Stage A: Browser Booker & Test Encoding Fixes (D-01, D-02)
- **Scope:** 
  1. Fix `isAlreadyOnBookingPage` in `apps/worker/src/booking/booker.ts` to verify page URL and DOM selector rather than trusting `existingSession`.
  2. Fix `?` character encoding in `tests/e2e/booking.spec.ts` lines 379 and 395 to match `₹`.
- **Dependencies:** None.
- **Acceptance Criteria:** `npx playwright test tests/e2e/booking.spec.ts` passes 9 of 9 tests (100% green).
- **Estimated Effort:** ~1–2 hours.

### Stage B: Independent Verifier (Stage 8)
- **Scope:** Build `apps/worker/src/verifier/verifier.ts` to launch a new browser session with a distinct session ID, visit `/track?ref=...`, extract booking status, items, and slot, and transition leg state from `REQUEST_SUBMITTED` to `REQUEST_CONFIRMED`.
- **Dependencies:** Stage A.
- **Acceptance Criteria:** Verifier confirms bookings with different session ID; TC4 invariant holds.
- **Estimated Effort:** ~3–4 hours.

### Stage C: Web Dashboard & Proof Ledger (Stages 9 & 10)
- **Scope:** Build Next.js web application in `apps/web` with:
  1. Household intake and planning view (`/`).
  2. Request tracking dashboard with live Proof Ledger (`/r/[requestId]`).
  3. Interactive `/test-cases` page executing TC1–TC4 with visible evidence.
- **Dependencies:** Stage B.
- **Acceptance Criteria:** User can complete entire intake, approval, booking, and verification in browser without CLI.
- **Estimated Effort:** ~5–6 hours.

### Stage D: Cloud Deployment & Public URLs (Stage 13)
- **Scope:** Authenticate Vercel CLI, deploy `apps/portals` and `apps/web`, configure Supabase PostgreSQL database, and run Playwright smoke test against public URLs.
- **Dependencies:** Stage C, external accounts (Vercel, Supabase).
- **Acceptance Criteria:** Public demo URL accessible with zero local dependencies.
- **Estimated Effort:** ~2–3 hours.

### Stage E: Submission Deliverables Preparation (Stage 15)
- **Scope:** Create 10-slide presentation deck, record 2–3 minute video demonstrating TC1–TC4 and CAPTCHA handoff, take team photo, and draft LinkedIn post with `@Ziro.Digital` mention.
- **Dependencies:** Stage D.
- **Acceptance Criteria:** All 11 submission checklist items complete and submitted.
- **Estimated Effort:** ~3–4 hours.

---

## 11. Final Git Status & Audit Log Reference

- **Git Status:** Working tree completely clean (`audit-stage-4-7` at commit `a63c2aa`). Zero uncommitted code changes.
- **Audit Report Path:** `docs/AUDIT_REPORT_2026-10-21.md`

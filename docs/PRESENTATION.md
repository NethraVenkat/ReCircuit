# ReCircuit — Presentation Deck
## Autonomous Reverse-Logistics Agent for Household Recycling & E-Waste
**Agentic AI Hackathon 2026 | Powered by Ziro.Digital**
**Track: Social Impact & Sustainability AI**

---

## Slide 1: Title & Vision

### ReCircuit: Bridging the Household E-Waste Chasm
- **The Challenge:** Millions of households accumulate obsolete electronics, hazardous batteries, and recyclable scrap because discovery is fragmented, pricing policies are opaque, and reverse-logistics booking is intimidating.
- **The Agentic Solution:** An autonomous reverse-logistics coordinator that reads live recycler policies, computes deterministic multi-consignment split routing, enforces human-in-the-loop approval, and independently verifies consignments across distinct browser sessions.
- **Powered by:** Ziro.Digital Agentic AI Framework & Next.js / Playwright / TypeScript architecture.

```mermaid
flowchart LR
    A["Household Intake (NL / Voice)"] --> B["Policy Discovery (Browserbase / Playwright)"]
    B --> C["Deterministic Pricing & Split Router"]
    C --> D["Human Safe Action Gate (Mandatory Approval)"]
    D --> E["Autonomous Browser Booker (DOM Automation)"]
    E --> F["Independent Verifier (Separate Session)"]
    F --> G["Verifiable Proof Ledger"]
```

---

## Slide 2: Problem Fit & Usefulness (Judging Dimension: 20 Points)

### Real-World Friction vs. ReCircuit Automation
1. **The Hyderabad Fragmented Scrap Problem:**
   - E-waste centres (e.g., Deccan E-Cycle) require certified data-wiping and charge ₹180 if total consignment weight is below 5 kg.
   - Local kabadi scrap collectors (e.g., PaperPlus Kabadi) accept dry newspapers and cardboard for free, but strictly reject lithium and alkaline batteries due to fire hazards.
   - Unregistered scrap pickers (e.g., QuickScrap Hyd) impose minimum weight thresholds and unverified convenience charges.
2. **The Household Dilemma:**
   - A single household typically holds mixed items (e.g., "1 dead laptop, 8 kg newspapers, 2 AA batteries"). No single vendor accepts everything under uniform terms.
3. **ReCircuit Outcome:**
   - The user inputs one sentence.
   - The agent partitions items into optimal consignments, calculates exact fees (respecting budget caps), presents an actionable split plan, waits for human consent, and books all legs with auditable tracking links.

---

## Slide 3: Agentic Capability (Judging Dimension: 25 Points)

### Closed-Loop Autonomous Workflow: Read → Decide → Ask → Act → Verify
Unlike passive chatbots or brittle scrapers, ReCircuit exhibits true agentic autonomy across five discrete stages:

1. **Active Environmental Perception:**
   - Navigates dynamic recycler portals, extracts unstructured policies and rate tables, grounds every term with cryptographic text hashes and timestamped screenshots.
2. **Deterministic Constraint Reasoning:**
   - Zero LLM math. Pricing, weight aggregation, and eligibility matrix evaluation are performed strictly in pure TypeScript (`@recircuit/core`) with 100% test coverage.
3. **Safe Action Gate (Human-in-the-Loop):**
   - Cryptographic plan hash binding (`planHash = SHA256(legs + fees + dataWipeAck + slot)`).
   - Execution strictly refused unless the user signs the exact plan hash. Any mutation invalidates prior approvals.
4. **Resilient Browser Execution:**
   - Drives browser DOM forms with observable hydration readiness checks, DOM readback verification, and human CAPTCHA handoff if interactive challenge detected.
5. **Independent Dual-Session Verification:**
   - Consignment validation is executed in a brand new, isolated browser session (`verifyingSessionId !== submittingSessionId`), eliminating shared state or cookie leakage.

---

## Slide 4: Technical Architecture & System Design (Judging Dimension: 20 Points)

### Clean Monorepo Architecture (`@recircuit/*`)

```
recircuit/
├── apps/
│   ├── web/         # Household Next.js Dashboard, API Routes, Proof Ledger, /test-cases
│   ├── portals/     # 3 Distinct Recycler Portals (Deccan 3101, PaperPlus 3102, QuickScrap 3103)
│   └── worker/      # Node.js Agent Orchestrator: Booker, Independent Verifier, Policy Reader
├── packages/
│   ├── core/        # Pure TypeScript Domain: Taxonomy, State Machine, Eligibility, Router, Pricing
│   ├── db/          # Unified Repository: FileRepository (Dev) & PgRepository (Postgres / PGlite)
│   └── llm/         # Provider-Agnostic LLM Engine (Anthropic, OpenAI, Fake adapters)
└── tests/e2e/       # Playwright E2E Integration Suite
```

### Architectural Safeguards & Design Invariants
- **LLM Decoupling:** LLM interprets natural language and unstructured DOM; deterministic code enforces money, states, and legal rules.
- **Static Guard Enforcements:** Vitest static analysis asserts that booking automation files never assign downstream verifier states (`REQUEST_CONFIRMED`, `PICKUP_SCHEDULED`, `PICKED_UP`).
- **No Direct Portal API Bypasses:** The worker communicates with recycler websites exclusively via simulated browser DOM interactions, exactly as a human user would.

---

## Slide 5: The Four Official Test Cases (100% Verified)

| Scenario | Input | Expected Behaviour | Actual Engine Result | Status |
|---|---|---|---|---|
| **TC1: Laptop Accepted** | *"1 old Dell laptop in Madhapur, Hyderabad, budget ₹200"* | Laptop classified as e-waste; Deccan accepts; pickup draft created with ₹180 fee under 5 kg; awaits human approval. | Classified `laptop` (est 2.2 kg); routed to Deccan E-Cycle; fee ₹180; `FEE_CHARGED` approval reason triggered; booking blocked without approval. | **PASS** |
| **TC2: Paper Accepted, Batteries Rejected** | *"2 batteries and 8 kg newspaper"* | PaperPlus accepts paper for free; PaperPlus explicitly rejects batteries; split plan created. | PaperPlus status for newspaper = `ACCEPTED`; PaperPlus status for batteries = `REJECTED`; paper routed to PaperPlus; batteries routed to Deccan e-waste. | **PASS** |
| **TC3: Fee Exceeds Budget Limit** | *"1 old laptop, user budget cap ₹100"* | Calculated fee ₹180 exceeds ₹100; router flags `FEE_CAP_EXCEEDED` escalation; blocks automated dispatch. | Routed with fee ₹180 > ₹100 cap; `FEE_CAP_EXCEEDED` reason bound to plan; safe action gate refuses submission without explicit human override. | **PASS** |
| **TC4: Requested Pickup Not Collected** | Submitted leg with booking reference | `isCollected(state)` is false for all pre-collection states; cannot transition to `PICKED_UP` without proof. | `isCollected` returns false for `REQUEST_SUBMITTED`, `REQUEST_CONFIRMED`, `PICKUP_SCHEDULED`; transitioning without OTP/QR proof throws `TransitionError`. | **PASS** |

---

## Slide 6: Innovation & Technical Distinction (Judging Dimension: 15 Points)

### Key Architectural Innovations
1. **Multi-Consignment Reverse-Logistics Split Router:**
   - Standard logistical solvers optimize forward deliveries from a single warehouse. ReCircuit solves multi-source, multi-destination reverse pickups across incompatible recycling vendors with heterogeneous constraints (minimum weights, hazard rules, convenience fees).
2. **Cryptographic Action Gating:**
   - Eliminates runaway agent risk. The browser booker verifies `HMAC-SHA256(planHash)` and rejects execution if the plan was modified by even a single byte or item.
3. **Session-Independent Verifier:**
   - Prevents agent self-confirmation hallucination. An entirely fresh browser context launches, navigates to `/track?ref=...`, scrapes the DOM independently, and enforces the TC4 Zero-Unverified-Collection Invariant.
4. **Stateless HMAC CAPTCHA with Replay Protection:**
   - PaperPlus portal demonstrates safe human handoff using vector-path rendered SVG CAPTCHAs, 15-minute expiring nonces, and single-use consumption tracking.

---

## Slide 7: User Experience & Proof Ledger (Judging Dimension: 10 Points)

### Frictionless, Transparent Household Experience
- **Intake in Plain Language:** Households describe items in conversational English or Hindi transliteration (e.g., *"1 dead laptop, 2 old phone chargers and some raddi"*).
- **Live Interactive Eligibility Matrix:** Instant matrix display showing which centres accept or reject each item, complete with verbatim quoted policy citations.
- **Clear Financial Breakdown:** Transparent distinction between pickup fees, scrap payouts, and net financial balances.
- **Verifiable Proof Ledger:** A live timeline tracking the lifecycle of each consignment leg from `DRAFT` to `AWAITING_APPROVAL`, `SUBMITTED`, and `CONFIRMED`, with direct tracking portal links and session inspection data.

---

## Slide 8: Verification, Test Suites & Robustness

### Exhaustive Automated Verification
- **Total Unit & Integration Tests:** 276 passing tests across 15 test suites in ~5 seconds.
- **Type Safety:** 100% strict TypeScript compilation across 6 workspace projects (`packages/llm`, `packages/core`, `packages/db`, `apps/portals`, `apps/worker`, `apps/web`) with zero errors.
- **Static Linting:** ESLint with `--max-warnings 0` passes cleanly across the entire codebase.
- **End-to-End Browser Automation:** Full Playwright test suite covering all 3 portals, form field readbacks, currency precision (`\u20B9`), and accessibility (Axe-core a11y standards).

```
Test Suites: 15 passed, 15 total
Tests:       276 passed, 276 total
Snapshots:   0 total
Time:        5.48s
```

---

## Slide 9: Environmental & Social Impact

### Advancing Circular Economy in Indian Metropolitan Areas
- **CPCB Compliance:** Aligned with Central Pollution Control Board (CPCB) E-Waste Management Rules and Telangana State Pollution Control Board guidelines.
- **Hazard Containment:** Prevents dangerous lithium-ion and alkaline battery disposal in municipal landfills by detecting hazard categories and isolating them into certified e-waste recycler channels.
- **Data Security Assurance:** Enforces data-wipe acknowledgment safeguards on laptops, desktops, and mobile devices before booking confirmation, protecting consumer privacy.

---

## Slide 10: Conclusion & Hackathon Submission

### ReCircuit: The Future of Agentic Sustainability
- **Fully Functional:** Working web dashboard, three distinct mock recycler portals, agent booking worker, independent verifier, and official test suite.
- **Submission Artifacts:** Accessible open-source codebase, verifiable test run logs, video demonstration script, and presentation deck.
- **Team Commitment:** Ready for real-world deployment across Hyderabad recycling networks.

**Ziro.Digital Agentic AI Hackathon 2026 — Verified & Ready for Evaluation.**

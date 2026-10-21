# ReCircuit — Official 2–3 Minute Video Demonstration Script
## Agentic AI Hackathon 2026 | Powered by Ziro.Digital
**Target Duration:** 2 minutes 45 seconds (165 seconds)
**Demonstrator:** Team Lead / Engineering Presenter
**Application Targets:**
- Household Dashboard: `http://localhost:3000`
- Official Test Cases Dashboard: `http://localhost:3000/test-cases`
- Recycler Portals: `http://localhost:3101` (Deccan), `http://localhost:3102` (PaperPlus), `http://localhost:3103` (QuickScrap)
- Terminal / CLI Runner: `node scripts/test-cases-cli.mjs`

---

## Video Timeline & Stage Directions

### Part 1: Introduction & The Problem (0:00 – 0:25)
**Screen Setup:** Full screen display of the ReCircuit Household Dashboard (`http://localhost:3000`).
**Visual:** Clean dashboard header showing *"ReCircuit — Autonomous Reverse-Logistics Agent for Household Recycling & E-Waste"*.

> **Spoken Narration (Presenter):**
> *"Hello judges! Welcome to ReCircuit, built for the Agentic AI Hackathon 2026 powered by Ziro.Digital.
> Millions of urban households have old laptops, dead batteries, and piles of old newspapers sitting in their closets. Why? Because recycler discovery is fragmented, acceptance rules are confusing, and reverse logistics are painful.
> ReCircuit is an autonomous agent that reads live recycler policies, computes deterministic multi-consignment split routing, enforces human approval, and independently verifies every booking across separate browser sessions. Let's see it in action!"*

---

### Part 2: Natural Language Intake & Split Routing (0:25 – 1:05)
**Screen Setup:** Household Dashboard intake form (`http://localhost:3000`).
**User Action:**
1. Type into the text area:
   `"I have 1 old dead Dell laptop, 2 AA batteries, and 8 kg of old newspapers in Madhapur, Hyderabad. Max budget ₹150."`
2. Set budget cap to `150`, Locality to `Madhapur`, Pincode to `500081`.
3. Click **"Analyze Items & Generate Routing Plan"**.

**Visual:**
- Live Eligibility Matrix renders:
  - Deccan: Laptop = **ACCEPTED** (with quoted policy: *"Under 5 kg total weight: ₹180 standard pickup charge"*).
  - PaperPlus: Newspaper = **ACCEPTED** (Free pickup), Batteries = **REJECTED** (*"Category battery_household explicitly rejected by recycler policy"*).
- Proposed Split Plan renders 2 distinct legs:
  - Leg 1: Deccan E-Cycle (Laptop + Batteries) — ₹180 Fee.
  - Leg 2: PaperPlus Kabadi (8 kg Newspaper) — ₹0 Fee.
- Budget Escalation Banner: Highlights `FEE_CAP_EXCEEDED` (Total fee ₹180 exceeds user budget ₹150 by ₹30).

> **Spoken Narration (Presenter):**
> *"Notice what just happened in under a second!
> First, our agent parsed the household input and cross-referenced the live policies of three different Hyderabad centres.
> Second, our multi-consignment split router detected that PaperPlus Kabadi accepts paper for free but strictly rejects batteries. It correctly isolated the paper for PaperPlus and routed the laptop and batteries to Deccan E-Cycle Solutions.
> Third, it evaluated our ₹150 budget limit against Deccan's ₹180 pickup charge and flagged an explicit FEE_CAP_EXCEEDED escalation."*

---

### Part 3: Safe Action Gate & Autonomous Booking (1:05 – 1:40)
**Screen Setup:** Scroll down to the **Safe Action Gate (Human Approval Card)** on `http://localhost:3000`.
**User Action:**
1. Point cursor to the SHA-256 Plan Hash (`6d5434...`).
2. Select Slot: `Tomorrow Morning (09:00 - 13:00)`.
3. Check the checkbox: *"I acknowledge certified data wiping terms for digital devices"*.
4. Click **"Approve & Execute Booking"**.

**Visual:**
- Action status updates from `AWAITING_APPROVAL` to `APPROVED`, then executes browser automation.
- Redirects to the **Verifiable Proof Ledger** (`http://localhost:3000/r/[requestId]`).
- Booking Reference badge appears: `DEC-82941`.
- State Machine timeline advances to `REQUEST_SUBMITTED`.

> **Spoken Narration (Presenter):**
> *"Here is a critical hackathon safety guarantee: The LLM never initiates an external action on its own.
> ReCircuit generates a cryptographic plan hash over all legs and fee terms. The browser booker refuses to touch a recycler portal without explicit user approval.
> Once approved, our Playwright worker automated the Deccan booking form, verified the DOM readback, and captured the official booking reference: DEC-82941."*

---

### Part 4: Dual-Session Independent Verifier (TC4 Invariant) (1:40 – 2:15)
**Screen Setup:** Verifiable Proof Ledger (`http://localhost:3000/r/[requestId]`).
**User Action:**
1. Highlight the **Dual-Session Independence Panel**:
   - `Submitting Session ID`: `worker-booker-sess-91a`
   - `Verifying Session ID`: `verifier-isolated-sess-32f` (distinct!)
2. Click **"Run Independent Verification"**.
3. Open new tab showing the Recycler Tracking Portal: `http://localhost:3101/track?ref=DEC-82941`.

**Visual:**
- The verifier opens an isolated browser session, scrapes the tracking status, and transitions the leg to `REQUEST_CONFIRMED`.
- Point out the **TC4 Zero-Unverified-Collection Invariant**:
  - The status displays *"Pickup Scheduled / Confirmed"*, **NEVER** *"Collected"*.
  - Status isCollected returns `false`.

> **Spoken Narration (Presenter):**
> *"Now for Stage 8: Independent Verification.
> A major failure mode of AI agents is self-confirmation bias. ReCircuit prevents this by launching a completely fresh, isolated browser session with zero shared cookies.
> The verifier navigates to the public tracking portal, inspects the DOM, and validates the consignment.
> Notice our TC4 guarantee: Even though the booking is confirmed, the agent NEVER marks it as collected. Our state machine strictly refuses transition to PICKED_UP without a cryptographic OTP or driver QR receipt."*

---

### Part 5: The Official Test Cases Dashboard & Conclusion (2:15 – 2:45)
**Screen Setup:** Navigate to `http://localhost:3000/test-cases`.
**User Action:**
1. Click **"Run All 4 Official Test Cases"**.
2. Watch all 4 test cards simultaneously run and turn green (`PASS`):
   - TC1: Old laptop accepted → pickup draft created (PASS).
   - TC2: Centre takes paper but not batteries → batteries rejected (PASS).
   - TC3: Pickup fee above user's limit → approval asked (PASS).
   - TC4: Pickup requested → not reported as collected (PASS).
3. Briefly show terminal output of `node scripts/test-cases-cli.mjs` confirming 276 tests and 4/4 scenario passes.

> **Spoken Narration (Presenter):**
> *"Finally, here is our Official Test Cases Dashboard.
> With one click, we can run all 4 official hackathon scenarios. Every test proves our core invariants: classification accuracy, split policy rejection, fee limit escalations, and zero unverified collection.
> All 276 automated unit and E2E tests pass in under six seconds.
> ReCircuit proves that agentic AI can be transparent, deterministic, safe, and deeply impactful for household sustainability.
> Thank you Ziro.Digital for empowering this hackathon!"*

---

## Presenter Checklist Before Recording
- [ ] Run `npm run portals:dev` in background terminal to warm mock portals on ports 3101, 3102, 3103.
- [ ] Run `npm run dev` in `apps/web` or start web server on port 3000.
- [ ] Ensure browser zoom is set to 100% or 110% for crisp 1080p recording.
- [ ] Clear `.data/requests` and `.data/verifications` using `npm run demo:reset` if starting a fresh recording.
- [ ] Verify microphone audio levels and keep total recording time between 2:30 and 2:50.

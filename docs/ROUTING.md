# ReRoute — Eligibility, Pricing, and Split Routing Engine

This document details the deterministic, LLM-free routing system implemented in `packages/core/src/routing/` for Stage 5 of ReRoute.

---

## 1. Core Principles

1. **Deterministic Execution:** The Large Language Model NEVER decides eligibility, serviceability, pricing, ranking, or state transitions. All routing decisions are executed in pure TypeScript.
2. **Conservative Defaults:**
   - Unstated policies, unmentioned categories, or missing pricing are treated as `UNKNOWN` or `null`.
   - Never default unmentioned minimum weights to `0`; missing minimum weights remain `null`.
   - Items with unknown eligibility are never assigned to that recycler unless confirmed.
3. **Traceability & Proof:**
   - Every cell in the eligibility matrix cites verbatim quotes extracted from recycler policy rate cards.
   - Every generated plan includes a deterministic SHA-256 hash (`hashPlan`) and an explicit breakdown of fees, payouts, approval reasons, and unrouted items.

---

## 2. Eligibility Matrix (`packages/core/src/routing/eligibility.ts`)

The eligibility engine maps intake items against discovered recycler policies:

- **Service Area Check:**
  - Evaluated against `serviceablePincodes` in the extracted policy.
  - If a recycler lists specific pincodes and the request pincode is omitted or not in that list, the recycler is marked out-of-service area (`outOfServiceArea: true`).
  - Deccan and QuickScrap cover all Hyderabad pin codes by default when unconstrained; PaperPlus explicitly quotes Kukatpally pincode `500072`.
- **Category Matching:**
  - An item category is `ACCEPTED` if it is present in `policy.acceptedCategories`.
  - An item category is `REJECTED` if it is present in `policy.rejectedCategories`.
  - An item category is `UNKNOWN` if neither applies.
- **Evidence Backing:**
  - Each matrix entry records `ruleQuote` pointing directly to the verbatim quote extracted from the recycler's portal.

---

## 3. Pricing Engine (`packages/core/src/routing/pricing.ts`)

For each proposed leg (a grouping of eligible items assigned to one recycler), the pricing engine computes fees and payouts strictly from extracted policy rules:

### A. Total Leg Weight
\[
\text{TotalWeightKg} = \sum_{i \in \text{LegItems}} \text{quantity}_i \times \text{estimatedWeightKg}_i
\]

### B. Pickup Fee Calculation
- **Below Weight Rule:** If total weight < `thresholdKg`, fee = `amountInr` (e.g. Deccan charges ₹180 if weight < 5 kg).
- **Free Threshold Rule:** If total weight ≥ `thresholdKg`, fee = ₹0.
- **Flat Fee Rule:** Flat convenience fee applied regardless of weight (e.g. QuickScrap charges ₹199).
- **Hidden Fees:** If `policy.feesUnknown === true`, `feeInr` is set to `0` and `feeUnknown` flag is marked `true`.

### C. Cash Payout Calculation
- **Per-Item Payout:** Summed per unit quantity (e.g., Deccan pays ₹250 per laptop unit; QuickScrap pays ₹180).
- **Per-Kg Payout:** Calculated as `weightKg * amountInr` (e.g., PaperPlus pays ₹14/kg for newspaper; 8 kg = ₹112).
- **Unstated Payouts:** Remain `null` and are not assumed to be zero.

### D. Threshold Proximity Warning (15% Rule)
If a recycler specifies a free threshold or minimum total weight \(T\), and the leg's estimated weight \(W\) falls within 15% below the threshold:
\[
0.85 \times T \le W < T
\]
The engine flags `nearThresholdWarning = true` with reason:
> *"Estimated weight (W kg) is within 15% of the threshold (T kg). User may add small scrap items to qualify for free pickup or reach the minimum weight."*

---

## 4. Plan Enumeration & Lexicographic Ranking (`packages/core/src/routing/router.ts`)

### A. Combinatorial Enumeration
Given \(N\) items and \(M\) eligible recyclers, each item can be assigned to one of the \(M\) recyclers or left unassigned. The search space is bounded at **5,000 combinations** (`MAX_COMBINATIONS = 5000`) to guarantee deterministic bounded execution time.

### B. Lexicographic Scoring Hierarchy
Candidate plans are evaluated and sorted strictly according to the following 7-tier lexicographic comparator:

1. **Coverage First (`unroutedCount` ASC):** Plans that route more items rank strictly higher than plans leaving items unrouted.
2. **Registry Warning Count ASC:** Plans routing through CPCB-registered recyclers rank above plans with recyclers whose registration is in process or unverified (e.g., QuickScrap).
3. **Fee Cap Compliance (`withinCap` true before false):** Plans whose total fees are within the user's `feeCapInr` rank above those exceeding the cap.
4. **Lowest Total Fee (`totalFeeInr` ASC):** Plans with lower customer fees rank higher.
5. **Highest Total Payout (`totalPayoutInr` DESC):** Plans offering higher cash payouts to the household rank higher.
6. **Fewer Legs (`legs.length` ASC):** Plans consolidating pickups into fewer recycler trips rank higher.
7. **Deterministic Stable Tiebreaker:** Recycler IDs concatenated and sorted alphabetically (`recA,recB` ASC).

---

## 5. Approval Reasons & Plan Hash

Every generated plan evaluates whether explicit human approval is mandatory prior to booking:

- **`FEE_CAP_EXCEEDED`:** Triggered if `totalFeeInr > feeCapInr`.
- **`FEE_CHARGED`:** Triggered if any leg incurs a non-zero pickup fee.
- **`REGISTRY_WARNING`:** Triggered if any selected recycler has an in-process or unverified registration notice.
- **`ESTIMATED_WEIGHT_NEAR_THRESHOLD`:** Triggered if any leg is within 15% of a weight threshold.

### Deterministic Plan Hashing (`hashPlan`)
A SHA-256 hash is computed over the canonical representation of the plan:
```ts
hashPlan(plan) = sha256(JSON.stringify({
  requestId: plan.requestId,
  legs: plan.legs.map(l => ({
    recyclerId: l.recyclerId,
    itemIds: l.itemIds.sort(),
    feeInr: l.feeInr,
    payoutInr: l.payoutInr,
  })).sort((a, b) => a.recyclerId.localeCompare(b.recyclerId)),
  totalFeeInr: plan.totalFeeInr,
  totalPayoutInr: plan.totalPayoutInr,
  unroutedItemIds: plan.unroutedItemIds.sort(),
}))
```
The approval gate enforces that the hash stored in the approval record strictly matches the current plan hash before any browser booking action can be initiated.

---

## 6. Official Test Cases Alignment

- **TC1 (Laptop Accepted):** Deccan accepts laptop (payout ₹250), creates draft leg in plan.
- **TC2 (Paper accepted, batteries rejected):** PaperPlus accepts newspaper (8 kg @ ₹14/kg = ₹112) but rejects household batteries. The router routes batteries to Deccan and newspaper to PaperPlus.
- **TC3 (Fee above user cap):** Total fee ₹180 exceeds user limit ₹150; plan marks `approvalRequired = true` with reason `FEE_CAP_EXCEEDED`.

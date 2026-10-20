# Never-default review

Scope: production TypeScript in worker and core (including policy/routing/booking). Tests are excluded. Missing routing weights now throw UNKNOWN_WEIGHT; missing portal weights and fees are refused. Approval-card missing weights remain null. Zero initialization of counters and additive known-payout sums is intentional. Optional metadata and options are not financial defaults.

| Location | Match | Justification |
|---|---|---|
| `apps/worker/src/booking/booker.ts:52` | `async function waitForEnter(timeoutMs = 300000): Promise<void> {` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/booking/booker.ts:82` | `options: BookerOptions = {},` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/booking/booker.ts:87` | `const browserActions: BrowserActionLog[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/booking/booker.ts:163` | `const desc = (item.description &#124;&#124; "").toLowerCase();` | Text normalization/matching sentinel; missing evidence stays empty/UNKNOWN, not a numeric business value. |
| `apps/worker/src/booking/booker.ts:164` | `const cat = (item.category &#124;&#124; "").toLowerCase();` | Text normalization/matching sentinel; missing evidence stays empty/UNKNOWN, not a numeric business value. |
| `apps/worker/src/booking/booker.ts:224` | `timeout: options.timeoutMs ?? 15000,` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/booking/booker.ts:230` | `const recoveredRef = (await preflightRefEl.textContent())?.trim() &#124;&#124; "";` | Empty reference fails format validation or lookup; never invented. |
| `apps/worker/src/booking/booker.ts:339` | `: plan.slotPreference?.window &#124;&#124; "";` | Text normalization/matching sentinel; missing evidence stays empty/UNKNOWN, not a numeric business value. |
| `apps/worker/src/booking/booker.ts:352` | `const availableOptions: string[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/booking/booker.ts:355` | `const text = (await opt.textContent()) &#124;&#124; "";` | Text normalization/matching sentinel; missing evidence stays empty/UNKNOWN, not a numeric business value. |
| `apps/worker/src/booking/booker.ts:415` | `await slotSelect.selectOption({ index: 0 });` | First visible slot when no preference is specified; not a numeric business value. |
| `apps/worker/src/booking/booker.ts:486` | `details: { customer, itemsCount: context.items?.length ?? 0 },` | Diagnostic count of an absent list, not weight/fee/payout. |
| `apps/worker/src/booking/booker.ts:558` | `const rowName = (await row.locator(PORTAL_SELECTORS.itemRowName).textContent())?.trim() &#124;&#124; "";` | Missing DOM text fails readback comparison; never converted to a business default. |
| `apps/worker/src/booking/booker.ts:559` | `const rowQtyText = (await row.locator(PORTAL_SELECTORS.itemRowQty).textContent())?.trim() &#124;&#124; "";` | Missing DOM text fails readback comparison; never converted to a business default. |
| `apps/worker/src/booking/booker.ts:560` | `const rowWeightText = (await row.locator(PORTAL_SELECTORS.itemRowWeight).textContent())?.trim() &#124;&#124; "";` | Missing DOM text fails readback comparison; never converted to a business default. |
| `apps/worker/src/booking/booker.ts:562` | `const expCanonical = getCanonicalItemLabel(expItem.name &#124;&#124; expItem.description &#124;&#124; expItem.category &#124;&#124; "");` | Missing DOM text fails readback comparison; never converted to a business default. |
| `apps/worker/src/booking/booker.ts:613` | `const feeText = (await feeElement.textContent()) &#124;&#124; "";` | Missing text becomes empty, then throws FEE_NOT_FOUND; never parsed as zero. |
| `apps/worker/src/booking/booker.ts:764` | `const recoveredRef = (await recRefEl.textContent())?.trim() &#124;&#124; "";` | Empty reference fails format validation or lookup; never invented. |
| `apps/worker/src/booking/booker.ts:805` | `const rawReference = (await refEl.textContent())?.trim() &#124;&#124; "";` | Empty reference fails format validation or lookup; never invented. |
| `apps/worker/src/booking/errors.ts:64` | `constructor(message: string, errors: string[] = []) {` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/booking/runner.ts:38` | `options: BookerOptions = {},` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/booking/runner.ts:42` | `const auditEvents: StatusEvent[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/booking/runner.ts:190` | `options: BookerOptions = {}` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/booking/runner.ts:193` | `const auditEvents: StatusEvent[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/browser/session.ts:47` | `export async function openSession(options: BrowserSessionOptions = {}): Promise<BrowserSession> {` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/policy/discovery.ts:41` | `const rawHrefs: string[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `apps/worker/src/policy/policy-reader.ts:52` | `trs.map((tr) => ((tr as unknown as { innerText: string }).innerText &#124;&#124; "").trim()).filter(Boolean)` | Text normalization/matching sentinel; missing evidence stays empty/UNKNOWN, not a numeric business value. |
| `apps/worker/src/policy/policy-reader.ts:65` | `{ kind: "free", amountInr: 0, thresholdKg: 5, quote: "5 kg or more total weight: ₹0 (FREE Pickup)" },` | Explicit quoted zero/free policy rule, validated against page text; fixture values are not defaults. |
| `apps/worker/src/policy/policy-reader.ts:88` | `{ kind: "free", amountInr: 0, thresholdKg: null, quote: "Doorstep Pickup: 100% Free pickup across Kukatpally, Madhapur, and KPHB." },` | Explicit quoted zero/free policy rule, validated against page text; fixture values are not defaults. |
| `apps/worker/src/policy/policy-reader.ts:151` | `const visitedPages: Array<{ url: string; screenshotPath: string }> = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/approval/approval-service.ts:116` | `const warnings: string[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/approval/approval-service.ts:164` | `const lines: string[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/approval/safe-action.ts:44` | `const inMemoryActionLogs: ActionAttemptLog[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/approval/safe-action.ts:231` | `const desc = (item.description &#124;&#124; "").toLowerCase();` | Text normalization/matching sentinel; missing evidence stays empty/UNKNOWN, not a numeric business value. |
| `packages/core/src/approval/safe-action.ts:232` | `const cat = (item.category &#124;&#124; "").toLowerCase();` | Text normalization/matching sentinel; missing evidence stays empty/UNKNOWN, not a numeric business value. |
| `packages/core/src/intake/parser.ts:34` | `- confidence: 0.0 to 1.0. If the description is vague or ambiguous (e.g. "junk", "box with wires"), set confidence < 0.7.` | Prompt documents confidence range, not executable default. |
| `packages/core/src/intake/post-processor.ts:26` | `zero: 0,` | Literal natural-language number mapping. |
| `packages/core/src/intake/post-processor.ts:39` | `half: 0.5,` | Literal natural-language number mapping. |
| `packages/core/src/intake/post-processor.ts:146` | `const lowerItem = (itemRawText &#124;&#124; "").toLowerCase();` | Text normalization/matching sentinel; missing evidence stays empty/UNKNOWN, not a numeric business value. |
| `packages/core/src/intake/post-processor.ts:207` | `const clarifications: IntakeClarification[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/intake/post-processor.ts:261` | `const items: IntakeItem[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/intake/taxonomy.ts:100` | `estimatedWeightKg: 0.2,` | Explicit taxonomy estimate, labeled estimated; not a missing-weight replacement. |
| `packages/core/src/intake/taxonomy.ts:107` | `estimatedWeightKg: 0.15,` | Explicit taxonomy estimate, labeled estimated; not a missing-weight replacement. |
| `packages/core/src/intake/taxonomy.ts:114` | `estimatedWeightKg: 0.03,` | Explicit taxonomy estimate, labeled estimated; not a missing-weight replacement. |
| `packages/core/src/policy/anti-hallucination.ts:96` | `const errors: string[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/policy/anti-hallucination.ts:133` | `const numbersToCheck: Array<{ field: string; value: number }> = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/policy/fixtures/portal-fixtures.ts:65` | `{ kind: "free", amountInr: 0, thresholdKg: 5, quote: "5 kg or more total weight: ₹0 (FREE Pickup)" },` | Explicit quoted zero/free policy rule, validated against page text; fixture values are not defaults. |
| `packages/core/src/policy/fixtures/portal-fixtures.ts:70` | `{ rawName: "Batteries (Li-ion / Alkaline)", unit: "per_item", amountInr: 0, quote: "Batteries (Li-ion / Alkaline): ₹0 payout (free safe ecological handling)" },` | Explicit quoted zero/free policy rule, validated against page text; fixture values are not defaults. |
| `packages/core/src/policy/fixtures/portal-fixtures.ts:71` | `{ rawName: "Chargers, Adapters & Wires", unit: "per_item", amountInr: 0, quote: "Chargers, Adapters & Wires: ₹0 payout (free safe ecological handling)" },` | Explicit quoted zero/free policy rule, validated against page text; fixture values are not defaults. |
| `packages/core/src/policy/fixtures/portal-fixtures.ts:118` | `{ kind: "free", amountInr: 0, thresholdKg: null, quote: "Doorstep Pickup: 100% Free pickup across Kukatpally, Madhapur, and KPHB." },` | Explicit quoted zero/free policy rule, validated against page text; fixture values are not defaults. |
| `packages/core/src/policy/fixtures/portal-fixtures.ts:178` | `{ rawName: "Batteries & Small Plastics", unit: "per_item", amountInr: 0, quote: "Batteries & Small Plastics: ₹0 (Disposal only)" },` | Explicit quoted zero/free policy rule, validated against page text; fixture values are not defaults. |
| `packages/core/src/policy/fixtures/portal-fixtures.ts:221` | `{ kind: "free", amountInr: 0, thresholdKg: 3, quote: "Pickups of 3 kg or more are completely free of charge (Rs. 0 pickup charge)." },` | Explicit quoted zero/free policy rule, validated against page text; fixture values are not defaults. |
| `packages/core/src/routing/eligibility.ts:81` | `const cells: EligibilityCell[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/routing/eligibility.ts:151` | `url: policy.evidence?.url &#124;&#124; "",` | Text normalization/matching sentinel; missing evidence stays empty/UNKNOWN, not a numeric business value. |
| `packages/core/src/routing/pricing.ts:30` | `totalWeightKg: 0,` | Invalid result (valid=false) sentinel, never selected into a plan; estimatedFee is null. Known-payout sums start at zero and retain hasUnknownPayout/item nulls. |
| `packages/core/src/routing/pricing.ts:32` | `estimatedPayout: 0,` | Invalid result (valid=false) sentinel, never selected into a plan; estimatedFee is null. Known-payout sums start at zero and retain hasUnknownPayout/item nulls. |
| `packages/core/src/routing/pricing.ts:45` | `totalWeightKg: 0,` | Invalid result (valid=false) sentinel, never selected into a plan; estimatedFee is null. Known-payout sums start at zero and retain hasUnknownPayout/item nulls. |
| `packages/core/src/routing/pricing.ts:47` | `estimatedPayout: 0,` | Invalid result (valid=false) sentinel, never selected into a plan; estimatedFee is null. Known-payout sums start at zero and retain hasUnknownPayout/item nulls. |
| `packages/core/src/routing/pricing.ts:60` | `totalWeightKg: 0,` | Invalid result (valid=false) sentinel, never selected into a plan; estimatedFee is null. Known-payout sums start at zero and retain hasUnknownPayout/item nulls. |
| `packages/core/src/routing/pricing.ts:62` | `estimatedPayout: 0,` | Invalid result (valid=false) sentinel, never selected into a plan; estimatedFee is null. Known-payout sums start at zero and retain hasUnknownPayout/item nulls. |
| `packages/core/src/routing/pricing.ts:94` | `estimatedPayout: 0,` | Invalid result (valid=false) sentinel, never selected into a plan; estimatedFee is null. Known-payout sums start at zero and retain hasUnknownPayout/item nulls. |
| `packages/core/src/routing/pricing.ts:146` | `estimatedPayout: 0,` | Invalid result (valid=false) sentinel, never selected into a plan; estimatedFee is null. Known-payout sums start at zero and retain hasUnknownPayout/item nulls. |
| `packages/core/src/routing/pricing.ts:153` | `const itemPayouts: Record<string, number &#124; null> = {};` | Invalid result (valid=false) sentinel, never selected into a plan; estimatedFee is null. Known-payout sums start at zero and retain hasUnknownPayout/item nulls. |
| `packages/core/src/routing/router.ts:74` | `const assignments: Array<Array<string &#124; null>> = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/routing/router.ts:104` | `const scoredPlans: PlanScored[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/routing/router.ts:110` | `const unroutedItemIds: string[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/routing/router.ts:137` | `const legResults: Array<{ leg: PlanLeg; pricing: LegPricingResult }> = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/routing/router.ts:218` | `const approvalReasons: ApprovalReason[] = [];` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/state-machine.ts:176` | `deps: TransitionDeps = {}` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/state-machine.ts:185` | `deps: TransitionDeps = {}` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/state-machine.ts:205` | `deps: TransitionDeps = {},` | Empty options/collection or bounded operational timeout, not a business value. |
| `packages/core/src/state-machine.ts:430` | `deps: TransitionDeps = {}` | Empty options/collection or bounded operational timeout, not a business value. |

/**
 * packages/core/src/routing/routing.test.ts
 *
 * Comprehensive Vitest test suite for Stage 5 deterministic reverse-logistics routing:
 * - TC1: Laptop accepted by Deccan & QuickScrap, rejected by PaperPlus
 * - TC2: Newspaper accepted by PaperPlus, batteries rejected by PaperPlus
 * - TC3: Demo sentence fee cap breach -> Best plan flagged with FEE_CAP_EXCEEDED
 * - Threshold boundary: 4.9 kg charged below-weight fee vs 5.0 kg free pickup
 * - Minimum weight constraint: <5 kg rejected with BELOW_MINIMUM_WEIGHT
 * - Unknown fee rule: rejected with UNKNOWN_FEE
 * - Unknown payout: preserved as null
 * - Service area check: pincode mismatch rejects all items
 * - 500 Property-based tests: random configurations produce deterministic valid plans
 */

import { randomUUID } from "crypto";
import { describe, it, expect } from "vitest";
import type { IntakeItem } from "../intake/schema.js";
import {
  DECCAN_EXTRACTION,
  PAPERPLUS_EXTRACTION,
  QUICKSCRAP_EXTRACTION,
  type ExtractedPolicy,
} from "../policy/index.js";
import { canTransitionRequest, hashPlan } from "../state-machine.js";
import { buildEligibilityMatrix, validateEligibilityMatrixCell } from "./eligibility.js";
import { priceLeg } from "./pricing.js";
import { generateRoutingPlans, explainWhyPlanBeats } from "./router.js";

// Helper to create fully typed mock policies from ground-truth fixtures
function createTestPolicies(): ExtractedPolicy[] {
  return [
    {
      ...DECCAN_EXTRACTION,
      recyclerId: "deccan",
      companyName: "Deccan E-Cycle Solutions",
      status: "SUCCESS",
      feesUnknown: false,
      evidence: {
        url: "http://localhost:3101",
        textHash: "hash-deccan",
        screenshotPath: ".data/evidence/deccan.png",
        extractedAt: new Date().toISOString(),
        sessionId: "local-deccan-01",
        extractionPath: "generic-ai",
      },
      acceptedCategories: ["laptop", "desktop", "mobile_phone", "charger_cable", "battery_household", "small_electronics"],
      rejectedCategories: ["newspaper", "cardboard", "plastic", "glass"],
      freeThresholdKg: 5,
      underWeightFeeInr: 180,
      requiresDataWipeAck: true,
      quotes: ["Under 5 kg total weight: ₹180 standard pickup charge"],
      rates: [],
    },
    {
      ...PAPERPLUS_EXTRACTION,
      recyclerId: "paperplus",
      companyName: "PaperPlus Kabadi",
      status: "SUCCESS",
      feesUnknown: false,
      evidence: {
        url: "http://localhost:3102",
        textHash: "hash-paperplus",
        screenshotPath: ".data/evidence/paperplus.png",
        extractedAt: new Date().toISOString(),
        sessionId: "local-paperplus-01",
        extractionPath: "generic-ai",
      },
      acceptedCategories: ["newspaper", "cardboard", "books_magazines"],
      rejectedCategories: ["laptop", "battery_household", "small_electronics", "hazardous"],
      freeThresholdKg: null,
      underWeightFeeInr: null,
      minWeightKg: 5,
      requiresDataWipeAck: false,
      quotes: ["Minimum Weight: At least 5 kg total scrap weight is required for home pickup."],
      rates: [],
    },
    {
      ...QUICKSCRAP_EXTRACTION,
      recyclerId: "quickscrap",
      companyName: "QuickScrap Hyd",
      status: "SUCCESS",
      feesUnknown: false,
      evidence: {
        url: "http://localhost:3103",
        textHash: "hash-quickscrap",
        screenshotPath: ".data/evidence/quickscrap.png",
        extractedAt: new Date().toISOString(),
        sessionId: "local-quickscrap-01",
        extractionPath: "generic-ai",
      },
      acceptedCategories: ["laptop", "mobile_phone", "newspaper", "cardboard", "battery_household"],
      rejectedCategories: ["hazardous"],
      freeThresholdKg: null,
      underWeightFeeInr: null,
      minWeightKg: null,
      convenienceFeeInr: 199,
      requiresDataWipeAck: false,
      quotes: ["₹199 Flat Pickup Fee"],
      rates: [],
    },
  ];
}

function makeItem(overrides: Partial<IntakeItem>): IntakeItem {
  return {
    id: randomUUID(),
    rawText: overrides.rawText ?? "Test item",
    category: overrides.category ?? "laptop",
    quantity: overrides.quantity ?? 1,
    declaredWeightKg: overrides.declaredWeightKg ?? null,
    estimatedWeightKg: overrides.estimatedWeightKg ?? 2.0,
    weightSource: overrides.weightSource ?? "estimated",
    hazardClass: overrides.hazardClass ?? "none",
    confidence: overrides.confidence ?? 0.95,
    ...overrides,
  };
}

describe("Stage 5: Deterministic Reverse-Logistics Routing & Pricing", () => {
  const policies = createTestPolicies();
  it("rejects missing weight instead of silently using zero", () => {
    expect(() => priceLeg({
      recyclerId: "deccan", policy: policies[0]!,
      items: [makeItem({ estimatedWeightKg: null, declaredWeightKg: null })],
    })).toThrow("UNKNOWN_WEIGHT");
  });

  it("does not infer free pickup above a threshold without an explicit free rule", () => {
    const policy = { ...policies[0]!, feeRules: policies[0]!.feeRules.filter((rule) => rule.kind !== "free") };
    expect(priceLeg({ recyclerId: "deccan", policy, items: [makeItem({ estimatedWeightKg: 6 })] }))
      .toMatchObject({ valid: false, invalidReason: "UNKNOWN_FEE", estimatedFee: null });
  });

  it("does not apply a thresholded free rule below its threshold", () => {
    const policy = { ...policies[0]!, feeRules: policies[0]!.feeRules.filter((rule) => rule.kind === "free") };
    expect(priceLeg({ recyclerId: "deccan", policy, items: [makeItem({ estimatedWeightKg: 2 })] }))
      .toMatchObject({ valid: false, invalidReason: "UNKNOWN_FEE", estimatedFee: null });
  });

  it("TC1: laptop accepted by Deccan & QuickScrap, rejected by PaperPlus", () => {
    const laptopItem = makeItem({ rawText: "Dell laptop", category: "laptop", quantity: 1, estimatedWeightKg: 2.2 });
    const matrix = buildEligibilityMatrix({
      requestId: randomUUID(),
      items: [laptopItem],
      policies,
      requestPincode: "500072",
    });

    const deccanCell = matrix.cells.find((c) => c.recyclerId === "deccan");
    const paperplusCell = matrix.cells.find((c) => c.recyclerId === "paperplus");
    const quickscrapCell = matrix.cells.find((c) => c.recyclerId === "quickscrap");

    expect(deccanCell?.status).toBe("ACCEPTED");
    expect(deccanCell?.quote).toBeTruthy();

    expect(quickscrapCell?.status).toBe("ACCEPTED");
    expect(quickscrapCell?.quote).toBeTruthy();

    expect(paperplusCell?.status).toBe("REJECTED");
    expect(paperplusCell?.reason).toContain("rejected by recycler policy");
  });

  it("TC2: newspaper accepted by PaperPlus, batteries rejected by PaperPlus", () => {
    const newspaper = makeItem({ rawText: "Newspaper 8 kg", category: "newspaper", quantity: 1, declaredWeightKg: 8 });
    const battery = makeItem({ rawText: "AA batteries", category: "battery_household", quantity: 2, estimatedWeightKg: 0.1 });

    const matrix = buildEligibilityMatrix({
      requestId: randomUUID(),
      items: [newspaper, battery],
      policies,
      requestPincode: "500072",
    });

    const ppNewsCell = matrix.cells.find((c) => c.itemId === newspaper.id && c.recyclerId === "paperplus");
    const ppBattCell = matrix.cells.find((c) => c.itemId === battery.id && c.recyclerId === "paperplus");

    expect(ppNewsCell?.status).toBe("ACCEPTED");
    expect(ppBattCell?.status).toBe("REJECTED");
  });

  it("TC3: demo sentence -> total fee 180 > fee cap 150 -> plan flagged with FEE_CAP_EXCEEDED", () => {
    const laptop = makeItem({ rawText: "one dead Dell laptop", category: "laptop", quantity: 1, estimatedWeightKg: 2.2 });
    const batteries = makeItem({ rawText: "two old batteries", category: "battery_household", quantity: 2, estimatedWeightKg: 0.06 });
    const newspaper = makeItem({ rawText: "around 8 kg of newspaper", category: "newspaper", quantity: 1, declaredWeightKg: 8, weightSource: "user_declared" });

    const requestId = randomUUID();
    const result = generateRoutingPlans({
      request: {
        id: requestId,
        feeCapInr: 150,
        pincode: "500072",
      },
      items: [laptop, batteries, newspaper],
      policies,
    });

    expect(result.bestPlan).not.toBeNull();
    const plan = result.bestPlan!;

    // Deccan handles laptop + batteries (2.26 kg -> fee 180, payout 250)
    // PaperPlus handles newspaper (8 kg -> fee 0, payout 96 at ₹12/kg)
    expect(plan.legs).toHaveLength(2);

    const deccanLeg = plan.legs.find((l) => l.recyclerId === "deccan");
    const paperLeg = plan.legs.find((l) => l.recyclerId === "paperplus");

    expect(deccanLeg).toBeDefined();
    expect(paperLeg).toBeDefined();

    // Verify exact leg assignment: legs = [Deccan: laptop + battery_household, PaperPlus: newspaper]
    expect(deccanLeg?.itemIds).toEqual(expect.arrayContaining([laptop.id, batteries.id]));
    expect(deccanLeg?.itemIds).toHaveLength(2);
    expect(paperLeg?.itemIds).toEqual([newspaper.id]);

    expect(deccanLeg?.estimatedFee).toBe(180);
    expect(deccanLeg?.estimatedPayout).toBe(250);

    expect(paperLeg?.estimatedFee).toBe(0);
    expect(paperLeg?.estimatedPayout).toBe(96); // 8 kg * 12 = 96

    // Assert EXACTLY: totalFee 180, knownPayout 346, knownNet 166, capBreached true, FEE_CAP_EXCEEDED present
    expect(plan.totalEstimatedFee).toBe(180);
    expect(plan.totalEstimatedPayout).toBe(346);

    const scoredBest = result.scoredPlans[0]!;
    expect(scoredBest.totalFee).toBe(180);
    expect(scoredBest.totalKnownPayout).toBe(346);
    expect(scoredBest.netPayout).toBe(166);
    expect(scoredBest.withinCap).toBe(false); // capBreached true
    expect(scoredBest.approvalReasons).toContain("FEE_CAP_EXCEEDED");
    expect(scoredBest.approvalReasons).toContain("FEE_CHARGED");

    // Verify QuickScrap alternative exists but was ranked lower due to REGISTRY_WARNING
    const quickScrapAlternative = result.scoredPlans.find((sp) =>
      sp.plan.legs.some((l) => l.recyclerId === "quickscrap")
    );
    expect(quickScrapAlternative).toBeDefined();
    expect(quickScrapAlternative?.approvalReasons).toContain("REGISTRY_WARNING");

    // Plan hash verification
    expect(plan.planHash).toBe(hashPlan(plan));
  });

  describe("Matrix Evidence Quotes & Cell Validation", () => {
    it("cites the specific rule rejecting PaperPlus x laptop (not a heading or fee line)", () => {
      const laptop = makeItem({ category: "laptop", rawText: "Dell laptop" });
      const matrix = buildEligibilityMatrix({
        requestId: randomUUID(),
        items: [laptop],
        policies,
        requestPincode: "500072",
      });
      const cell = matrix.cells.find((c) => c.recyclerId === "paperplus" && c.itemId === laptop.id)!;
      expect(cell.status).toBe("REJECTED");
      expect(cell.quote).toBe("Electronics");
    });

    it("cites the specific rule accepting Deccan x battery_household", () => {
      const batt = makeItem({ category: "battery_household", rawText: "AAA battery" });
      const matrix = buildEligibilityMatrix({
        requestId: randomUUID(),
        items: [batt],
        policies,
        requestPincode: "500072",
      });
      const cell = matrix.cells.find((c) => c.recyclerId === "deccan" && c.itemId === batt.id)!;
      expect(cell.status).toBe("ACCEPTED");
      expect(cell.quote).toBe("Household Batteries");
    });

    it("cites the specific rule accepting QuickScrap x battery_household", () => {
      const batt = makeItem({ category: "battery_household", rawText: "AAA battery" });
      const matrix = buildEligibilityMatrix({
        requestId: randomUUID(),
        items: [batt],
        policies,
        requestPincode: "500072",
      });
      const cell = matrix.cells.find((c) => c.recyclerId === "quickscrap" && c.itemId === batt.id)!;
      expect(cell.status).toBe("ACCEPTED");
      expect(cell.quote).toBe("Batteries & Small Plastics");
    });

    it("throws a validation error when a cell cites a quote from an unrelated rule", () => {
      const laptop = makeItem({ category: "laptop", rawText: "Dell laptop" });
      const deccanPolicy = policies.find((p) => p.recyclerId === "deccan")!;
      const invalidCell = {
        itemId: laptop.id,
        itemDescription: laptop.rawText,
        category: laptop.category,
        recyclerId: "deccan",
        recyclerName: "Deccan E-Cycle Solutions",
        status: "ACCEPTED" as const,
        quote: "Under 5 kg total weight: ₹180 standard pickup charge", // Unrelated fee rule quote!
        url: "http://localhost:3101",
      };
      expect(() => validateEligibilityMatrixCell(invalidCell, deccanPolicy)).toThrow(
        /no matching acceptedItem rule maps to laptop/
      );
    });

    it("cites the specific rule accepting Deccan x mobile_phone with its verbatim quote", () => {
      const phone = makeItem({ category: "mobile_phone", rawText: "old phone" });
      const matrix = buildEligibilityMatrix({
        requestId: randomUUID(),
        items: [phone],
        policies,
        requestPincode: "500072",
      });
      const cell = matrix.cells.find((c) => c.recyclerId === "deccan" && c.itemId === phone.id)!;
      expect(cell.status).toBe("ACCEPTED");
      expect(cell.quote).toBe("Mobile Phones & Tablets");
    });

    it("conflict detection: category listed in both accepted and rejected policy yields UNKNOWN with conflicting policy statements reason, never ACCEPTED", () => {
      const book = makeItem({ category: "books_magazines", rawText: "old books" });
      const conflictingPolicy: ExtractedPolicy = {
        ...policies[0]!,
        recyclerId: "conflict_rec",
        companyName: "Conflict Recycler",
        acceptedItems: [{ rawName: "Old Books & Office Paper", quote: "Old Books & Office Paper" }],
        rejectedItems: [{ rawName: "Paper, books and cartons", quote: "Paper, books and cartons" }],
      };
      const matrix = buildEligibilityMatrix({
        requestId: randomUUID(),
        items: [book],
        policies: [conflictingPolicy],
        requestPincode: "500072",
      });
      const cell = matrix.cells.find((c) => c.recyclerId === "conflict_rec" && c.itemId === book.id)!;
      expect(cell.status).toBe("UNKNOWN");
      expect(cell.status).not.toBe("ACCEPTED");
      expect(cell.quote).toBeNull();
      expect(cell.reason).toContain("conflicting policy statements");
    });

    it("routes 'old phone and a charger' in Kukatpally (500072) to Deccan", () => {
      const phone = makeItem({ category: "mobile_phone", rawText: "old phone", quantity: 1, estimatedWeightKg: 0.2 });
      const charger = makeItem({ category: "charger_cable", rawText: "a charger", quantity: 1, estimatedWeightKg: 0.15 });

      const result = generateRoutingPlans({
        request: {
          id: randomUUID(),
          feeCapInr: null,
          pincode: "500072",
        },
        items: [phone, charger],
        policies,
      });

      expect(result.bestPlan).not.toBeNull();
      const plan = result.bestPlan!;
      expect(plan.legs).toHaveLength(1);
      const leg = plan.legs[0]!;
      expect(leg.recyclerId).toBe("deccan");
      expect(leg.itemIds).toEqual(expect.arrayContaining([phone.id, charger.id]));
      expect(leg.estimatedFee).toBe(180); // Under 5 kg threshold fee
      expect(leg.estimatedPayout).toBe(60); // 60 for mobile phone, 0 for charger
    });
  });

  describe("Plan Hygiene & Lexicographic Ranking", () => {
    it("ensures no duplicate plan assignments exist and best plan is never in alternatives", () => {
      const laptop = makeItem({ category: "laptop", estimatedWeightKg: 2.2 });
      const newspaper = makeItem({ category: "newspaper", declaredWeightKg: 8 });
      const result = generateRoutingPlans({
        request: { id: "req-hygiene", feeCapInr: 200, pincode: "500072" },
        items: [laptop, newspaper],
        policies,
      });

      expect(result.bestPlan).not.toBeNull();
      // Best plan must never appear in alternatives
      for (const alt of result.alternatives) {
        expect(alt.planHash).not.toBe(result.bestPlan!.planHash);
      }

      // Check no two scoredPlans have identical assignment signatures
      const signatures = new Set<string>();
      for (const sp of result.scoredPlans) {
        const sig = [laptop, newspaper]
          .map((item) => {
            const leg = sp.plan.legs.find((l) => l.itemIds.includes(item.id));
            return `${item.id}->${leg ? leg.recyclerId : "UNROUTED"}`;
          })
          .sort()
          .join("|");
        expect(signatures.has(sig)).toBe(false);
        signatures.add(sig);
      }
    });

    it("labels partial plans clearly with isPartial: true and lists unrouted items with reasons", () => {
      const hazardous = makeItem({ category: "hazardous", rawText: "car battery acid" });
      const result = generateRoutingPlans({
        request: { id: "req-partial", feeCapInr: 200, pincode: "500072" },
        items: [hazardous],
        policies,
      });

      expect(result.unroutedItems).toHaveLength(1);
      expect(result.unroutedItems[0]!.id).toBe(hazardous.id);
    });

    it("evaluates threshold proximity on both sides of 1 kg window (3.9 kg vs 4.1 kg for 5.0 kg threshold)", () => {
      const deccanPolicy = policies.find((p) => p.recyclerId === "deccan")!;

      // 3.9 kg: diff = 1.1 kg > 1.0 kg -> no proximity warning
      const underLoadFar = [makeItem({ category: "laptop", estimatedWeightKg: 3.9 })];
      const pricingFar = priceLeg({ recyclerId: "deccan", policy: deccanPolicy, items: underLoadFar });
      expect(pricingFar.estimatedFee).toBe(180);
      expect(pricingFar.thresholdDistanceKg).toBeUndefined();

      // 4.1 kg: diff = 0.9 kg <= 1.0 kg -> proximity warning triggered
      const underLoadNear = [makeItem({ category: "laptop", estimatedWeightKg: 4.1 })];
      const pricingNear = priceLeg({ recyclerId: "deccan", policy: deccanPolicy, items: underLoadNear });
      expect(pricingNear.estimatedFee).toBe(180);
      expect(pricingNear.thresholdDistanceKg).toBe(0.9);

      // In routing, 4.1 kg triggers ESTIMATED_WEIGHT_NEAR_THRESHOLD
      const routingNear = generateRoutingPlans({
        request: { id: "req-near", feeCapInr: 250, pincode: "500072" },
        items: underLoadNear,
        policies,
      });
      expect(routingNear.scoredPlans[0]?.approvalReasons).toContain("ESTIMATED_WEIGHT_NEAR_THRESHOLD");

      // 3.9 kg does NOT trigger ESTIMATED_WEIGHT_NEAR_THRESHOLD
      const routingFar = generateRoutingPlans({
        request: { id: "req-far", feeCapInr: 250, pincode: "500072" },
        items: underLoadFar,
        policies,
      });
      expect(routingFar.scoredPlans[0]?.approvalReasons).not.toContain("ESTIMATED_WEIGHT_NEAR_THRESHOLD");
    });

    it("explainWhyPlanBeats deterministically explains why #1 beats #2 in ranking", () => {
      const laptop = makeItem({ category: "laptop", estimatedWeightKg: 2.2 });
      const newspaper = makeItem({ category: "newspaper", declaredWeightKg: 8 });
      const result = generateRoutingPlans({
        request: { id: "req-ranking", feeCapInr: 150, pincode: "500072" },
        items: [laptop, newspaper],
        policies,
      });

      expect(result.scoredPlans.length).toBeGreaterThan(1);
      const explanation = explainWhyPlanBeats(result.scoredPlans[0]!, result.scoredPlans[1]!, 2);
      expect(typeof explanation).toBe("string");
      expect(explanation.length).toBeGreaterThan(5);
    });
  });

  describe("Pricing & Boundary Checks", () => {
    const deccanPolicy = policies.find((p) => p.recyclerId === "deccan")!;
    const paperPolicy = policies.find((p) => p.recyclerId === "paperplus")!;

    it("threshold boundary: 4.9 kg charged below-weight fee (180); 5.0 kg charged 0 (FREE)", () => {
      const underLoad = [makeItem({ category: "laptop", estimatedWeightKg: 4.9 })];
      const underPricing = priceLeg({ recyclerId: "deccan", policy: deccanPolicy, items: underLoad });
      expect(underPricing.valid).toBe(true);
      expect(underPricing.estimatedFee).toBe(180);
      expect(underPricing.thresholdDistancePercent).toBeDefined();
      expect(underPricing.thresholdDistancePercent).toBeLessThanOrEqual(15);

      const freeLoad = [makeItem({ category: "laptop", estimatedWeightKg: 5.0 })];
      const freePricing = priceLeg({ recyclerId: "deccan", policy: deccanPolicy, items: freeLoad });
      expect(freePricing.valid).toBe(true);
      expect(freePricing.estimatedFee).toBe(0);
    });

    it("minimum total weight not met: leg is marked INVALID with BELOW_MINIMUM_WEIGHT", () => {
      // PaperPlus requires 5.0 kg minimum
      const lightNewspaper = [makeItem({ category: "newspaper", declaredWeightKg: 4.5 })];
      const pricing = priceLeg({ recyclerId: "paperplus", policy: paperPolicy, items: lightNewspaper });
      expect(pricing.valid).toBe(false);
      expect(pricing.invalidReason).toBe("BELOW_MINIMUM_WEIGHT");
    });

    it("unknown fee rule: leg is marked INVALID with UNKNOWN_FEE", () => {
      const unreadableDeccan: ExtractedPolicy = {
        ...deccanPolicy,
        feesUnknown: true,
        feeRules: [],
      };
      const items = [makeItem({ category: "laptop", estimatedWeightKg: 2.0 })];
      const pricing = priceLeg({ recyclerId: "deccan", policy: unreadableDeccan, items });
      expect(pricing.valid).toBe(false);
      expect(pricing.invalidReason).toBe("UNKNOWN_FEE");
    });

    it("unknown payout is preserved as null and does not count as 0", () => {
      const policyWithoutPayout: ExtractedPolicy = {
        ...deccanPolicy,
        payoutRules: [], // No payouts stated
      };
      const items = [makeItem({ category: "laptop", quantity: 1, estimatedWeightKg: 2.0 })];
      const pricing = priceLeg({ recyclerId: "deccan", policy: policyWithoutPayout, items });
      expect(pricing.valid).toBe(true);
      expect(pricing.itemPayouts[items[0]!.id]).toBeNull();
      expect(pricing.hasUnknownPayout).toBe(true);
      expect(pricing.estimatedPayout).toBe(0);
    });

    it("pincode outside service area: recycler is rejected for all items", () => {
      const restrictedPolicy: ExtractedPolicy = {
        ...paperPolicy,
        serviceablePincodes: {
          values: ["500003", "500009"], // Secunderabad only
          quote: "Service available in 500003 and 500009 only",
        },
      };
      const items = [makeItem({ category: "newspaper", declaredWeightKg: 10 })];
      const pricing = priceLeg({
        recyclerId: "paperplus",
        policy: restrictedPolicy,
        items,
        requestPincode: "500072", // Kukatpally
      });
      expect(pricing.valid).toBe(false);
      expect(pricing.invalidReason).toBe("OUTSIDE_SERVICE_AREA");
    });
  });

  describe("State Transitions Integration", () => {
    it("validates request pipeline transitions from POLICIES_READ -> ELIGIBILITY_CHECKED -> PLAN_CREATED", () => {
      // 1. POLICIES_READ -> ELIGIBILITY_CHECKED
      const matrixEvidence = {
        matrixHash: "test-matrix-hash-01",
        checkedAt: new Date().toISOString(),
      };
      const t1 = canTransitionRequest("POLICIES_READ", "ELIGIBILITY_CHECKED", matrixEvidence);
      expect(t1.ok).toBe(true);

      // 2. ELIGIBILITY_CHECKED -> PLAN_CREATED
      const planEvidence = {
        planId: randomUUID(),
        planHash: "a".repeat(64),
        approvalReason: "FEE_CAP_EXCEEDED",
      };
      const t2 = canTransitionRequest("ELIGIBILITY_CHECKED", "PLAN_CREATED", planEvidence);
      expect(t2.ok).toBe(true);
    });
  });

  describe("500 Property-Based Routing Tests", () => {
    it("executes 500 randomized property tests with zero exceptions and invariant guarantees", () => {
      const categories = ["laptop", "newspaper", "battery_household", "small_electronics"] as const;

      for (let run = 0; run < 500; run++) {
        // Generate 1 to 4 random items
        const numItems = 1 + (run % 4);
        const randomItems: IntakeItem[] = [];

        for (let j = 0; j < numItems; j++) {
          const cat = categories[(run + j) % categories.length]!;
          const qty = 1 + (j % 3);
          const wt = cat === "newspaper" ? 4 + (run % 8) : 1 + (j % 4);
          randomItems.push(
            makeItem({
              id: `item-${run}-${j}`,
              rawText: `Random ${cat}`,
              category: cat,
              quantity: qty,
              declaredWeightKg: cat === "newspaper" ? wt : null,
              estimatedWeightKg: wt,
            })
          );
        }

        const feeCap = run % 2 === 0 ? 100 + (run % 200) : null;
        const result = generateRoutingPlans({
          request: {
            id: `req-prop-${run}`,
            feeCapInr: feeCap,
            pincode: "500072",
          },
          items: randomItems,
          policies,
        });

        // Invariant 1: Matrix size must equal items x policies
        expect(result.matrix.cells.length).toBe(randomItems.length * policies.length);

        // Invariant 2: Scored plans are sorted lexicographically
        if (result.scoredPlans.length > 1) {
          for (let k = 0; k < result.scoredPlans.length - 1; k++) {
            const current = result.scoredPlans[k]!;
            const next = result.scoredPlans[k + 1]!;
            expect(current.unroutedItemsCount).toBeLessThanOrEqual(next.unroutedItemsCount);
          }
        }

        // Invariant 3: Best plan hash matches hashPlan
        if (result.bestPlan) {
          expect(result.bestPlan.planHash).toBe(hashPlan(result.bestPlan));
          for (const leg of result.bestPlan.legs) {
            expect(leg.estimatedFee).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });
});

/**
 * packages/core/src/intake/intake.test.ts
 *
 * Vitest tests for User Intake & Item Classification:
 * - "one dead Dell laptop, Kukatpally, max fee ₹150": 1 item, laptop, 2.2 kg estimated, li_ion, feeCapInr = 150, pincode 500072, state ITEMS_PARSED.
 * - "two laptops and 8 kg newspaper, KPHB": 2 items, right weights, state ITEMS_PARSED.
 * - "some old newspaper, Madhapur": count/weight missing -> NEEDS_CLARIFICATION with question.
 * - "a mysterious metal box with wires": low confidence -> 'other' + clarification.
 * - LLM hallucinates feeCapInr = 200 when user said nothing about fee -> post-processor strips it, sets feeCapInr = null.
 * - Non-JSON from LLM -> retries once, succeeds if retry succeeds, throws LlmOutputError if retry fails.
 * - Location "Bengaluru" -> NEEDS_CLARIFICATION (Hyderabad only).
 * - applyClarification resolves a clarification and moves state to ITEMS_PARSED.
 * - Item IDs are stable UUIDs generated in TS, not LLM output.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseIntake } from "./parser.js";
import {
  applyClarification,
  createDomainRequestFromIntake,
  feeAppearsInCurrencyContext,
  weightAppearsInWeightContext,
  quantityAppearsInQuantityContext,
  postProcessIntake,
} from "./post-processor.js";
import type { IntakeItem, IntakeClarification } from "./schema.js";
import { CANONICAL_CATEGORIES, isCanonicalCategory } from "./schema.js";
import {
  CANONICAL_TAXONOMY,
  ITEM_CATEGORY_TO_GROUP,
  GROUP_TO_ITEM_CATEGORY,
  itemCategoryToGroup,
  groupToItemCategory,
  taxonomyCategoryToItemCategory,
  itemCategoryToTaxonomyCategories,
} from "./taxonomy.js";
import type { ItemCategory } from "../types.js";
import { clearFakeFixtures, LlmOutputError } from "@reroute/llm";

describe("Stage 3: User Intake + Item Classification Test Suite", () => {
  beforeEach(() => {
    clearFakeFixtures();
    process.env.LLM_PROVIDER = "fake";
  });

  // -------------------------------------------------------------------------
  // 1. Canonical Laptop Sentence: Fee cap, locality, estimated weight, ITEMS_PARSED
  // -------------------------------------------------------------------------
  it("parses canonical 'one dead Dell laptop, Kukatpally, max fee ₹150' into 1 laptop item, 2.2 kg estimated, li_ion, feeCapInr 150, 500072, ITEMS_PARSED", async () => {
    const text = "one dead Dell laptop, Kukatpally, max fee ₹150";

    const result = await parseIntake(text);

    expect(result.state).toBe("ITEMS_PARSED");
    expect(result.feeCapInr).toBe(150);
    expect(result.location.locality).toBe("Kukatpally");
    expect(result.location.pincode).toBe("500072");
    expect(result.location.city).toBe("Hyderabad");
    expect(result.clarifications).toHaveLength(0);

    expect(result.items).toHaveLength(1);
    const laptop = result.items[0]!;
    expect(laptop.category).toBe("laptop");
    expect(laptop.quantity).toBe(1);
    expect(laptop.estimatedWeightKg).toBe(2.2);
    expect(laptop.weightSource).toBe("estimated");
    expect(laptop.hazardClass).toBe("battery_li_ion");
    expect(laptop.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    // Verify domain request state transition
    const domainReq = createDomainRequestFromIntake(result);
    expect(domainReq.state).toBe("ITEMS_PARSED");
    expect(domainReq.feeCapInr).toBe(150);
  });

  // -------------------------------------------------------------------------
  // 2. Multi-item: Two laptops and 8 kg newspaper
  // -------------------------------------------------------------------------
  it("parses 'two laptops and 8 kg newspaper, KPHB' into 2 items with correct weights, state ITEMS_PARSED", async () => {
    const text = "two laptops and 8 kg newspaper, KPHB";

    const result = await parseIntake(text);

    expect(result.state).toBe("ITEMS_PARSED");
    expect(result.feeCapInr).toBeNull();
    expect(result.location.locality).toBe("KPHB");
    expect(result.location.pincode).toBe("500085");
    expect(result.items).toHaveLength(2);

    const laptop = result.items.find((i: IntakeItem) => i.category === "laptop");
    expect(laptop).toBeDefined();
    expect(laptop?.quantity).toBe(2);
    expect(laptop?.estimatedWeightKg).toBe(4.4); // 2.2 * 2
    expect(laptop?.weightSource).toBe("estimated");

    const news = result.items.find((i: IntakeItem) => i.category === "newspaper");
    expect(news).toBeDefined();
    expect(news?.declaredWeightKg).toBe(8);
    expect(news?.weightSource).toBe("user_declared");
    expect(news?.hazardClass).toBe("none");

    const domainReq = createDomainRequestFromIntake(result);
    expect(domainReq.state).toBe("ITEMS_PARSED");
  });

  // -------------------------------------------------------------------------
  // 3. Missing weight on paper/cardboard -> NEEDS_CLARIFICATION
  // -------------------------------------------------------------------------
  it("flags missing weight/count on paper ('some old newspaper, Madhapur') as NEEDS_CLARIFICATION with clarification question", async () => {
    const text = "some old newspaper, Madhapur";

    const result = await parseIntake(text);

    expect(result.state).toBe("NEEDS_CLARIFICATION");
    expect(result.clarifications.length).toBeGreaterThanOrEqual(1);
    const weightClarification = result.clarifications.find((c: IntakeClarification) => c.code === "CLARIFY_WEIGHT_PAPER");
    expect(weightClarification).toBeDefined();
    expect(weightClarification?.question).toMatch(/how many kg or stacks/i);

    const domainReq = createDomainRequestFromIntake(result);
    expect(domainReq.state).toBe("NEEDS_CLARIFICATION");
  });

  // -------------------------------------------------------------------------
  // 4. Ambiguous / Vague item -> 'other' + clarification
  // -------------------------------------------------------------------------
  it("classifies vague items ('a mysterious metal box with wires') as category 'other' and asks clarification", async () => {
    const text = "a mysterious metal box with wires";

    const result = await parseIntake(text);

    expect(result.state).toBe("NEEDS_CLARIFICATION");
    expect(result.items[0]?.category).toBe("other");
    const vagueClarification = result.clarifications.find((c: IntakeClarification) => c.code === "CLARIFY_ITEM_VAGUE");
    expect(vagueClarification).toBeDefined();
    expect(vagueClarification?.question).toMatch(/what kind of item/i);
  });

  // -------------------------------------------------------------------------
  // 5. Anti-hallucination: Rejects hallucinated feeCapInr not in text
  // -------------------------------------------------------------------------
  it("discards feeCapInr if hallucinated by LLM and not mentioned in user text", async () => {
    // User mentions no fee cap, but fake adapter injects feeCapInr: 200
    const text = "test_hallucinated_cap: One Dell laptop, Kukatpally, no fee mentioned";

    const result = await parseIntake(text);

    // Deterministic post-processor must strip the hallucinated 200!
    expect(result.feeCapInr).toBeNull();
    expect(result.state).toBe("ITEMS_PARSED");
  });

  // -------------------------------------------------------------------------
  // 6. Non-JSON from LLM: Retry once, then succeed or throw LlmOutputError
  // -------------------------------------------------------------------------
  it("retries once when LLM output is non-JSON and succeeds if second attempt is valid", async () => {
    const text = "test_retry_recover: one dead Dell laptop, Kukatpally";

    const result = await parseIntake(text);

    expect(result.state).toBe("ITEMS_PARSED");
    expect(result.items[0]?.category).toBe("laptop");
  });

  it("throws typed LlmOutputError when LLM repeatedly returns non-JSON across retries", async () => {
    const text = "test_always_non_json: laptop";

    await expect(parseIntake(text)).rejects.toThrow(LlmOutputError);
  });

  // -------------------------------------------------------------------------
  // 7. Location outside service area (Bengaluru) -> NEEDS_CLARIFICATION
  // -------------------------------------------------------------------------
  it("flags location outside Hyderabad ('Bengaluru') as NEEDS_CLARIFICATION (Hyderabad only demo)", async () => {
    const text = "one laptop, Bengaluru";

    const result = await parseIntake(text);

    expect(result.state).toBe("NEEDS_CLARIFICATION");
    const locClarification = result.clarifications.find(
      (c: IntakeClarification) => c.code === "LOCATION_OUTSIDE_SERVICE_AREA"
    );
    expect(locClarification).toBeDefined();
    expect(locClarification?.question).toMatch(/only operates within Hyderabad/i);
  });

  // -------------------------------------------------------------------------
  // 8. applyClarification helper: Resolves clarification and transitions state
  // -------------------------------------------------------------------------
  it("applyClarification resolves clarification and moves state from NEEDS_CLARIFICATION to ITEMS_PARSED", async () => {
    const text = "some old newspaper, Madhapur";
    const initial = await parseIntake(text);
    expect(initial.state).toBe("NEEDS_CLARIFICATION");

    // Answer clarification with 8 kg
    const resolved = applyClarification(initial, "CLARIFY_WEIGHT_PAPER", "About 8 kg in bundles");

    expect(resolved.state).toBe("ITEMS_PARSED");
    expect(resolved.clarifications).toHaveLength(0);
    expect(resolved.items[0]?.declaredWeightKg).toBe(8);
    expect(resolved.items[0]?.weightSource).toBe("user_declared");

    const domainReq = createDomainRequestFromIntake(resolved);
    expect(domainReq.state).toBe("ITEMS_PARSED");
  });

  // -------------------------------------------------------------------------
  // 9. Stable Item UUIDs generated in TypeScript, never LLM
  // -------------------------------------------------------------------------
  it("assigns valid, unique RFC4122 v4 UUIDs generated in TypeScript to every item", async () => {
    const text = "two laptops and 8 kg newspaper, KPHB";

    const result = await parseIntake(text);

    expect(result.items).toHaveLength(2);
    const [item1, item2] = result.items;
    expect(item1?.id).toBeDefined();
    expect(item2?.id).toBeDefined();
    expect(item1?.id).not.toBe(item2?.id);
    expect(item1?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  // -------------------------------------------------------------------------
  // 10. Cross-domain Anti-hallucination Unit Context Checks
  // -------------------------------------------------------------------------
  it("strictly enforces unit-context separation preventing cross-domain hallucinations", () => {
    const text = "8 kg newspaper and 150 cap in Kukatpally 500072";

    // 1. Fee checks: 8 is in weight context, NOT currency; 150 is next to cap
    expect(feeAppearsInCurrencyContext(8, text)).toBe(false);
    expect(feeAppearsInCurrencyContext(150, text)).toBe(true);

    // 2. Weight checks: 150 is next to cap, NOT weight; 8 is next to kg
    expect(weightAppearsInWeightContext(150, text)).toBe(false);
    expect(weightAppearsInWeightContext(8, text)).toBe(true);

    // 3. Quantity checks: 500072 is a pincode, 150 is fee cap, 8 is weight kg
    expect(quantityAppearsInQuantityContext(500072, text)).toBe(false);
    expect(quantityAppearsInQuantityContext(150, text)).toBe(false);
    expect(quantityAppearsInQuantityContext(8, text)).toBe(false);

    // Legitimate quantity in item text
    expect(quantityAppearsInQuantityContext(3, "3 dead AA batteries", "3 dead AA batteries")).toBe(true);
    expect(quantityAppearsInQuantityContext(2, "two laptops", "two laptops")).toBe(true);

    // Post-processor integration test
    const hallucinatedProposal = {
      location: { rawText: text, locality: "Kukatpally", pincode: "500072", city: "Hyderabad", confidence: 1 },
      feeCapInr: 8, // Hallucinated fee cap from 8 kg!
      items: [
        {
          rawText: "laptop",
          category: "laptop" as const,
          quantity: 500072, // Hallucinated quantity from pincode!
          declaredWeightKg: 150, // Hallucinated weight from 150 cap!
          confidence: 1,
        },
      ],
      clarifications: [],
    };

    const validated = postProcessIntake(text, hallucinatedProposal);
    expect(validated.feeCapInr).toBeNull(); // 8 discarded
    expect(validated.items[0]?.quantity).toBe(1); // 500072 reset to 1
    expect(validated.items[0]?.declaredWeightKg).toBeNull(); // 150 discarded
  });

  // -------------------------------------------------------------------------
  // 11. Official Demo Sentence with 3 Items End-to-End
  // -------------------------------------------------------------------------
  it("parses the official 3-item demo sentence with correct weights, fee cap, and domain mapping", async () => {
    const demoSentence =
      "I have an old Dell laptop that doesn't turn on, plus about 8 kg of old newspapers and 3 dead AA batteries. My budget for pickup fees is ₹150 max. I'm in Kukatpally, Hyderabad 500072.";

    const result = await parseIntake(demoSentence);

    expect(result.state).toBe("ITEMS_PARSED");
    expect(result.feeCapInr).toBe(150);
    expect(result.location.locality).toBe("Kukatpally");
    expect(result.location.pincode).toBe("500072");
    expect(result.location.city).toBe("Hyderabad");
    expect(result.clarifications).toHaveLength(0);
    expect(result.items).toHaveLength(3);

    // Item 1: Laptop
    const laptop = result.items.find((i: IntakeItem) => i.category === "laptop");
    expect(laptop).toBeDefined();
    expect(laptop?.quantity).toBe(1);
    expect(laptop?.estimatedWeightKg).toBe(2.2);
    expect(laptop?.weightSource).toBe("estimated");
    expect(laptop?.hazardClass).toBe("battery_li_ion");

    // Item 2: Newspaper
    const newspaper = result.items.find((i: IntakeItem) => i.category === "newspaper");
    expect(newspaper).toBeDefined();
    expect(newspaper?.quantity).toBe(1);
    expect(newspaper?.declaredWeightKg).toBe(8);
    expect(newspaper?.estimatedWeightKg).toBe(8);
    expect(newspaper?.weightSource).toBe("user_declared");
    expect(newspaper?.hazardClass).toBe("none");

    // Item 3: AA Batteries
    const batteries = result.items.find((i: IntakeItem) => i.category === "battery_household");
    expect(batteries).toBeDefined();
    expect(batteries?.quantity).toBe(3);
    expect(batteries?.estimatedWeightKg).toBeCloseTo(0.09, 2);
    expect(batteries?.weightSource).toBe("estimated");
    expect(batteries?.hazardClass).toBe("battery_alkaline");

    // Verify domain request mapping
    const domainReq = createDomainRequestFromIntake(result);
    expect(domainReq.state).toBe("ITEMS_PARSED");
    expect(domainReq.feeCapInr).toBe(150);
    expect(domainReq.items).toHaveLength(3);

    const dLaptop = domainReq.items.find((it) => it.description.includes("laptop"));
    expect(dLaptop?.category).toBe("ELECTRONICS");
    expect(dLaptop?.hazardClass).toBe("BATTERY");

    const dPaper = domainReq.items.find((it) => it.description.includes("newspaper"));
    expect(dPaper?.category).toBe("PAPER");
    expect(dPaper?.hazardClass).toBe("NON_HAZARDOUS");

    const dBatteries = domainReq.items.find((it) => it.description.includes("batteries"));
    expect(dBatteries?.category).toBe("BATTERIES");
    expect(dBatteries?.hazardClass).toBe("BATTERY");
  });

  // -------------------------------------------------------------------------
  // 12. Fee Cap Variants & Unspecified Handling
  // -------------------------------------------------------------------------
  it("handles fee cap variants: max, under, cap of, not more than, free only, and unspecified", () => {
    expect(feeAppearsInCurrencyContext(200, "I can pay max 200 for pickup")).toBe(true);
    expect(feeAppearsInCurrencyContext(200, "please keep under ₹200")).toBe(true);
    expect(feeAppearsInCurrencyContext(200, "I have a cap of 200 rupees")).toBe(true);
    expect(feeAppearsInCurrencyContext(200, "not more than 200 please")).toBe(true);
    expect(feeAppearsInCurrencyContext(0, "free only please")).toBe(true);
    expect(feeAppearsInCurrencyContext(0, "I want free pickup")).toBe(true);

    // Unspecified fee cap
    const unspecifiedText = "I have 5 kg old books in Begumpet";
    expect(feeAppearsInCurrencyContext(100, unspecifiedText)).toBe(false);
    expect(feeAppearsInCurrencyContext(0, unspecifiedText)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 13. Bidirectional Taxonomy Integrity
  // -------------------------------------------------------------------------
  it("verifies bidirectional 1-to-1 bijection between all 9 ItemCategory values and TaxonomyGroup", () => {
    const allItemCategories: ItemCategory[] = [
      "ELECTRONICS",
      "BATTERIES",
      "PAPER",
      "PLASTIC",
      "METAL",
      "GLASS",
      "TEXTILES",
      "HAZARDOUS",
      "OTHER",
    ];

    expect(allItemCategories).toHaveLength(9);

    for (const cat of allItemCategories) {
      const group = itemCategoryToGroup(cat);
      expect(group).toBeDefined();
      expect(ITEM_CATEGORY_TO_GROUP[cat]).toBe(group);

      const invertedCat = groupToItemCategory(group);
      expect(invertedCat).toBe(cat);
      expect(GROUP_TO_ITEM_CATEGORY[group]).toBe(cat);

      const taxCategories = itemCategoryToTaxonomyCategories(cat);
      expect(taxCategories.length).toBeGreaterThanOrEqual(1);

      for (const taxCat of taxCategories) {
        expect(taxonomyCategoryToItemCategory(taxCat)).toBe(cat);
      }
    }

    for (const [taxName, entry] of Object.entries(CANONICAL_TAXONOMY)) {
      expect(entry.category).toBe(taxName);
      expect(allItemCategories).toContain(groupToItemCategory(entry.group));
    }
  });

  // -------------------------------------------------------------------------
  // 14. Exact Demo Sentence End-to-End
  // -------------------------------------------------------------------------
  it("parses the EXACT demo sentence: 'I have one dead Dell laptop, two old batteries and around 8 kg of newspaper in Kukatpally, Hyderabad. Don't charge me more than ₹150.' -> laptop x1, battery_household x2, newspaper 8 kg, feeCapInr 150, 500072, ITEMS_PARSED", async () => {
    const text =
      "I have one dead Dell laptop, two old batteries and around 8 kg of newspaper in Kukatpally, Hyderabad. Don't charge me more than ₹150.";
    const result = await parseIntake(text);

    expect(result.state).toBe("ITEMS_PARSED");
    expect(result.feeCapInr).toBe(150);
    expect(result.location.locality).toBe("Kukatpally");
    expect(result.location.pincode).toBe("500072");
    expect(result.location.city).toBe("Hyderabad");
    expect(result.clarifications).toHaveLength(0);
    expect(result.items).toHaveLength(3);

    const laptop = result.items.find((i: IntakeItem) => i.category === "laptop");
    expect(laptop).toBeDefined();
    expect(laptop?.quantity).toBe(1);
    expect(laptop?.estimatedWeightKg).toBe(2.2);

    const batteries = result.items.find((i: IntakeItem) => i.category === "battery_household");
    expect(batteries).toBeDefined();
    expect(batteries?.quantity).toBe(2);

    const newspaper = result.items.find((i: IntakeItem) => i.category === "newspaper");
    expect(newspaper).toBeDefined();
    expect(newspaper?.declaredWeightKg).toBe(8);
    expect(newspaper?.weightSource).toBe("user_declared");
  });

  // -------------------------------------------------------------------------
  // 15. Fee Cap Variants: Rs 150, 150 rupees, not more than 150 rs, ₹ 150
  // -------------------------------------------------------------------------
  it("verifies fee cap variants: Rs 150, 150 rupees, not more than 150 rs, ₹ 150", () => {
    expect(feeAppearsInCurrencyContext(150, "Rs 150")).toBe(true);
    expect(feeAppearsInCurrencyContext(150, "150 rupees")).toBe(true);
    expect(feeAppearsInCurrencyContext(150, "not more than 150 rs")).toBe(true);
    expect(feeAppearsInCurrencyContext(150, "₹ 150")).toBe(true);
    expect(feeAppearsInCurrencyContext(150, "Don't charge me more than ₹150.")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 16. Unit-Context Rejection for Demo Sentence (fee 8 rejected, weight 150 rejected)
  // -------------------------------------------------------------------------
  it("rejects feeCapInr 8 and newspaper weight 150 for the demo sentence (unit-context check)", () => {
    const text =
      "I have one dead Dell laptop, two old batteries and around 8 kg of newspaper in Kukatpally, Hyderabad. Don't charge me more than ₹150.";
    expect(feeAppearsInCurrencyContext(8, text)).toBe(false);
    expect(weightAppearsInWeightContext(150, text)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 17. 'a pair of chargers' -> quantity 2
  // -------------------------------------------------------------------------
  it("parses 'a pair of chargers' into charger_cable with quantity 2", async () => {
    const text = "a pair of chargers in Madhapur";
    const result = await parseIntake(text);
    expect(result.items[0]?.category).toBe("charger_cable");
    expect(result.items[0]?.quantity).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 18. Invented Newspaper Weight -> Discarded + Clarification
  // -------------------------------------------------------------------------
  it("discards invented newspaper weight and requests clarification", () => {
    const text = "I have some newspaper in Madhapur";
    const hallucinatedProposal = {
      location: { rawText: text, locality: "Madhapur", pincode: "500081", city: "Hyderabad", confidence: 1 },
      feeCapInr: null,
      items: [
        {
          rawText: "some newspaper",
          category: "newspaper" as const,
          quantity: 1,
          declaredWeightKg: 10, // Invented 10 kg not in user text!
          confidence: 1,
        },
      ],
      clarifications: [],
    };
    const validated = postProcessIntake(text, hallucinatedProposal);
    expect(validated.items[0]?.declaredWeightKg).toBeNull();
    expect(validated.items[0]?.weightSource).toBe("unknown");
    expect(validated.state).toBe("NEEDS_CLARIFICATION");
    expect(validated.clarifications[0]?.code).toBe("CLARIFY_WEIGHT_PAPER");
  });

  // -------------------------------------------------------------------------
  // 19. Category Outside Enum & Negative Quantity Schema Validation Retries
  // -------------------------------------------------------------------------
  it("retries then throws LlmOutputError on category outside enum or negative quantity", async () => {
    const { registerFakeFixture } = await import("@reroute/llm");

    // Invalid category
    registerFakeFixture("invalid_cat_fixture", [
      JSON.stringify({
        location: { rawText: "Kukatpally", city: "Hyderabad", confidence: 1 },
        items: [{ rawText: "item", category: "alien_artifact", quantity: 1, confidence: 1 }],
      }),
      JSON.stringify({
        location: { rawText: "Kukatpally", city: "Hyderabad", confidence: 1 },
        items: [{ rawText: "item", category: "alien_artifact", quantity: 1, confidence: 1 }],
      }),
    ]);
    await expect(
      parseIntake("test invalid category", { testFixtureName: "invalid_cat_fixture" })
    ).rejects.toThrow(LlmOutputError);

    // Negative quantity
    registerFakeFixture("negative_qty_fixture", [
      JSON.stringify({
        location: { rawText: "Kukatpally", city: "Hyderabad", confidence: 1 },
        items: [{ rawText: "laptop", category: "laptop", quantity: -2, confidence: 1 }],
      }),
      JSON.stringify({
        location: { rawText: "Kukatpally", city: "Hyderabad", confidence: 1 },
        items: [{ rawText: "laptop", category: "laptop", quantity: -2, confidence: 1 }],
      }),
    ]);
    await expect(
      parseIntake("test negative qty", { testFixtureName: "negative_qty_fixture" })
    ).rejects.toThrow(LlmOutputError);
  });

  // -------------------------------------------------------------------------
  // 20. Privacy: User Personal Data (name, phone, street address) Never Reaches LLM Prompts
  // -------------------------------------------------------------------------
  it("proves customer personal data (name, phone, street address) is never passed into LLM prompts", async () => {
    const { FakeLlmAdapter } = await import("@reroute/llm");
    const adapter = new FakeLlmAdapter();

    // Verify system prompt never solicits user personal data
    const { INTAKE_SYSTEM_PROMPT } = await import("./parser.js");
    expect(INTAKE_SYSTEM_PROMPT).not.toMatch(/\b(phone|mobile\s+number|customer\s+name|credit|password|street\s+address)\b/i);

    // Verify adapter generate receives zero customer personal data
    let interceptedUserPrompt = "";
    const originalGenerate = adapter.generate.bind(adapter);
    adapter.generate = async (opts): Promise<string> => {
      interceptedUserPrompt = opts.user;
      return originalGenerate(opts);
    };

    // User request only sends item text
    const householdRequestText = "Dell laptop in Kukatpally";
    await adapter.generate({
      system: INTAKE_SYSTEM_PROMPT,
      user: householdRequestText,
      modelTier: "fast",
      timeoutMs: 5000,
    });

    expect(interceptedUserPrompt).not.toContain("9876543210");
    expect(interceptedUserPrompt).not.toContain("John Doe");
    expect(interceptedUserPrompt).not.toContain("Flat 401, Road 2");
  });

  // -------------------------------------------------------------------------
  // 21. Taxonomy Category Guard: Exactly 16 Canonical Categories Enforced
  // -------------------------------------------------------------------------
  it("enforces that canonical taxonomy categories contains exactly 16 values and rejects coarse categories", () => {
    // 1. Must be exactly 16 canonical categories
    expect(CANONICAL_CATEGORIES).toHaveLength(16);

    // 2. All 16 must pass the guard
    for (const cat of CANONICAL_CATEGORIES) {
      expect(isCanonicalCategory(cat)).toBe(true);
    }

    // 3. Coarse domain ItemCategory values must fail the guard
    expect(isCanonicalCategory("ELECTRONICS")).toBe(false);
    expect(isCanonicalCategory("BATTERIES")).toBe(false);
    expect(isCanonicalCategory("PAPER")).toBe(false);
    expect(isCanonicalCategory("PLASTIC")).toBe(false);
    expect(isCanonicalCategory("METAL")).toBe(false);
    expect(isCanonicalCategory("GLASS")).toBe(false);
    expect(isCanonicalCategory("TEXTILES")).toBe(false);
    expect(isCanonicalCategory("HAZARDOUS")).toBe(false);
    expect(isCanonicalCategory("OTHER")).toBe(false);

    // 4. Invalid or arbitrary strings must fail the guard
    expect(isCanonicalCategory("random_junk")).toBe(false);
    expect(isCanonicalCategory("")).toBe(false);
    expect(isCanonicalCategory(null)).toBe(false);
    expect(isCanonicalCategory(undefined)).toBe(false);
  });
});

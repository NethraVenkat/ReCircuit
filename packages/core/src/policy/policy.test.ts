/**
 * packages/core/src/policy/policy.test.ts
 *
 * Vitest tests for Generic Policy Schema, Anti-Hallucination Validator,
 * Pure TypeScript Category Mapper, and Honest Ground-Truth Fixtures.
 */

import { describe, it, expect } from "vitest";
import {
  validatePolicyAgainstPageText,
  extractNumbersFromText,
  mapRawNameToCanonicalCategory,
  mapExtractionToCanonicalCategories,
  DECCAN_PAGE_TEXT,
  DECCAN_EXTRACTION,
  PAPERPLUS_PAGE_TEXT,
  PAPERPLUS_EXTRACTION,
  QUICKSCRAP_PAGE_TEXT,
  QUICKSCRAP_EXTRACTION,
  GREENLOOP_PAGE_TEXT,
  GREENLOOP_EXTRACTION,
  type GenericPolicyExtraction,
} from "./index.js";

describe("Stage 4 Fixes: Generic Policy Schema & Anti-Hallucination Validator", () => {
  it("validates that all honest portal fixtures pass anti-hallucination against their real page text", () => {
    // 1. Deccan
    const deccanRes = validatePolicyAgainstPageText(DECCAN_EXTRACTION, DECCAN_PAGE_TEXT);
    expect(deccanRes.valid).toBe(true);
    expect(deccanRes.errors).toEqual([]);

    // 2. PaperPlus
    const paperplusRes = validatePolicyAgainstPageText(PAPERPLUS_EXTRACTION, PAPERPLUS_PAGE_TEXT);
    expect(paperplusRes.valid).toBe(true);
    expect(paperplusRes.errors).toEqual([]);

    // 3. QuickScrap
    const quickscrapRes = validatePolicyAgainstPageText(QUICKSCRAP_EXTRACTION, QUICKSCRAP_PAGE_TEXT);
    expect(quickscrapRes.valid).toBe(true);
    expect(quickscrapRes.errors).toEqual([]);

    // 4. GreenLoop Secunderabad (Unseen recycler)
    const greenloopRes = validatePolicyAgainstPageText(GREENLOOP_EXTRACTION, GREENLOOP_PAGE_TEXT);
    expect(greenloopRes.valid).toBe(true);
    expect(greenloopRes.errors).toEqual([]);
  });

  it("enforces Rule 3: NEVER DEFAULT unmentioned values to 0 (minimum weight is null for Deccan and QuickScrap)", () => {
    expect(DECCAN_EXTRACTION.minimumTotalKg.value).toBeNull();
    expect(QUICKSCRAP_EXTRACTION.minimumTotalKg.value).toBeNull();
    expect(PAPERPLUS_EXTRACTION.minimumTotalKg.value).toBe(5);
    expect(GREENLOOP_EXTRACTION.minimumTotalKg.value).toBe(1);
  });

  it("fails anti-hallucination if any numeric field lacks supporting quote", () => {
    const alteredDeccan: GenericPolicyExtraction = {
      ...DECCAN_EXTRACTION,
      feeRules: [
        {
          kind: "below_weight",
          amountInr: 999, // 999 does not appear in quote!
          thresholdKg: 5,
          quote: "Under 5 kg total weight: ₹180 standard pickup charge",
        },
      ],
    };

    const res = validatePolicyAgainstPageText(alteredDeccan, DECCAN_PAGE_TEXT);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Hallucinated numeric value") && e.includes("999"))).toBe(true);
  });

  it("fails anti-hallucination if any quote is not found verbatim in page text", () => {
    const alteredPaperplus: GenericPolicyExtraction = {
      ...PAPERPLUS_EXTRACTION,
      feeRules: [
        {
          kind: "free",
          amountInr: 0,
          thresholdKg: null,
          quote: "Completely invented pickup quote that does not appear in text",
        },
      ],
    };

    const res = validatePolicyAgainstPageText(alteredPaperplus, PAPERPLUS_PAGE_TEXT);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Quote not found in page visible text"))).toBe(true);
  });

  it("pure TypeScript category mapper deterministically classifies raw material names into canonical taxonomy", () => {
    expect(mapRawNameToCanonicalCategory("Laptops & Notebooks")).toBe("laptop");
    expect(mapRawNameToCanonicalCategory("Dead or Functional Laptop")).toBe("laptop");
    expect(mapRawNameToCanonicalCategory("Desktops & Monitors")).toBe("desktop");
    expect(mapRawNameToCanonicalCategory("Dead or Functional Mobile Phone")).toBe("mobile_phone");
    expect(mapRawNameToCanonicalCategory("Chargers, Adapters & Wires")).toBe("charger_cable");
    expect(mapRawNameToCanonicalCategory("Household Batteries")).toBe("battery_household");
    expect(mapRawNameToCanonicalCategory("Newspaper (Raddi)")).toBe("newspaper");
    expect(mapRawNameToCanonicalCategory("Corrugated Cardboard")).toBe("cardboard");
    expect(mapRawNameToCanonicalCategory("Old Books & Office Paper")).toBe("books_magazines");
    expect(mapRawNameToCanonicalCategory("Household plastics")).toBe("plastic");
    expect(mapRawNameToCanonicalCategory("Hazardous chemicals")).toBe("hazardous");
    expect(mapRawNameToCanonicalCategory("Unrecognized alien artefact")).toBeNull();
  });

  it("maps extracted accepted and rejected items to canonical category lists", () => {
    const { acceptedCategories, rejectedCategories } = mapExtractionToCanonicalCategories(DECCAN_EXTRACTION);
    expect(acceptedCategories).toContain("laptop");
    expect(acceptedCategories).toContain("desktop");
    expect(acceptedCategories).toContain("mobile_phone");
    expect(acceptedCategories).toContain("battery_household");
    expect(rejectedCategories).toContain("newspaper");
    expect(rejectedCategories).toContain("cardboard");
  });

  it("extracts numbers accurately from complex text strings", () => {
    expect(extractNumbersFromText("Under 5 kg total weight: ₹180 charge")).toEqual([5, 180]);
    expect(extractNumbersFromText("Payout Rs. 200 per unit, 1.5 kg min")).toEqual([200, 1.5]);
    expect(extractNumbersFromText("No numbers here")).toEqual([]);
  });
});

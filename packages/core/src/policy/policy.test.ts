/**
 * packages/core/src/policy/policy.test.ts
 *
 * Vitest tests for Policy Schema & Anti-Hallucination Validator:
 * - Policies for Deccan, PaperPlus, and QuickScrap conform to schema
 * - Verbatim quote matching in page visible text
 * - Extraction of numeric values (fees, minimum weights, rate numbers)
 * - Deterministic rejection of hallucinated quotes or unquoted numbers
 * - Graceful handling of unreadable / failed policies
 */

import { describe, it, expect } from "vitest";
import {
  ExtractedPolicySchema,
  validatePolicyAgainstPageText,
  extractNumbersFromText,
  type ExtractedPolicy,
} from "./index.js";

describe("Stage 4: Recycler Policy Schema & Anti-Hallucination Validator", () => {
  const samplePageText = `
    Welcome to Deccan E-Cycle Solutions.
    Pickup Fee & Payout Schedule:
    Under 5 kg total weight: ₹180 standard pickup charge.
    5 kg or more total weight: ₹0 (FREE Pickup).
    Item-Specific Payout Rates:
    Dead or Functional Laptop: ₹250 cash payout each.
    Dead or Functional Mobile Phone: ₹60 cash payout each.
    Customer Data Privacy Guarantee: We require data wipe acknowledgement for laptops.
  `;

  const validDeccanPolicy: ExtractedPolicy = {
    recyclerId: "deccan",
    companyName: "Deccan E-Cycle Solutions",
    acceptedCategories: ["laptop", "mobile_phone", "charger_cable", "battery_household"],
    rejectedCategories: ["newspaper", "cardboard"],
    rates: [
      { item: "Dead or Functional Laptop", payout: "₹250", fee: "₹0" },
      { item: "Dead or Functional Mobile Phone", payout: "₹60", fee: "₹0" },
    ],
    freeThresholdKg: 5,
    underWeightFeeInr: 180,
    minWeightKg: 0,
    convenienceFeeInr: null,
    requiresDataWipeAck: true,
    registrationNotice: null,
    quotes: [
      "Under 5 kg total weight: ₹180 standard pickup charge.",
      "5 kg or more total weight: ₹0 (FREE Pickup).",
      "Dead or Functional Laptop: ₹250 cash payout each.",
      "Dead or Functional Mobile Phone: ₹60 cash payout each.",
    ],
    status: "SUCCESS",
    evidence: {
      url: "http://localhost:3101/pickup-charges",
      screenshotRef: "evidence/deccan-policy.png",
      extractedAt: new Date().toISOString(),
      sessionId: "session-test-001",
    },
  };

  it("validates that sample policies parse cleanly through ExtractedPolicySchema", () => {
    const parsed = ExtractedPolicySchema.parse(validDeccanPolicy);
    expect(parsed.recyclerId).toBe("deccan");
    expect(parsed.freeThresholdKg).toBe(5);
    expect(parsed.underWeightFeeInr).toBe(180);
    expect(parsed.requiresDataWipeAck).toBe(true);
  });

  it("extracts integers and floats accurately with extractNumbersFromText", () => {
    expect(extractNumbersFromText("Under 5 kg total weight: ₹180 fee")).toEqual([5, 180]);
    expect(extractNumbersFromText("₹250 each and 4.5 kg minimum")).toEqual([250, 4.5]);
    expect(extractNumbersFromText("No numbers here")).toEqual([]);
  });

  it("passes anti-hallucination check when all quotes match page text and all numbers match quotes", () => {
    const result = validatePolicyAgainstPageText(validDeccanPolicy, samplePageText);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects policy when a cited quote does not appear in the page text", () => {
    const hallucinatedPolicy: ExtractedPolicy = {
      ...validDeccanPolicy,
      quotes: [
        "Under 5 kg total weight: ₹180 standard pickup charge.",
        "We also accept hazardous radioactive medical waste for ₹999.", // hallucinated!
      ],
    };

    const result = validatePolicyAgainstPageText(hallucinatedPolicy, samplePageText);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Quote not found in page visible text"))).toBe(true);
  });

  it("rejects policy when an extracted numeric fee is not backed by any cited quote", () => {
    const hallucinatedNumberPolicy: ExtractedPolicy = {
      ...validDeccanPolicy,
      underWeightFeeInr: 350, // invented number not in quotes
      quotes: [
        "Under 5 kg total weight: ₹180 standard pickup charge.",
        "5 kg or more total weight: ₹0 (FREE Pickup).",
        "Dead or Functional Laptop: ₹250 cash payout each.",
        "Dead or Functional Mobile Phone: ₹60 cash payout each.",
      ],
    };

    const result = validatePolicyAgainstPageText(hallucinatedNumberPolicy, samplePageText);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes("Hallucinated numeric value: underWeightFeeInr = 350 does not appear in any cited quote")
      )
    ).toBe(true);
  });

  it("rejects policy when quotes array is empty", () => {
    const noQuotesPolicy: ExtractedPolicy = {
      ...validDeccanPolicy,
      quotes: [],
    };

    const result = validatePolicyAgainstPageText(noQuotesPolicy, samplePageText);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("No evidence quotes provided for policy extraction.");
  });

  it("accepts POLICY_UNREADABLE or FAILED policies without quote errors", () => {
    const unreadablePolicy: ExtractedPolicy = {
      ...validDeccanPolicy,
      status: "POLICY_UNREADABLE",
      failureReason: "Fee schedule hidden or unavailable",
      quotes: [],
    };

    const result = validatePolicyAgainstPageText(unreadablePolicy, samplePageText);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});


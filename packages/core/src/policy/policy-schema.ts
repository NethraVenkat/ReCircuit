/**
 * packages/core/src/policy/policy-schema.ts
 *
 * Generic Zod schema for AI policy extraction, pure TypeScript category mapping,
 * and validated policy domain types.
 *
 * Rule: The extraction schema contains zero per-site field names.
 * Category mapping (rawName -> CanonicalCategory) is performed by deterministic code.
 */

import { z } from "zod";
import { CANONICAL_CATEGORIES, type CanonicalCategory } from "../intake/schema.js";

// ---------------------------------------------------------------------------
// 1. Generic Extraction Schema (No per-site fields)
// ---------------------------------------------------------------------------

export const FeeRuleKindSchema = z.enum(["flat", "below_weight", "free"]);
export type FeeRuleKind = z.infer<typeof FeeRuleKindSchema>;

export const PayoutUnitSchema = z.enum(["per_item", "per_kg"]);
export type PayoutUnit = z.infer<typeof PayoutUnitSchema>;

export const GenericAcceptedItemSchema = z.object({
  rawName: z.string(),
  quote: z.string(),
});
export type GenericAcceptedItem = z.infer<typeof GenericAcceptedItemSchema>;

export const GenericRejectedItemSchema = z.object({
  rawName: z.string(),
  quote: z.string(),
});
export type GenericRejectedItem = z.infer<typeof GenericRejectedItemSchema>;

export const GenericFeeRuleSchema = z.object({
  kind: FeeRuleKindSchema,
  amountInr: z.number().int().nonnegative(),
  thresholdKg: z.number().nonnegative().nullable(),
  quote: z.string(),
});
export type GenericFeeRule = z.infer<typeof GenericFeeRuleSchema>;

export const GenericPayoutRuleSchema = z.object({
  rawName: z.string(),
  unit: PayoutUnitSchema,
  amountInr: z.number().int().nonnegative(),
  quote: z.string(),
});
export type GenericPayoutRule = z.infer<typeof GenericPayoutRuleSchema>;

export const GenericPolicyExtractionSchema = z.object({
  acceptedItems: z.array(GenericAcceptedItemSchema).default([]),
  rejectedItems: z.array(GenericRejectedItemSchema).default([]),
  feeRules: z.array(GenericFeeRuleSchema).default([]),
  payoutRules: z.array(GenericPayoutRuleSchema).default([]),
  minimumTotalKg: z.object({
    value: z.number().nonnegative().nullable(),
    quote: z.string().nullable(),
  }).default({ value: null, quote: null }),
  serviceablePincodes: z.object({
    values: z.array(z.string()).default([]),
    quote: z.string().nullable(),
  }).default({ values: [], quote: null }),
  registrationNotice: z.object({
    text: z.string().nullable(),
    quote: z.string().nullable(),
  }).default({ text: null, quote: null }),
});
export type GenericPolicyExtraction = z.infer<typeof GenericPolicyExtractionSchema>;

// ---------------------------------------------------------------------------
// 2. Pure TypeScript Mapping: rawName -> CanonicalCategory[]
// ---------------------------------------------------------------------------

/**
 * Deterministically maps any raw material/item name (or compound phrase)
 * extracted from website text to one or more canonical categories.
 * Pure TypeScript — never decided by the LLM.
 */
export function mapRawNameToCanonicalCategories(rawName: string): CanonicalCategory[] {
  const normalized = rawName.toLowerCase().replace(/[/_\-(),.]/g, " ").replace(/\s+/g, " ").trim();
  const matched = new Set<CanonicalCategory>();

  // 1. Electronics / Computers
  if (normalized.includes("laptop") || normalized.includes("notebook")) matched.add("laptop");
  if (normalized.includes("desktop") || normalized.includes("cpu") || normalized.includes("monitor") || normalized.includes("motherboard")) matched.add("desktop");
  if (normalized.includes("phone") || normalized.includes("mobile") || normalized.includes("smartphone") || normalized.includes("tablet")) matched.add("mobile_phone");
  if (normalized.includes("charger") || normalized.includes("adapter") || normalized.includes("cable") || normalized.includes("cord") || normalized.includes("wire")) matched.add("charger_cable");
  if (normalized.includes("batter") || normalized.includes("cell") || normalized.includes("alkaline") || normalized.includes("li ion")) matched.add("battery_household");
  if (normalized.includes("small consumer electronic") || normalized.includes("small electronic") || normalized.includes("keyboard") || normalized.includes("mouse") || normalized.includes("router") || normalized.includes("calculator") || normalized.includes("set top")) matched.add("small_electronics");
  if (normalized.includes("appliance") || normalized.includes("refrigerator") || normalized.includes("washing") || normalized.includes("microwave") || normalized.includes("ac ") || normalized.includes("air conditioner")) matched.add("large_appliance");
  if (
    normalized === "electronics" ||
    normalized.includes("electronic waste") ||
    normalized.includes("e waste") ||
    normalized.includes("e-waste")
  ) {
    matched.add("laptop");
    matched.add("desktop");
    matched.add("mobile_phone");
    matched.add("small_electronics");
  }

  // 2. Paper & Fibre
  if (normalized.includes("newspaper") || normalized.includes("raddi") || normalized.includes("shredded document") || (normalized.includes("paper") && !normalized.includes("office paper"))) matched.add("newspaper");
  if (normalized.includes("cardboard") || normalized.includes("carton") || normalized.includes("packaging box") || normalized.includes("corrugated")) matched.add("cardboard");
  if (normalized.includes("book") || normalized.includes("magazine") || normalized.includes("office paper")) matched.add("books_magazines");

  // 3. Other Domestic Recyclables
  if (normalized.includes("plastic") || normalized.includes("pet bottle") || normalized.includes("container")) matched.add("plastic");
  if (normalized.includes("metal") || normalized.includes("iron") || normalized.includes("steel") || normalized.includes("copper") || normalized.includes("aluminium") || normalized.includes("brass")) matched.add("metal");
  if (normalized.includes("glass") || normalized.includes("window")) matched.add("glass");
  if (normalized.includes("textile") || normalized.includes("cloth") || normalized.includes("fabric")) matched.add("textiles");

  // 4. Hazardous Materials
  if (normalized.includes("radioactive") || normalized.includes("chemical") || normalized.includes("explosive") || normalized.includes("toxic") || normalized.includes("hospital") || normalized.includes("bio medical") || normalized.includes("hazard")) matched.add("hazardous");

  // Fallback for generic e-waste
  if (matched.size === 0 && (normalized.includes("electronic") || normalized.includes("e waste"))) {
    matched.add("small_electronics");
  }

  return Array.from(matched);
}

/**
 * Returns the primary canonical category for a single item rawName, or null if unmapped.
 */
export function mapRawNameToCanonicalCategory(rawName: string): CanonicalCategory | null {
  const categories = mapRawNameToCanonicalCategories(rawName);
  return categories[0] ?? null;
}

/**
 * Maps all accepted and rejected items to their canonical categories, deduplicating them.
 */
export function mapExtractionToCanonicalCategories(extraction: GenericPolicyExtraction): {
  acceptedCategories: CanonicalCategory[];
  rejectedCategories: CanonicalCategory[];
} {
  const acceptedSet = new Set<CanonicalCategory>();
  for (const item of extraction.acceptedItems) {
    const cats = mapRawNameToCanonicalCategories(item.rawName);
    for (const c of cats) acceptedSet.add(c);
  }

  const rejectedSet = new Set<CanonicalCategory>();
  for (const item of extraction.rejectedItems) {
    const cats = mapRawNameToCanonicalCategories(item.rawName);
    for (const c of cats) rejectedSet.add(c);
  }

  return {
    acceptedCategories: Array.from(acceptedSet),
    rejectedCategories: Array.from(rejectedSet),
  };
}

// ---------------------------------------------------------------------------
// 3. Extracted Policy Domain Model & Evidence
// ---------------------------------------------------------------------------

export const PolicyExtractionPathSchema = z.enum(["generic-ai", "dom-fallback"]);
export type PolicyExtractionPath = z.infer<typeof PolicyExtractionPathSchema>;

export const PolicyStatusSchema = z.enum([
  "SUCCESS",
  "POLICY_UNREADABLE",
  "FAILED",
]);
export type PolicyStatus = z.infer<typeof PolicyStatusSchema>;

export const PolicyEvidenceSchema = z.object({
  url: z.string(),
  textHash: z.string(),
  screenshotPath: z.string(),
  screenshotRef: z.string().optional(), // for backwards-compatibility with state-machine
  extractedAt: z.string(),
  sessionId: z.string(),
  replayUrl: z.string().nullable().optional(),
  extractionPath: PolicyExtractionPathSchema,
});
export type PolicyEvidence = z.infer<typeof PolicyEvidenceSchema>;

export const ExtractedPolicySchema = GenericPolicyExtractionSchema.extend({
  recyclerId: z.string(),
  companyName: z.string(),
  status: PolicyStatusSchema.default("SUCCESS"),
  feesUnknown: z.boolean().default(false),
  failureReason: z.string().optional(),
  evidence: PolicyEvidenceSchema,
  requiresDataWipeAck: z.boolean().default(false),
  acceptedCategories: z.array(z.enum(CANONICAL_CATEGORIES)).default([]),
  rejectedCategories: z.array(z.enum(CANONICAL_CATEGORIES)).default([]),
  // Optional convenience fields derived from feeRules for backward compatibility
  freeThresholdKg: z.number().nonnegative().nullable().optional(),
  underWeightFeeInr: z.number().int().nonnegative().nullable().optional(),
  minWeightKg: z.number().nonnegative().nullable().optional(),
  convenienceFeeInr: z.number().int().nonnegative().nullable().optional(),
  quotes: z.array(z.string()).default([]),
  rates: z.array(z.object({
    item: z.string(),
    payout: z.string().default("₹0"),
    fee: z.string().default("₹0"),
  })).default([]),
});

export type ExtractedPolicy = z.infer<typeof ExtractedPolicySchema>;

/**
 * packages/core/src/intake/schema.ts
 *
 * Zod schemas for LLM proposal and final validated intake result.
 */

import { z } from "zod";

export const LlmProposedItemSchema = z.object({
  rawText: z.string(),
  category: z.string(),
  subcategory: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  declaredWeightKg: z.number().positive().nullable().optional(),
  hazardClass: z
    .enum(["none", "battery_li_ion", "battery_alkaline", "battery_unknown"])
    .optional(),
  confidence: z.number().min(0).max(1).default(1),
  notes: z.string().optional(),
});

export const LlmProposedLocationSchema = z.object({
  rawText: z.string(),
  locality: z.string().optional(),
  pincode: z.string().optional(),
  city: z.string().default("Hyderabad"),
  confidence: z.number().min(0).max(1).default(1),
});

export const LlmProposedClarificationSchema = z.object({
  code: z.string(),
  question: z.string(),
  affectedItemIds: z.array(z.string()).default([]),
});

export const LlmProposedIntakeSchema = z.object({
  location: LlmProposedLocationSchema,
  feeCapInr: z.number().int().nonnegative().nullable().optional(),
  items: z.array(LlmProposedItemSchema).default([]),
  clarifications: z.array(LlmProposedClarificationSchema).default([]),
});

export type LlmProposedIntake = z.infer<typeof LlmProposedIntakeSchema>;
export type LlmProposedItem = z.infer<typeof LlmProposedItemSchema>;

// ---------------------------------------------------------------------------
// Final Validated / Deterministic Intake Output Schema
// ---------------------------------------------------------------------------

export const IntakeItemSchema = z.object({
  id: z.string().uuid(),
  rawText: z.string(),
  category: z.enum([
    "laptop",
    "desktop",
    "mobile_phone",
    "charger_cable",
    "battery_household",
    "small_electronics",
    "large_appliance",
    "newspaper",
    "cardboard",
    "books_magazines",
    "plastic",
    "metal",
    "glass",
    "textiles",
    "hazardous",
    "other",
  ]),
  subcategory: z.string().optional(),
  quantity: z.number().int().positive(),
  declaredWeightKg: z.number().positive().nullable().optional(),
  estimatedWeightKg: z.number().positive().nullable().optional(),
  weightSource: z.enum(["user_declared", "estimated", "unknown"]),
  hazardClass: z.enum(["none", "battery_li_ion", "battery_alkaline", "battery_unknown"]),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

export const IntakeClarificationSchema = z.object({
  code: z.string(),
  question: z.string(),
  affectedItemIds: z.array(z.string()),
});

export const IntakeLocationSchema = z.object({
  rawText: z.string(),
  locality: z.string().optional(),
  pincode: z.string().optional(),
  city: z.string(),
  confidence: z.number().min(0).max(1),
});

export const ValidatedIntakeResultSchema = z.object({
  requestId: z.string().uuid(),
  state: z.enum(["ITEMS_PARSED", "NEEDS_CLARIFICATION"]),
  location: IntakeLocationSchema,
  feeCapInr: z.number().int().nonnegative().nullable(),
  items: z.array(IntakeItemSchema),
  clarifications: z.array(IntakeClarificationSchema),
  evidence: z.record(z.unknown()).optional(),
});

export type IntakeItem = z.infer<typeof IntakeItemSchema>;
export type IntakeClarification = z.infer<typeof IntakeClarificationSchema>;
export type IntakeLocation = z.infer<typeof IntakeLocationSchema>;
export type ValidatedIntakeResult = z.infer<typeof ValidatedIntakeResultSchema>;


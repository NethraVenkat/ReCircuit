/**
 * packages/core/src/policy/policy-schema.ts
 *
 * Zod schemas and domain types for recycler policy extraction,
 * rate cards, fees, and anti-hallucination verification.
 */

import { z } from "zod";
import { CANONICAL_CATEGORIES } from "../intake/schema.js";

export const PolicyRateItemSchema = z.object({
  item: z.string(),
  payout: z.string().default("₹0"),
  fee: z.string().default("₹0"),
});

export type PolicyRateItem = z.infer<typeof PolicyRateItemSchema>;

export const PolicyStatusSchema = z.enum([
  "SUCCESS",
  "POLICY_UNREADABLE",
  "FAILED",
]);

export type PolicyStatus = z.infer<typeof PolicyStatusSchema>;

export const PolicyEvidenceSchema = z.object({
  url: z.string(),
  screenshotRef: z.string(),
  extractedAt: z.string(),
  sessionId: z.string(),
});

export type PolicyEvidence = z.infer<typeof PolicyEvidenceSchema>;

export const ExtractedPolicySchema = z.object({
  recyclerId: z.enum(["deccan", "paperplus", "quickscrap"]),
  companyName: z.string(),
  acceptedCategories: z.array(z.enum(CANONICAL_CATEGORIES)).default([]),
  rejectedCategories: z.array(z.enum(CANONICAL_CATEGORIES)).default([]),
  rates: z.array(PolicyRateItemSchema).default([]),
  freeThresholdKg: z.number().nonnegative().nullable().optional(),
  underWeightFeeInr: z.number().int().nonnegative().nullable().optional(),
  minWeightKg: z.number().nonnegative().nullable().optional(),
  convenienceFeeInr: z.number().int().nonnegative().nullable().optional(),
  requiresDataWipeAck: z.boolean().default(false),
  registrationNotice: z.string().nullable().optional(),
  quotes: z.array(z.string()).default([]),
  status: PolicyStatusSchema.default("SUCCESS"),
  failureReason: z.string().optional(),
  evidence: PolicyEvidenceSchema,
});

export type ExtractedPolicy = z.infer<typeof ExtractedPolicySchema>;


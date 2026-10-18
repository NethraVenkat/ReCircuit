/**
 * packages/core/src/policy/anti-hallucination.ts
 *
 * Deterministic anti-hallucination validator:
 * 1. Every cited quote in the policy must appear verbatim in the page's visible text.
 * 2. Every extracted numeric value (fees, thresholds, minimum weights, payout amounts)
 *    must appear in at least one of the cited quotes.
 */

import type { ExtractedPolicy, GenericPolicyExtraction } from "./policy-schema.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function normalizeWhitespace(text: string): string {
  return text
    .toLowerCase()
    .replace(/[:\-–—\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts all numeric values from text (integers and floats).
 */
export function extractNumbersFromText(text: string): number[] {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((m) => Number(m));
}

/**
 * Collects all quotes from an extracted policy or generic extraction object.
 */
export function collectQuotesFromExtraction(
  policy: Partial<ExtractedPolicy> | GenericPolicyExtraction
): string[] {
  const quotes = new Set<string>();

  const ext = policy as Partial<ExtractedPolicy>;
  if (Array.isArray(ext.quotes)) {
    for (const q of ext.quotes) {
      if (typeof q === "string" && q.trim()) quotes.add(q.trim());
    }
  }

  if (Array.isArray(policy.acceptedItems)) {
    for (const item of policy.acceptedItems) {
      if (item.quote && item.quote.trim()) quotes.add(item.quote.trim());
    }
  }

  if (Array.isArray(policy.rejectedItems)) {
    for (const item of policy.rejectedItems) {
      if (item.quote && item.quote.trim()) quotes.add(item.quote.trim());
    }
  }

  if (Array.isArray(policy.feeRules)) {
    for (const fee of policy.feeRules) {
      if (fee.quote && fee.quote.trim()) quotes.add(fee.quote.trim());
    }
  }

  if (Array.isArray(policy.payoutRules)) {
    for (const payout of policy.payoutRules) {
      if (payout.quote && payout.quote.trim()) quotes.add(payout.quote.trim());
    }
  }

  if (policy.minimumTotalKg?.quote && policy.minimumTotalKg.quote.trim()) {
    quotes.add(policy.minimumTotalKg.quote.trim());
  }

  if (policy.serviceablePincodes?.quote && policy.serviceablePincodes.quote.trim()) {
    quotes.add(policy.serviceablePincodes.quote.trim());
  }

  if (policy.registrationNotice?.quote && policy.registrationNotice.quote.trim()) {
    quotes.add(policy.registrationNotice.quote.trim());
  }

  return Array.from(quotes);
}

/**
 * Validates that an extracted policy is strictly grounded in the page visible text
 * and that all extracted numeric claims are backed by cited verbatim quotes.
 */
export function validatePolicyAgainstPageText(
  policy: ExtractedPolicy | (GenericPolicyExtraction & { status?: string; failureReason?: string }),
  pageVisibleText: string
): ValidationResult {
  const errors: string[] = [];
  const normalizedPage = normalizeWhitespace(pageVisibleText);

  // If policy was marked unreadable or failed, skip quote validation
  if (policy.status === "POLICY_UNREADABLE" || policy.status === "FAILED") {
    return { valid: true, errors: [] };
  }

  const quotes = collectQuotesFromExtraction(policy);

  // 1. Check quotes presence
  if (quotes.length === 0) {
    errors.push("No evidence quotes provided for policy extraction.");
    return { valid: false, errors };
  }

  const allQuoteNumbers = new Set<number>();

  for (const quote of quotes) {
    const cleanQuote = quote.trim();
    if (!cleanQuote) continue;

    const normQuote = normalizeWhitespace(cleanQuote);

    // Collect all numbers that appear in the quotes
    const quoteNums = extractNumbersFromText(cleanQuote);
    for (const n of quoteNums) {
      allQuoteNumbers.add(n);
    }

    // Rule 1: Every quote must appear in page visible text
    if (!normalizedPage.includes(normQuote)) {
      errors.push(`Quote not found in page visible text: "${cleanQuote.slice(0, 80)}..."`);
    }
  }

  // 2. Rule 2: All extracted numbers must appear in at least one cited quote
  const numbersToCheck: Array<{ field: string; value: number }> = [];

  // Generic feeRules numbers
  if (Array.isArray(policy.feeRules)) {
    for (let i = 0; i < policy.feeRules.length; i++) {
      const rule = policy.feeRules[i]!;
      if (rule.amountInr > 0) {
        numbersToCheck.push({ field: `feeRules[${i}].amountInr`, value: rule.amountInr });
      }
      if (typeof rule.thresholdKg === "number" && rule.thresholdKg > 0) {
        numbersToCheck.push({ field: `feeRules[${i}].thresholdKg`, value: rule.thresholdKg });
      }
    }
  }

  // Generic payoutRules numbers
  if (Array.isArray(policy.payoutRules)) {
    for (let i = 0; i < policy.payoutRules.length; i++) {
      const rule = policy.payoutRules[i]!;
      if (rule.amountInr > 0) {
        numbersToCheck.push({ field: `payoutRules[${i}].amountInr`, value: rule.amountInr });
      }
    }
  }

  // Generic minimumTotalKg number
  if (typeof policy.minimumTotalKg?.value === "number" && policy.minimumTotalKg.value > 0) {
    numbersToCheck.push({ field: "minimumTotalKg.value", value: policy.minimumTotalKg.value });
  }

  // Backward-compatible fields
  const ext = policy as Partial<ExtractedPolicy>;
  if (typeof ext.freeThresholdKg === "number" && ext.freeThresholdKg > 0) {
    numbersToCheck.push({ field: "freeThresholdKg", value: ext.freeThresholdKg });
  }
  if (typeof ext.underWeightFeeInr === "number" && ext.underWeightFeeInr > 0) {
    numbersToCheck.push({ field: "underWeightFeeInr", value: ext.underWeightFeeInr });
  }
  if (typeof ext.minWeightKg === "number" && ext.minWeightKg > 0) {
    numbersToCheck.push({ field: "minWeightKg", value: ext.minWeightKg });
  }
  if (typeof ext.convenienceFeeInr === "number" && ext.convenienceFeeInr > 0) {
    numbersToCheck.push({ field: "convenienceFeeInr", value: ext.convenienceFeeInr });
  }

  if (Array.isArray(ext.rates)) {
    for (const rate of ext.rates) {
      const rateNumbers = extractNumbersFromText(`${rate.payout} ${rate.fee}`);
      for (const num of rateNumbers) {
        if (num > 0) {
          numbersToCheck.push({ field: `rate(${rate.item})`, value: num });
        }
      }
    }
  }

  for (const { field, value } of numbersToCheck) {
    if (!allQuoteNumbers.has(value)) {
      errors.push(
        `Hallucinated numeric value: ${field} = ${value} does not appear in any cited quote.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

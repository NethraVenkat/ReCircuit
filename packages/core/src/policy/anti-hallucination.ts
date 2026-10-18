/**
 * packages/core/src/policy/anti-hallucination.ts
 *
 * Deterministic anti-hallucination validator:
 * 1. Every cited quote must appear verbatim in the page's visible text.
 * 2. Every extracted numeric value (fees, thresholds, minimum weights, rate figures)
 *    must appear in at least one of the cited quotes.
 */

import type { ExtractedPolicy } from "./policy-schema.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
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
 * Validates that an extracted policy is strictly grounded in the page visible text
 * and that all extracted numeric claims are backed by cited verbatim quotes.
 */
export function validatePolicyAgainstPageText(
  policy: ExtractedPolicy,
  pageVisibleText: string
): ValidationResult {
  const errors: string[] = [];
  const normalizedPage = normalizeWhitespace(pageVisibleText);

  // If policy was already marked unreadable or failed, skip quote validation
  if (policy.status === "POLICY_UNREADABLE" || policy.status === "FAILED") {
    return { valid: true, errors: [] };
  }

  // 1. Check quotes
  if (!policy.quotes || policy.quotes.length === 0) {
    errors.push("No evidence quotes provided for policy extraction.");
    return { valid: false, errors };
  }

  const normalizedQuotes: string[] = [];
  const allQuoteNumbers = new Set<number>();

  for (const quote of policy.quotes) {
    const cleanQuote = quote.trim();
    if (!cleanQuote) continue;

    const normQuote = normalizeWhitespace(cleanQuote);
    normalizedQuotes.push(normQuote);

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

  if (typeof policy.freeThresholdKg === "number" && policy.freeThresholdKg > 0) {
    numbersToCheck.push({ field: "freeThresholdKg", value: policy.freeThresholdKg });
  }

  if (typeof policy.underWeightFeeInr === "number" && policy.underWeightFeeInr > 0) {
    numbersToCheck.push({ field: "underWeightFeeInr", value: policy.underWeightFeeInr });
  }

  if (typeof policy.minWeightKg === "number" && policy.minWeightKg > 0) {
    numbersToCheck.push({ field: "minWeightKg", value: policy.minWeightKg });
  }

  if (typeof policy.convenienceFeeInr === "number" && policy.convenienceFeeInr > 0) {
    numbersToCheck.push({ field: "convenienceFeeInr", value: policy.convenienceFeeInr });
  }

  for (const rate of policy.rates) {
    const rateNumbers = extractNumbersFromText(`${rate.payout} ${rate.fee}`);
    for (const num of rateNumbers) {
      if (num > 0) {
        numbersToCheck.push({ field: `rate(${rate.item})`, value: num });
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


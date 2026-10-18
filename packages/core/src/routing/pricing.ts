/**
 * packages/core/src/routing/pricing.ts
 *
 * Deterministic pricing engine for a single proposed leg:
 * - Computes doorstep pickup fee from extracted fee rules only (rejects unknown fees)
 * - Computes item-level and total known payouts (preserves unstated payouts as null)
 * - Enforces stated minimum total weights (never defaults unstated minimums to 0)
 * - Identifies weight threshold proximity (within 15% of fee boundary)
 */

import type { IntakeItem } from "../intake/schema.js";
import { mapRawNameToCanonicalCategories, type ExtractedPolicy } from "../policy/policy-schema.js";
import type { LegPricingResult } from "./types.js";

export function priceLeg(options: {
  recyclerId: string;
  policy: ExtractedPolicy;
  items: IntakeItem[];
  requestPincode?: string | undefined;
}): LegPricingResult {
  const { recyclerId, policy, items, requestPincode } = options;

  // 1. Service area check
  const serviceablePincodes = policy.serviceablePincodes?.values ?? [];
  if (serviceablePincodes.length > 0 && requestPincode && !serviceablePincodes.includes(requestPincode)) {
    return {
      recyclerId,
      valid: false,
      invalidReason: "OUTSIDE_SERVICE_AREA",
      totalWeightKg: 0,
      estimatedFee: null,
      estimatedPayout: 0,
      itemPayouts: {},
      hasUnknownPayout: false,
    };
  }

  // 2. Material acceptance check: every item on the leg must be accepted
  for (const item of items) {
    if (!policy.acceptedCategories.includes(item.category)) {
      return {
        recyclerId,
        valid: false,
        invalidReason: "ITEMS_REJECTED",
        totalWeightKg: 0,
        estimatedFee: null,
        estimatedPayout: 0,
        itemPayouts: {},
        hasUnknownPayout: false,
      };
    }
  }

  // 3. Fee rule availability check: leg cannot be proposed if fee is unknown
  if (policy.feesUnknown || !policy.feeRules || policy.feeRules.length === 0) {
    return {
      recyclerId,
      valid: false,
      invalidReason: "UNKNOWN_FEE",
      totalWeightKg: 0,
      estimatedFee: null,
      estimatedPayout: 0,
      itemPayouts: {},
      hasUnknownPayout: false,
    };
  }

  // 4. Calculate total estimated weight for this leg
  const totalWeightKg = Number(
    items
      .reduce((sum, item) => sum + (item.declaredWeightKg ?? item.estimatedWeightKg ?? 0), 0)
      .toFixed(3)
  );

  // 5. Stated minimum total weight check
  if (
    typeof policy.minimumTotalKg?.value === "number" &&
    totalWeightKg < policy.minimumTotalKg.value
  ) {
    return {
      recyclerId,
      valid: false,
      invalidReason: "BELOW_MINIMUM_WEIGHT",
      totalWeightKg,
      estimatedFee: null,
      estimatedPayout: 0,
      itemPayouts: {},
      hasUnknownPayout: false,
    };
  }

  // 6. Compute pickup fee
  let estimatedFee: number | null = null;
  let thresholdDistancePercent: number | undefined;

  const belowRule = policy.feeRules.find((r) => r.kind === "below_weight");
  const flatRule = policy.feeRules.find((r) => r.kind === "flat");
  const freeRule = policy.feeRules.find((r) => r.kind === "free");

  if (belowRule) {
    const threshold = belowRule.thresholdKg;
    if (threshold != null) {
      if (totalWeightKg < threshold) {
        estimatedFee = belowRule.amountInr;
      } else {
        estimatedFee = 0;
      }

      // Check proximity to threshold (within 15%)
      const dist = Math.abs(totalWeightKg - threshold) / threshold;
      if (dist <= 0.15) {
        thresholdDistancePercent = Math.round(dist * 100);
      }
    } else {
      estimatedFee = belowRule.amountInr;
    }
  } else if (flatRule) {
    estimatedFee = flatRule.amountInr;
  } else if (freeRule) {
    estimatedFee = 0;
    if (freeRule.thresholdKg != null) {
      const dist = Math.abs(totalWeightKg - freeRule.thresholdKg) / freeRule.thresholdKg;
      if (dist <= 0.15) {
        thresholdDistancePercent = Math.round(dist * 100);
      }
    }
  }

  if (estimatedFee == null) {
    return {
      recyclerId,
      valid: false,
      invalidReason: "UNKNOWN_FEE",
      totalWeightKg,
      estimatedFee: null,
      estimatedPayout: 0,
      itemPayouts: {},
      hasUnknownPayout: false,
    };
  }

  // 7. Compute payouts per item
  const itemPayouts: Record<string, number | null> = {};
  let estimatedPayout = 0;
  let hasUnknownPayout = false;

  for (const item of items) {
    // Find matching payout rule
    const matchingRule = policy.payoutRules.find((pr) => {
      const cats = mapRawNameToCanonicalCategories(pr.rawName);
      return cats.includes(item.category);
    });

    if (matchingRule) {
      let itemPayout = 0;
      if (matchingRule.unit === "per_item") {
        itemPayout = matchingRule.amountInr * item.quantity;
      } else if (matchingRule.unit === "per_kg") {
        const weight = item.declaredWeightKg ?? item.estimatedWeightKg ?? 0;
        itemPayout = Math.round(matchingRule.amountInr * weight);
      }
      itemPayouts[item.id] = itemPayout;
      estimatedPayout += itemPayout;
    } else {
      // Unstated payout remains null (not 0)
      itemPayouts[item.id] = null;
      hasUnknownPayout = true;
    }
  }

  return {
    recyclerId,
    valid: true,
    totalWeightKg,
    estimatedFee,
    estimatedPayout,
    itemPayouts,
    hasUnknownPayout,
    thresholdDistancePercent,
  };
}

/**
 * packages/core/src/routing/eligibility.ts
 *
 * Deterministic eligibility matrix evaluation for (items x recyclers):
 * - Service area check based on request pincode
 * - Item category acceptance / rejection check based on verified policy quotes
 * - Grounded in cited quotes and page URLs
 */

import type { IntakeItem } from "../intake/schema.js";
import {
  mapRawNameToCanonicalCategories,
  type CanonicalCategory,
  type ExtractedPolicy,
} from "../policy/policy-schema.js";
import type { EligibilityCell, EligibilityMatrix, EligibilityStatus } from "./types.js";

/**
 * Validates that an eligibility cell's quote is strictly the quote of a rule in that recycler's
 * acceptedItems or rejectedItems whose mapped canonical categories contain the item's category.
 * Throws an error on any unrelated quote (fee lines, minimum weight lines, headings) or bad status.
 */
export function validateEligibilityMatrixCell(
  cell: EligibilityCell,
  policy: ExtractedPolicy
): void {
  if (cell.status === "UNKNOWN") {
    if (cell.quote !== null) {
      throw new Error(
        `Eligibility cell for ${cell.category} on ${policy.recyclerId} is UNKNOWN but has non-null quote: "${cell.quote}"`
      );
    }
    return;
  }

  if (cell.reason?.includes("outside recycler serviceable area")) {
    if (policy.serviceablePincodes?.quote && cell.quote !== policy.serviceablePincodes.quote) {
      throw new Error(
        `Service area rejection quote mismatch for ${cell.category} on ${policy.recyclerId}. Expected "${policy.serviceablePincodes.quote}", received "${cell.quote}"`
      );
    }
    return;
  }

  if (cell.status === "ACCEPTED") {
    const matchingRule = policy.acceptedItems.find(
      (ai) =>
        ai.quote === cell.quote &&
        mapRawNameToCanonicalCategories(ai.rawName).includes(cell.category as CanonicalCategory)
    );
    if (!matchingRule) {
      throw new Error(
        `Eligibility cell for ${cell.category} on ${policy.recyclerId} is ACCEPTED with quote "${cell.quote}", but no matching acceptedItem rule maps to ${cell.category}`
      );
    }
    return;
  }

  if (cell.status === "REJECTED") {
    const matchingRule = policy.rejectedItems.find(
      (ri) =>
        ri.quote === cell.quote &&
        mapRawNameToCanonicalCategories(ri.rawName).includes(cell.category as CanonicalCategory)
    );
    if (!matchingRule) {
      throw new Error(
        `Eligibility cell for ${cell.category} on ${policy.recyclerId} is REJECTED with quote "${cell.quote}", but no matching rejectedItem rule maps to ${cell.category}`
      );
    }
    return;
  }
}

export function buildEligibilityMatrix(options: {
  requestId: string;
  items: IntakeItem[];
  policies: ExtractedPolicy[];
  requestPincode?: string | undefined;
}): EligibilityMatrix {
  const { requestId, items, policies, requestPincode } = options;
  const cells: EligibilityCell[] = [];

  for (const item of items) {
    for (const policy of policies) {
      // 1. Service Area Check
      const serviceablePincodes = policy.serviceablePincodes?.values ?? [];
      const hasRestrictedPincodes = serviceablePincodes.length > 0;
      const isOutsideServiceArea =
        hasRestrictedPincodes &&
        Boolean(requestPincode && !serviceablePincodes.includes(requestPincode));

      if (isOutsideServiceArea) {
        const outsideCell: EligibilityCell = {
          itemId: item.id,
          itemDescription: item.rawText,
          category: item.category,
          recyclerId: policy.recyclerId,
          recyclerName: policy.companyName,
          status: "REJECTED",
          quote: policy.serviceablePincodes?.quote ?? null,
          url: policy.evidence.url,
          reason: `Pincode ${requestPincode ?? ""} is outside recycler serviceable area`,
        };
        validateEligibilityMatrixCell(outsideCell, policy);
        cells.push(outsideCell);
        continue;
      }

      // 2. Specific Item Category Rule Matching
      let status: EligibilityStatus = "UNKNOWN";
      let citedQuote: string | null = null;
      let reason: string | undefined;

      // Find specific accepted rule whose mapped categories include item.category
      const matchingAccepted = policy.acceptedItems.find((ai) => {
        const mappedCats = mapRawNameToCanonicalCategories(ai.rawName);
        return mappedCats.includes(item.category);
      });

      // Find specific rejected rule whose mapped categories include item.category
      const matchingRejected = policy.rejectedItems.find((ri) => {
        const mappedCats = mapRawNameToCanonicalCategories(ri.rawName);
        return mappedCats.includes(item.category);
      });

      if (matchingAccepted) {
        status = "ACCEPTED";
        citedQuote = matchingAccepted.quote;
      } else if (matchingRejected) {
        status = "REJECTED";
        citedQuote = matchingRejected.quote;
        reason = `Category ${item.category} explicitly rejected by recycler policy`;
      } else {
        status = "UNKNOWN";
        citedQuote = null;
        reason = `Category ${item.category} not explicitly listed in recycler policy`;
      }

      const cell: EligibilityCell = {
        itemId: item.id,
        itemDescription: item.rawText,
        category: item.category,
        recyclerId: policy.recyclerId,
        recyclerName: policy.companyName,
        status,
        quote: citedQuote,
        url: policy.evidence.url,
        reason,
      };

      validateEligibilityMatrixCell(cell, policy);
      cells.push(cell);
    }
  }

  return {
    requestId,
    items,
    cells,
    checkedAt: new Date().toISOString(),
  };
}

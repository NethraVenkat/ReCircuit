/**
 * packages/core/src/routing/eligibility.ts
 *
 * Deterministic eligibility matrix evaluation for (items x recyclers):
 * - Service area check based on request pincode
 * - Item category acceptance / rejection check based on verified policy quotes
 * - Grounded in cited quotes and page URLs
 */

import type { IntakeItem } from "../intake/schema.js";
import type { ExtractedPolicy } from "../policy/policy-schema.js";
import type { EligibilityCell, EligibilityMatrix, EligibilityStatus } from "./types.js";

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
        cells.push({
          itemId: item.id,
          itemDescription: item.rawText,
          category: item.category,
          recyclerId: policy.recyclerId,
          recyclerName: policy.companyName,
          status: "REJECTED",
          quote: policy.serviceablePincodes?.quote ?? null,
          url: policy.evidence.url,
          reason: `Pincode ${requestPincode ?? ""} is outside recycler serviceable area`,
        });
        continue;
      }

      // 2. Category Check
      let status: EligibilityStatus = "UNKNOWN";
      let citedQuote: string | null = null;
      let reason: string | undefined;

      const isAccepted = policy.acceptedCategories.includes(item.category);
      const isRejected = policy.rejectedCategories.includes(item.category);

      if (isAccepted) {
        status = "ACCEPTED";
        const matchingAccepted = policy.acceptedItems.find(
          (ai) => ai.rawName.toLowerCase().includes(item.category.replace(/_/g, " "))
        );
        citedQuote = matchingAccepted?.quote ?? policy.quotes[0] ?? null;
      } else if (isRejected) {
        status = "REJECTED";
        const matchingRejected = policy.rejectedItems.find(
          (ri) => ri.rawName.toLowerCase().includes(item.category.replace(/_/g, " "))
        );
        citedQuote = matchingRejected?.quote ?? policy.quotes[0] ?? null;
        reason = `Category ${item.category} explicitly rejected by recycler policy`;
      } else {
        status = "UNKNOWN";
        reason = `Category ${item.category} not explicitly listed in recycler policy`;
      }

      cells.push({
        itemId: item.id,
        itemDescription: item.rawText,
        category: item.category,
        recyclerId: policy.recyclerId,
        recyclerName: policy.companyName,
        status,
        quote: citedQuote,
        url: policy.evidence.url,
        reason,
      });
    }
  }

  return {
    requestId,
    items,
    cells,
    checkedAt: new Date().toISOString(),
  };
}

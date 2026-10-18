/**
 * packages/core/src/routing/types.ts
 *
 * Domain types for Stage 5 deterministic routing, eligibility matrix,
 * pricing engine, and lexicographic plan scoring.
 */

import type { IntakeItem } from "../intake/schema.js";
import type { Plan, RegistrationStatus } from "../types.js";

export type EligibilityStatus = "ACCEPTED" | "REJECTED" | "UNKNOWN";

export interface EligibilityCell {
  itemId: string;
  itemDescription: string;
  category: string;
  recyclerId: string;
  recyclerName: string;
  status: EligibilityStatus;
  quote: string | null;
  url: string;
  reason?: string | undefined;
}

export interface EligibilityMatrix {
  requestId: string;
  items: IntakeItem[];
  cells: EligibilityCell[];
  checkedAt: string;
}

export type LegInvalidReason =
  | "OUTSIDE_SERVICE_AREA"
  | "ITEMS_REJECTED"
  | "BELOW_MINIMUM_WEIGHT"
  | "UNKNOWN_FEE";

export interface LegPricingResult {
  recyclerId: string;
  valid: boolean;
  invalidReason?: LegInvalidReason | undefined;
  totalWeightKg: number;
  estimatedFee: number | null;
  estimatedPayout: number;
  itemPayouts: Record<string, number | null>;
  hasUnknownPayout: boolean;
  thresholdDistancePercent?: number | undefined;
  thresholdDistanceKg?: number | undefined;
}

export type ApprovalReason =
  | "FEE_CAP_EXCEEDED"
  | "FEE_CHARGED"
  | "REGISTRY_WARNING"
  | "ESTIMATED_WEIGHT_NEAR_THRESHOLD";

export interface PlanScored {
  plan: Plan;
  isPartial: boolean;
  unroutedItemIds: string[];
  unroutedItemsCount: number;
  registryWarningsCount: number;
  withinCap: boolean;
  totalFee: number;
  totalKnownPayout: number;
  netPayout: number;
  legsCount: number;
  approvalReasons: ApprovalReason[];
  recyclerIdsTiebreak: string;
}

export interface RoutingResult {
  matrix: EligibilityMatrix;
  bestPlan: Plan | null;
  alternatives: Plan[];
  scoredPlans: PlanScored[];
  unroutedItems: IntakeItem[];
}

export interface RecyclerRegistryInfo {
  id: string;
  name: string;
  registrationStatus: RegistrationStatus;
}

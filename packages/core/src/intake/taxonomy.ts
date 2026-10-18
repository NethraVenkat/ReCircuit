/**
 * packages/core/src/intake/taxonomy.ts
 *
 * Canonical taxonomy for ReRoute (code, not LLM).
 * Determines group, hazardClass, and default per-unit estimated weights.
 */

export type TaxonomyCategory =
  | "laptop"
  | "desktop"
  | "mobile_phone"
  | "charger_cable"
  | "battery_household"
  | "small_electronics"
  | "large_appliance"
  | "newspaper"
  | "cardboard"
  | "books_magazines"
  | "plastic"
  | "metal"
  | "glass"
  | "other";

export type TaxonomyGroup =
  | "e_waste"
  | "battery"
  | "paper"
  | "plastic"
  | "metal"
  | "glass"
  | "other";

export type TaxonomyHazardClass =
  | "none"
  | "battery_li_ion"
  | "battery_alkaline"
  | "battery_unknown";

export interface TaxonomyEntry {
  category: TaxonomyCategory;
  group: TaxonomyGroup;
  hazardClass: TaxonomyHazardClass;
  estimatedWeightKg: number | null; // per unit in kg
  unitType: "piece" | "kg";
}

export const CANONICAL_TAXONOMY: Record<TaxonomyCategory, TaxonomyEntry> = {
  laptop: {
    category: "laptop",
    group: "e_waste",
    hazardClass: "battery_li_ion",
    estimatedWeightKg: 2.2,
    unitType: "piece",
  },
  desktop: {
    category: "desktop",
    group: "e_waste",
    hazardClass: "none",
    estimatedWeightKg: 8.0,
    unitType: "piece",
  },
  mobile_phone: {
    category: "mobile_phone",
    group: "e_waste",
    hazardClass: "battery_li_ion",
    estimatedWeightKg: 0.2,
    unitType: "piece",
  },
  charger_cable: {
    category: "charger_cable",
    group: "e_waste",
    hazardClass: "none",
    estimatedWeightKg: 0.15,
    unitType: "piece",
  },
  battery_household: {
    category: "battery_household",
    group: "battery",
    hazardClass: "battery_alkaline",
    estimatedWeightKg: 0.03,
    unitType: "piece",
  },
  small_electronics: {
    category: "small_electronics",
    group: "e_waste",
    hazardClass: "none",
    estimatedWeightKg: 1.0,
    unitType: "piece",
  },
  large_appliance: {
    category: "large_appliance",
    group: "e_waste",
    hazardClass: "none",
    estimatedWeightKg: null,
    unitType: "piece",
  },
  newspaper: {
    category: "newspaper",
    group: "paper",
    hazardClass: "none",
    estimatedWeightKg: null,
    unitType: "kg",
  },
  cardboard: {
    category: "cardboard",
    group: "paper",
    hazardClass: "none",
    estimatedWeightKg: null,
    unitType: "kg",
  },
  books_magazines: {
    category: "books_magazines",
    group: "paper",
    hazardClass: "none",
    estimatedWeightKg: null,
    unitType: "kg",
  },
  plastic: {
    category: "plastic",
    group: "plastic",
    hazardClass: "none",
    estimatedWeightKg: null,
    unitType: "kg",
  },
  metal: {
    category: "metal",
    group: "metal",
    hazardClass: "none",
    estimatedWeightKg: null,
    unitType: "kg",
  },
  glass: {
    category: "glass",
    group: "glass",
    hazardClass: "none",
    estimatedWeightKg: null,
    unitType: "kg",
  },
  other: {
    category: "other",
    group: "other",
    hazardClass: "none",
    estimatedWeightKg: null,
    unitType: "piece",
  },
};

export function getTaxonomyEntry(category: string): TaxonomyEntry {
  if (category in CANONICAL_TAXONOMY) {
    return CANONICAL_TAXONOMY[category as TaxonomyCategory];
  }
  return CANONICAL_TAXONOMY.other;
}


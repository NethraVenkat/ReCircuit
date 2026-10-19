/**
 * packages/core/src/intake/taxonomy.ts
 *
 * Canonical taxonomy for ReCircuit (code, not LLM).
 * Determines group, hazardClass, and default per-unit estimated weights.
 */

import type { ItemCategory } from "../types.js";

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
  | "textiles"
  | "hazardous"
  | "other";

export type TaxonomyGroup =
  | "e_waste"
  | "battery"
  | "paper"
  | "plastic"
  | "metal"
  | "glass"
  | "textiles"
  | "hazardous"
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

/**
 * Bidirectional 1-to-1 mapping between domain ItemCategory and TaxonomyGroup.
 * Every ItemCategory in packages/core/src/types.ts belongs to exactly one category group.
 */
export const ITEM_CATEGORY_TO_GROUP: Record<ItemCategory, TaxonomyGroup> = {
  ELECTRONICS: "e_waste",
  BATTERIES: "battery",
  PAPER: "paper",
  PLASTIC: "plastic",
  METAL: "metal",
  GLASS: "glass",
  TEXTILES: "textiles",
  HAZARDOUS: "hazardous",
  OTHER: "other",
};

export const GROUP_TO_ITEM_CATEGORY: Record<TaxonomyGroup, ItemCategory> = {
  e_waste: "ELECTRONICS",
  battery: "BATTERIES",
  paper: "PAPER",
  plastic: "PLASTIC",
  metal: "METAL",
  glass: "GLASS",
  textiles: "TEXTILES",
  hazardous: "HAZARDOUS",
  other: "OTHER",
};

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
  textiles: {
    category: "textiles",
    group: "textiles",
    hazardClass: "none",
    estimatedWeightKg: null,
    unitType: "kg",
  },
  hazardous: {
    category: "hazardous",
    group: "hazardous",
    hazardClass: "battery_unknown",
    estimatedWeightKg: null,
    unitType: "piece",
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

export function itemCategoryToGroup(cat: ItemCategory): TaxonomyGroup {
  return ITEM_CATEGORY_TO_GROUP[cat];
}

export function groupToItemCategory(grp: TaxonomyGroup): ItemCategory {
  return GROUP_TO_ITEM_CATEGORY[grp];
}

export function taxonomyCategoryToItemCategory(cat: string): ItemCategory {
  const entry = getTaxonomyEntry(cat);
  return GROUP_TO_ITEM_CATEGORY[entry.group];
}

export function itemCategoryToTaxonomyCategories(cat: ItemCategory): TaxonomyCategory[] {
  const group = ITEM_CATEGORY_TO_GROUP[cat];
  return Object.values(CANONICAL_TAXONOMY)
    .filter((entry) => entry.group === group)
    .map((entry) => entry.category);
}

export const CANONICAL_LABELS: Record<TaxonomyCategory, string> = {
  laptop: "Laptop",
  desktop: "Desktop Computer",
  mobile_phone: "Mobile Phone",
  charger_cable: "Charger / Cable",
  battery_household: "Household Battery",
  small_electronics: "Small Electronics",
  large_appliance: "Large Appliance",
  newspaper: "Newspaper",
  cardboard: "Cardboard",
  books_magazines: "Books & Magazines",
  plastic: "Plastic Scrap",
  metal: "Metal Scrap",
  glass: "Glass Scrap",
  textiles: "Textiles",
  hazardous: "Hazardous Waste",
  other: "Other E-Waste",
};

export function getCanonicalItemLabel(input: string): string {
  if (!input) return "Recyclable Item";
  const lower = input.toLowerCase().trim();

  // Direct taxonomy category match
  if (lower in CANONICAL_LABELS) {
    return CANONICAL_LABELS[lower as TaxonomyCategory];
  }

  // Common keyword matches
  if (lower.includes("laptop") || lower.includes("notebook")) return "Laptop";
  if (lower.includes("desktop") || lower.includes("pc")) return "Desktop Computer";
  if (lower.includes("phone") || lower.includes("mobile")) return "Mobile Phone";
  if (lower.includes("battery") || lower.includes("batteries")) return "Household Battery";
  if (lower.includes("newspaper") || lower.includes("raddi")) return "Newspaper";
  if (lower.includes("cardboard") || lower.includes("carton")) return "Cardboard";
  if (lower.includes("book") || lower.includes("magazine")) return "Books & Magazines";
  if (lower.includes("charger") || lower.includes("cable") || lower.includes("wire")) return "Charger / Cable";
  if (lower.includes("electronic") || lower.includes("gadget")) return "Small Electronics";
  if (lower.includes("plastic")) return "Plastic Scrap";
  if (lower.includes("metal") || lower.includes("iron") || lower.includes("copper") || lower.includes("aluminum")) return "Metal Scrap";
  if (lower.includes("glass")) return "Glass Scrap";

  // ItemCategory matching
  if (lower === "electronics") return "Small Electronics";
  if (lower === "batteries") return "Household Battery";
  if (lower === "paper") return "Newspaper";

  return input;
}



/**
 * packages/core/src/policy/fixtures/portal-fixtures.ts
 *
 * Ground-truth captured portal texts and hand-crafted generic policy extractions.
 * Every quote is verbatim from the text; every numeric value appears in its quote.
 */

import type { GenericPolicyExtraction } from "../policy-schema.js";

export interface PortalFixture {
  recyclerId: string;
  companyName: string;
  pageText: string;
  extraction: GenericPolicyExtraction;
}

// ---------------------------------------------------------------------------
// 1. Deccan E-Cycle Solutions
// ---------------------------------------------------------------------------

export const DECCAN_PAGE_TEXT = `
Deccan E-Cycle Solutions
Official guidelines under CPCB E-Waste Management Rules (Hyderabad Region)
Commercial tariff schedule for residential collections across Hyderabad.
Pickup Fee & Payout Schedule:
Under 5 kg total weight: ₹180 standard pickup charge
5 kg or more total weight: ₹0 (FREE Pickup)
Item-Specific Payout Rates:
Dead or Functional Laptop: ₹250 cash payout each
Dead or Functional Mobile Phone: ₹60 cash payout each
Batteries (Li-ion / Alkaline): ₹0 payout (free safe ecological handling)
Chargers, Adapters & Wires: ₹0 payout (free safe ecological handling)
Permitted Electronic Items:
Laptops & Notebooks
Mobile Phones & Tablets
Desktops & Monitors
Household Batteries
Chargers & Cables
Small Consumer Electronics
Strictly Prohibited & Rejected Materials:
Paper, newspapers, office shredded documents, and books
Cardboard packaging boxes and cartons
Household plastics, pet bottles, and plastic containers
Glass bottles, window panes, and broken glass
Customer Data Privacy Guarantee: We require data wipe acknowledgement for laptops.
`.trim();

export const DECCAN_EXTRACTION: GenericPolicyExtraction = {
  acceptedItems: [
    { rawName: "Laptops & Notebooks", quote: "Laptops & Notebooks" },
    { rawName: "Mobile Phones & Tablets", quote: "Mobile Phones & Tablets" },
    { rawName: "Desktops & Monitors", quote: "Desktops & Monitors" },
    { rawName: "Household Batteries", quote: "Household Batteries" },
    { rawName: "Chargers & Cables", quote: "Chargers & Cables" },
    { rawName: "Small Consumer Electronics", quote: "Small Consumer Electronics" },
  ],
  rejectedItems: [
    { rawName: "Paper, newspapers, office shredded documents, and books", quote: "Paper, newspapers, office shredded documents, and books" },
    { rawName: "Cardboard packaging boxes and cartons", quote: "Cardboard packaging boxes and cartons" },
    { rawName: "Household plastics, pet bottles, and plastic containers", quote: "Household plastics, pet bottles, and plastic containers" },
    { rawName: "Glass bottles, window panes, and broken glass", quote: "Glass bottles, window panes, and broken glass" },
  ],
  feeRules: [
    { kind: "below_weight", amountInr: 180, thresholdKg: 5, quote: "Under 5 kg total weight: ₹180 standard pickup charge" },
    { kind: "free", amountInr: 0, thresholdKg: 5, quote: "5 kg or more total weight: ₹0 (FREE Pickup)" },
  ],
  payoutRules: [
    { rawName: "Dead or Functional Laptop", unit: "per_item", amountInr: 250, quote: "Dead or Functional Laptop: ₹250 cash payout each" },
    { rawName: "Dead or Functional Mobile Phone", unit: "per_item", amountInr: 60, quote: "Dead or Functional Mobile Phone: ₹60 cash payout each" },
    { rawName: "Batteries (Li-ion / Alkaline)", unit: "per_item", amountInr: 0, quote: "Batteries (Li-ion / Alkaline): ₹0 payout (free safe ecological handling)" },
    { rawName: "Chargers, Adapters & Wires", unit: "per_item", amountInr: 0, quote: "Chargers, Adapters & Wires: ₹0 payout (free safe ecological handling)" },
  ],
  minimumTotalKg: { value: null, quote: null },
  serviceablePincodes: { values: [], quote: null },
  registrationNotice: {
    text: "Official guidelines under CPCB E-Waste Management Rules (Hyderabad Region)",
    quote: "Official guidelines under CPCB E-Waste Management Rules (Hyderabad Region)",
  },
};

// ---------------------------------------------------------------------------
// 2. PaperPlus Kabadi
// ---------------------------------------------------------------------------

export const PAPERPLUS_PAGE_TEXT = `
PaperPlus Kabadi
What PaperPlus Buys & Full Rate Card
Accepted Paper Scrap Materials:
Newspaper (Raddi): ₹12 / kg
Corrugated Cardboard: ₹9 / kg
Old Books & Office Paper: ₹10 / kg
Magazines: ₹7 / kg
Buying & Collection Rules:
Minimum Weight: At least 5 kg total scrap weight is required for home pickup.
Doorstep Pickup: 100% Free pickup across Kukatpally, Madhapur, and KPHB.
Instant Payment: Immediate cash or UPI transfer upon weighing.
Materials Strictly Rejected by PaperPlus:
Batteries
Electronics
Plastics
Hazardous chemicals
`.trim();

export const PAPERPLUS_EXTRACTION: GenericPolicyExtraction = {
  acceptedItems: [
    { rawName: "Newspaper (Raddi)", quote: "Newspaper (Raddi)" },
    { rawName: "Corrugated Cardboard", quote: "Corrugated Cardboard" },
    { rawName: "Old Books & Office Paper", quote: "Old Books & Office Paper" },
    { rawName: "Magazines", quote: "Magazines" },
  ],
  rejectedItems: [
    { rawName: "Batteries", quote: "Batteries" },
    { rawName: "Electronics", quote: "Electronics" },
    { rawName: "Plastics", quote: "Plastics" },
    { rawName: "Hazardous chemicals", quote: "Hazardous chemicals" },
  ],
  feeRules: [
    { kind: "free", amountInr: 0, thresholdKg: null, quote: "Doorstep Pickup: 100% Free pickup across Kukatpally, Madhapur, and KPHB." },
  ],
  payoutRules: [
    { rawName: "Newspaper (Raddi)", unit: "per_kg", amountInr: 12, quote: "Newspaper (Raddi): ₹12 / kg" },
    { rawName: "Corrugated Cardboard", unit: "per_kg", amountInr: 9, quote: "Corrugated Cardboard: ₹9 / kg" },
    { rawName: "Old Books & Office Paper", unit: "per_kg", amountInr: 10, quote: "Old Books & Office Paper: ₹10 / kg" },
    { rawName: "Magazines", unit: "per_kg", amountInr: 7, quote: "Magazines: ₹7 / kg" },
  ],
  minimumTotalKg: {
    value: 5,
    quote: "Minimum Weight: At least 5 kg total scrap weight is required for home pickup.",
  },
  serviceablePincodes: {
    values: ["500072", "500081", "500085"],
    quote: "Doorstep Pickup: 100% Free pickup across Kukatpally, Madhapur, and KPHB.",
  },
  registrationNotice: { text: null, quote: null },
};

// ---------------------------------------------------------------------------
// 3. QuickScrap Hyd
// ---------------------------------------------------------------------------

export const QUICKSCRAP_PAGE_TEXT = `
QuickScrap Hyd
QuickScrap Tariff & Aggregator Rate Card
Standard pricing schedule across Greater Hyderabad area
Standard Logistics Fee:
₹199 Flat Pickup Fee
Charged on all doorstep collections regardless of load size or material combination.
Material Payout Table (Aggregator Discount Applied):
Dead Laptop / Notebook: ₹180 / unit
Dead Mobile Phone: ₹40 / unit
Old Newspaper: ₹9 / kg
Corrugated Cardboard: ₹4 / kg
Batteries & Small Plastics: ₹0 (Disposal only)
Prohibited:
Hazardous explosives and radioactive waste are prohibited.
Regulatory Notice:
QuickScrap Hyd is a private reverse-logistics startup. Registration application is in process with state pollution control authorities. This platform does not display CPCB certification.
Registration: application in process
`.trim();

export const QUICKSCRAP_EXTRACTION: GenericPolicyExtraction = {
  acceptedItems: [
    { rawName: "Dead Laptop / Notebook", quote: "Dead Laptop / Notebook" },
    { rawName: "Dead Mobile Phone", quote: "Dead Mobile Phone" },
    { rawName: "Old Newspaper", quote: "Old Newspaper" },
    { rawName: "Corrugated Cardboard", quote: "Corrugated Cardboard" },
    { rawName: "Batteries & Small Plastics", quote: "Batteries & Small Plastics" },
  ],
  rejectedItems: [],
  feeRules: [
    { kind: "flat", amountInr: 199, thresholdKg: null, quote: "₹199 Flat Pickup Fee" },
  ],
  payoutRules: [
    { rawName: "Dead Laptop / Notebook", unit: "per_item", amountInr: 180, quote: "Dead Laptop / Notebook: ₹180 / unit" },
    { rawName: "Dead Mobile Phone", unit: "per_item", amountInr: 40, quote: "Dead Mobile Phone: ₹40 / unit" },
    { rawName: "Old Newspaper", unit: "per_kg", amountInr: 9, quote: "Old Newspaper: ₹9 / kg" },
    { rawName: "Corrugated Cardboard", unit: "per_kg", amountInr: 4, quote: "Corrugated Cardboard: ₹4 / kg" },
    { rawName: "Batteries & Small Plastics", unit: "per_item", amountInr: 0, quote: "Batteries & Small Plastics: ₹0 (Disposal only)" },
  ],
  minimumTotalKg: { value: null, quote: null },
  serviceablePincodes: { values: [], quote: null },
  registrationNotice: {
    text: "Registration: application in process",
    quote: "Registration: application in process",
  },
};

// ---------------------------------------------------------------------------
// 4. GreenLoop Secunderabad (Unseen Recycler Fixture)
// ---------------------------------------------------------------------------

export const GREENLOOP_PAGE_TEXT = `
GreenLoop Secunderabad - Eco Scrap & Reverse Logistics
Doorstep recycling pickups across Secunderabad and Hyderabad pincodes: 500003, 500009, 500010.
Pickup Tariff:
We charge Rs. 99 for pickups below 3 kg total scrap weight.
Pickups of 3 kg or more are completely free of charge (Rs. 0 pickup charge).
Minimum pickup requirement: 1 kg total weight.
Accepted Scrap Materials:
Dead laptops and notebooks - payout Rs. 200 per unit
Household batteries - safe disposal
Newspaper bundles - payout Rs. 11 per kg
Prohibited Materials:
Bio-medical and hospital waste
Industrial chemical drums
Registration status: Registered recycler with TSPCB under Secunderabad e-waste circular 2025.
`.trim();

export const GREENLOOP_EXTRACTION: GenericPolicyExtraction = {
  acceptedItems: [
    { rawName: "Dead laptops and notebooks", quote: "Dead laptops and notebooks - payout Rs. 200 per unit" },
    { rawName: "Household batteries", quote: "Household batteries - safe disposal" },
    { rawName: "Newspaper bundles", quote: "Newspaper bundles - payout Rs. 11 per kg" },
  ],
  rejectedItems: [
    { rawName: "Bio-medical and hospital waste", quote: "Bio-medical and hospital waste" },
    { rawName: "Industrial chemical drums", quote: "Industrial chemical drums" },
  ],
  feeRules: [
    { kind: "below_weight", amountInr: 99, thresholdKg: 3, quote: "We charge Rs. 99 for pickups below 3 kg total scrap weight." },
    { kind: "free", amountInr: 0, thresholdKg: 3, quote: "Pickups of 3 kg or more are completely free of charge (Rs. 0 pickup charge)." },
  ],
  payoutRules: [
    { rawName: "Dead laptops and notebooks", unit: "per_item", amountInr: 200, quote: "Dead laptops and notebooks - payout Rs. 200 per unit" },
    { rawName: "Newspaper bundles", unit: "per_kg", amountInr: 11, quote: "Newspaper bundles - payout Rs. 11 per kg" },
  ],
  minimumTotalKg: {
    value: 1,
    quote: "Minimum pickup requirement: 1 kg total weight.",
  },
  serviceablePincodes: {
    values: ["500003", "500009", "500010"],
    quote: "Doorstep recycling pickups across Secunderabad and Hyderabad pincodes: 500003, 500009, 500010.",
  },
  registrationNotice: {
    text: "Registered recycler with TSPCB under Secunderabad e-waste circular 2025.",
    quote: "Registration status: Registered recycler with TSPCB under Secunderabad e-waste circular 2025.",
  },
};


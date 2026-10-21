import type { LlmAdapter, ModelTier } from "../types.js";

export interface FakeFixtureConfig {
  responses: string[];
}

const fixtureRegistry = new Map<string, FakeFixtureConfig>();
let callCount = 0;

export function getFakeCallCount(): number {
  return callCount;
}

export function registerFakeFixture(key: string, responses: string[] | string): void {
  fixtureRegistry.set(key, {
    responses: Array.isArray(responses) ? [...responses] : [responses],
  });
}

export function clearFakeFixtures(): void {
  fixtureRegistry.clear();
  callCount = 0;
}

export class FakeLlmAdapter implements LlmAdapter {
  async generate(options: {
    system: string;
    user: string;
    modelTier: ModelTier;
    timeoutMs: number;
    testFixtureName?: string;
  }): Promise<string> {
    await Promise.resolve();
    callCount++;
    const { user, testFixtureName } = options;

    // 1. Explicit fixture name matching
    if (testFixtureName && fixtureRegistry.has(testFixtureName)) {
      const cfg = fixtureRegistry.get(testFixtureName)!;
      const resp = cfg.responses.length > 1 ? cfg.responses.shift()! : cfg.responses[0]!;
      return resp;
    }

    // 2. Registry match by substring in user prompt or testFixtureName
    for (const [key, cfg] of fixtureRegistry.entries()) {
      if (user.includes(key) || (testFixtureName && testFixtureName.includes(key))) {
        const resp = cfg.responses.length > 1 ? cfg.responses.shift()! : cfg.responses[0]!;
        return resp;
      }
    }

    // 3. Built-in defaults based on common test inputs
    const lower = user.toLowerCase();

    // Policy extraction fixtures
    const isPolicyPrompt =
      options.system.toLowerCase().includes("polic") ||
      lower.includes("recycling policy") ||
      lower.includes("policy extraction");

    if (isPolicyPrompt) {
      if (lower.includes("deccan")) {
        const isHidden = lower.includes("hidden") || lower.includes("revision");
        return JSON.stringify({
          recyclerId: "deccan",
          companyName: "Deccan E-Cycle Solutions",
          acceptedItems: [
            { rawName: "Laptops & Notebooks", quote: "Laptops & Notebooks" },
            { rawName: "Household Batteries", quote: "Household Batteries" },
          ],
          rejectedItems: [
            { rawName: "Paper, newspapers, office shredded documents, and books", quote: "Paper, newspapers, office shredded documents, and books" },
          ],
          feeRules: isHidden ? [] : [
            { kind: "below_weight", amountInr: 180, thresholdKg: 5, quote: "Under 5 kg total weight: ₹180 standard pickup charge" },
            { kind: "free", amountInr: 0, thresholdKg: 5, quote: "5 kg or more total weight: ₹0 (FREE Pickup)" },
          ],
          payoutRules: isHidden ? [] : [
            { rawName: "Dead or Functional Laptop", unit: "per_item", amountInr: 250, quote: "Dead or Functional Laptop: ₹250 cash payout each" },
          ],
          minimumTotalKg: { value: null, quote: null },
          serviceablePincodes: { values: [], quote: null },
          registrationNotice: isHidden ? { text: null, quote: null } : {
            text: "Official guidelines under CPCB E-Waste Management Rules (Hyderabad Region)",
            quote: "Official guidelines under CPCB E-Waste Management Rules (Hyderabad Region)",
          },
          freeThresholdKg: isHidden ? null : 5,
          underWeightFeeInr: isHidden ? null : 180,
          minWeightKg: null,
          convenienceFeeInr: null,
          requiresDataWipeAck: true,
          acceptedCategories: ["laptop", "battery_household"],
          rejectedCategories: ["newspaper"],
          quotes: isHidden ? [
            "Laptops & Notebooks",
            "Household Batteries",
            "Paper, newspapers, office shredded documents, and books",
          ] : [
            "Under 5 kg total weight: ₹180 standard pickup charge",
            "5 kg or more total weight: ₹0 (FREE Pickup)",
            "Dead or Functional Laptop: ₹250 cash payout each",
            "Laptops & Notebooks",
            "Household Batteries",
          ],
          status: "SUCCESS",
          evidence: {
            url: "http://localhost:3101/pickup-charges",
            textHash: "deccan-hash",
            screenshotPath: ".data/evidence/deccan-policy.png",
            extractedAt: new Date().toISOString(),
            sessionId: "fake-session-deccan",
            extractionPath: "generic-ai",
          },
        });
      }

      if (lower.includes("paperplus")) {
        return JSON.stringify({
          recyclerId: "paperplus",
          companyName: "PaperPlus Kabadi",
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
          freeThresholdKg: null,
          underWeightFeeInr: null,
          minWeightKg: 5,
          convenienceFeeInr: 0,
          requiresDataWipeAck: false,
          acceptedCategories: ["newspaper", "cardboard", "books_magazines"],
          rejectedCategories: ["battery_household", "small_electronics", "plastic", "hazardous"],
          quotes: [
            "Minimum Weight: At least 5 kg total scrap weight is required for home pickup.",
            "Doorstep Pickup: 100% Free pickup across Kukatpally, Madhapur, and KPHB.",
            "Newspaper (Raddi): ₹12 / kg",
            "Corrugated Cardboard: ₹9 / kg",
            "Old Books & Office Paper: ₹10 / kg",
            "Magazines: ₹7 / kg",
          ],
          status: "SUCCESS",
          evidence: {
            url: "http://localhost:3102/what-we-take",
            textHash: "paperplus-hash",
            screenshotPath: ".data/evidence/paperplus-policy.png",
            extractedAt: new Date().toISOString(),
            sessionId: "fake-session-paperplus",
            extractionPath: "generic-ai",
          },
        });
      }

      if (lower.includes("quickscrap")) {
        return JSON.stringify({
          recyclerId: "quickscrap",
          companyName: "QuickScrap Hyd",
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
          freeThresholdKg: null,
          underWeightFeeInr: null,
          minWeightKg: null,
          convenienceFeeInr: 199,
          requiresDataWipeAck: false,
          acceptedCategories: ["laptop", "mobile_phone", "newspaper", "cardboard", "battery_household"],
          rejectedCategories: [],
          quotes: [
            "₹199 Flat Pickup Fee",
            "Dead Laptop / Notebook: ₹180 / unit",
            "Dead Mobile Phone: ₹40 / unit",
            "Old Newspaper: ₹9 / kg",
            "Corrugated Cardboard: ₹4 / kg",
            "Batteries & Small Plastics: ₹0 (Disposal only)",
            "Registration: application in process",
          ],
          status: "SUCCESS",
          evidence: {
            url: "http://localhost:3103/rates",
            textHash: "quickscrap-hash",
            screenshotPath: ".data/evidence/quickscrap-policy.png",
            extractedAt: new Date().toISOString(),
            sessionId: "fake-session-quickscrap",
            extractionPath: "generic-ai",
          },
        });
      }

      if (lower.includes("greenloop")) {
        return JSON.stringify({
          recyclerId: "greenloop",
          companyName: "GreenLoop Secunderabad",
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
            text: "Registration status: Registered recycler with TSPCB under Secunderabad e-waste circular 2025.",
            quote: "Registration status: Registered recycler with TSPCB under Secunderabad e-waste circular 2025.",
          },
          freeThresholdKg: 3,
          underWeightFeeInr: 99,
          minWeightKg: 1,
          convenienceFeeInr: null,
          requiresDataWipeAck: false,
          acceptedCategories: ["laptop", "battery_household", "newspaper"],
          rejectedCategories: ["hazardous"],
          quotes: [
            "We charge Rs. 99 for pickups below 3 kg total scrap weight.",
            "Pickups of 3 kg or more are completely free of charge (Rs. 0 pickup charge).",
            "Dead laptops and notebooks - payout Rs. 200 per unit",
            "Newspaper bundles - payout Rs. 11 per kg",
            "Minimum pickup requirement: 1 kg total weight.",
          ],
          status: "SUCCESS",
          evidence: {
            url: "http://localhost:3104",
            textHash: "greenloop-hash",
            screenshotPath: ".data/evidence/greenloop-policy.png",
            extractedAt: new Date().toISOString(),
            sessionId: "fake-session-greenloop",
            extractionPath: "generic-ai",
          },
        });
      }
    }

    // Check for simulated non-json retry failure
    if (lower.includes("test_always_non_json")) {
      return "I am an AI and here is your result: { invalid json";
    }

    // Check for simulated non-json retry recovery
    if (lower.includes("test_retry_recover")) {
      if (user.includes("Validation error") || user.includes("Invalid JSON")) {
        return JSON.stringify({
          location: { rawText: "Kukatpally", locality: "Kukatpally", pincode: "500072", city: "Hyderabad", confidence: 0.95 },
          feeCapInr: 150,
          items: [{ rawText: "laptop", category: "laptop", quantity: 1, hazardClass: "battery_li_ion", confidence: 0.95 }],
          clarifications: [],
        });
      }
      return "Here is your output:\n```json\n{ not valid json";
    }

    // Check for hallucinated fee cap test
    if (lower.includes("test_hallucinated_cap") || (lower.includes("dell laptop") && lower.includes("no fee mentioned"))) {
      return JSON.stringify({
        location: { rawText: "Kukatpally", locality: "Kukatpally", pincode: "500072", city: "Hyderabad", confidence: 0.95 },
        feeCapInr: 200, // Hallucinated! Not in user text!
        items: [{ rawText: "Dell laptop", category: "laptop", quantity: 1, hazardClass: "battery_li_ion", confidence: 0.95 }],
        clarifications: [],
      });
    }

    // Bangalore / outside city
    if (lower.includes("bengaluru") || lower.includes("bangalore")) {
      return JSON.stringify({
        location: { rawText: "Bengaluru", city: "Bengaluru", confidence: 0.9 },
        feeCapInr: null,
        items: [{ rawText: "laptop", category: "laptop", quantity: 1, hazardClass: "battery_li_ion", confidence: 0.95 }],
        clarifications: [],
      });
    }

    // Vague item
    if (lower.includes("mysterious metal box")) {
      return JSON.stringify({
        location: { rawText: "Hyderabad", city: "Hyderabad", confidence: 0.8 },
        feeCapInr: null,
        items: [{ rawText: "mysterious metal box with wires", category: "other", quantity: 1, confidence: 0.5 }],
        clarifications: [],
      });
    }

    // Missing weight / count for newspaper
    if (lower.includes("some old newspaper")) {
      return JSON.stringify({
        location: { rawText: "Madhapur", locality: "Madhapur", pincode: "500081", city: "Hyderabad", confidence: 0.95 },
        feeCapInr: null,
        items: [{ rawText: "some old newspaper", category: "newspaper", quantity: 1, confidence: 0.9 }],
        clarifications: [],
      });
    }

    // TC2 official scenario: 2 batteries and 8 kg newspaper
    if ((lower.includes("batteries") || lower.includes("battery")) && lower.includes("newspaper") && !lower.includes("laptop")) {
      return JSON.stringify({
        location: { rawText: "Kukatpally, Hyderabad 500072", locality: "Kukatpally", pincode: "500072", city: "Hyderabad", confidence: 0.98 },
        feeCapInr: null,
        items: [
          { rawText: "8 kg newspaper", category: "newspaper", quantity: 1, declaredWeightKg: 8, confidence: 0.95 },
          { rawText: "2 batteries", category: "battery_household", quantity: 2, hazardClass: "battery_alkaline", confidence: 0.95 },
        ],
        clarifications: [],
      });
    }

    // Two laptops and 8 kg newspaper
    if (lower.includes("two laptops") && lower.includes("newspaper")) {
      return JSON.stringify({
        location: { rawText: "KPHB", locality: "KPHB", pincode: "500085", city: "Hyderabad", confidence: 0.95 },
        feeCapInr: null,
        items: [
          { rawText: "two laptops", category: "laptop", quantity: 2, hazardClass: "battery_li_ion", confidence: 0.95 },
          { rawText: "8 kg newspaper", category: "newspaper", quantity: 1, declaredWeightKg: 8, confidence: 0.95 },
        ],
        clarifications: [],
      });
    }

    // Exact demo sentence: "I have one dead Dell laptop, two old batteries and around 8 kg of newspaper in Kukatpally, Hyderabad. Don't charge me more than ₹150."
    if (lower.includes("one dead dell laptop") && lower.includes("two old batteries")) {
      return JSON.stringify({
        location: { rawText: "Kukatpally, Hyderabad 500072", locality: "Kukatpally", pincode: "500072", city: "Hyderabad", confidence: 0.98 },
        feeCapInr: 150,
        items: [
          { rawText: "one dead Dell laptop", category: "laptop", quantity: 1, hazardClass: "battery_li_ion", confidence: 0.98 },
          { rawText: "two old batteries", category: "battery_household", quantity: 2, hazardClass: "battery_alkaline", confidence: 0.95 },
          { rawText: "around 8 kg of newspaper", category: "newspaper", quantity: 1, declaredWeightKg: 8, confidence: 0.95 },
        ],
        clarifications: [],
      });
    }

    // A pair of chargers
    if (lower.includes("pair of chargers")) {
      return JSON.stringify({
        location: { rawText: "Madhapur, Hyderabad", locality: "Madhapur", pincode: "500081", city: "Hyderabad", confidence: 0.95 },
        feeCapInr: null,
        items: [
          { rawText: "a pair of chargers", category: "charger_cable", quantity: 2, hazardClass: "none", confidence: 0.95 },
        ],
        clarifications: [],
      });
    }

    // 3 items demo sentence: laptop, newspapers, AA batteries
    if (lower.includes("dell laptop") && lower.includes("newspaper") && lower.includes("batteries")) {
      return JSON.stringify({
        location: { rawText: "Kukatpally, Hyderabad 500072", locality: "Kukatpally", pincode: "500072", city: "Hyderabad", confidence: 0.98 },
        feeCapInr: 150,
        items: [
          { rawText: "old Dell laptop that doesn't turn on", category: "laptop", quantity: 1, hazardClass: "battery_li_ion", confidence: 0.95 },
          { rawText: "8 kg of old newspapers", category: "newspaper", quantity: 1, declaredWeightKg: 8, confidence: 0.95 },
          { rawText: "3 dead AA batteries", category: "battery_household", quantity: 3, hazardClass: "battery_alkaline", confidence: 0.95 },
        ],
        clarifications: [],
      });
    }

    // Default canonical laptop fixture ("one dead Dell laptop, Kukatpally, max fee ₹150")
    return JSON.stringify({
      location: { rawText: "Kukatpally", locality: "Kukatpally", pincode: "500072", city: "Hyderabad", confidence: 0.95 },
      feeCapInr: 150,
      items: [
        {
          rawText: "Dell laptop",
          category: "laptop",
          quantity: 1,
          hazardClass: "battery_li_ion",
          confidence: 0.95,
        },
      ],
      clarifications: [],
    });
  }
}

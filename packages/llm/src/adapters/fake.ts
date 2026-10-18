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
        return JSON.stringify({
          recyclerId: "deccan",
          companyName: "Deccan E-Cycle Solutions",
          acceptedCategories: ["laptop", "desktop", "mobile_phone", "charger_cable", "battery_household"],
          rejectedCategories: ["newspaper", "cardboard"],
          rates: [
            { item: "Dead or Functional Laptop", payout: "₹250", fee: "₹0" },
            { item: "Dead or Functional Mobile Phone", payout: "₹60", fee: "₹0" },
          ],
          freeThresholdKg: 5,
          underWeightFeeInr: 180,
          minWeightKg: 0,
          convenienceFeeInr: null,
          requiresDataWipeAck: true,
          quotes: [
            "Under 5 kg total weight",
            "₹180 standard pickup charge",
            "5 kg or more total weight",
            "₹0 (FREE Pickup)",
            "Dead or Functional Laptop: ₹250 cash payout each",
            "Dead or Functional Mobile Phone: ₹60 cash payout each",
          ],
          status: "SUCCESS",
          evidence: {
            url: "http://localhost:3101/pickup-charges",
            screenshotRef: ".data/evidence/deccan-policy.png",
            extractedAt: new Date().toISOString(),
            sessionId: "fake-session-deccan",
          },
        });
      }

      if (lower.includes("paperplus")) {
        return JSON.stringify({
          recyclerId: "paperplus",
          companyName: "PaperPlus Kabadi",
          acceptedCategories: ["newspaper", "cardboard", "books_magazines"],
          rejectedCategories: ["laptop", "battery_household"],
          rates: [
            { item: "Newspaper (Raddi)", payout: "₹14 / kg", fee: "₹0" },
            { item: "Corrugated Cardboard", payout: "₹9 / kg", fee: "₹0" },
          ],
          freeThresholdKg: null,
          underWeightFeeInr: null,
          minWeightKg: 5,
          convenienceFeeInr: 0,
          requiresDataWipeAck: false,
          quotes: [
            "Minimum Weight: At least 5 kg total scrap weight is required for home pickup.",
            "Doorstep Pickup: 100% Free pickup across Kukatpally, Madhapur, and KPHB.",
            "Newspaper (Raddi)",
            "₹14 / kg",
            "Corrugated Cardboard",
            "₹9 / kg",
          ],
          status: "SUCCESS",
          evidence: {
            url: "http://localhost:3102/what-we-take",
            screenshotRef: ".data/evidence/paperplus-policy.png",
            extractedAt: new Date().toISOString(),
            sessionId: "fake-session-paperplus",
          },
        });
      }

      if (lower.includes("quickscrap")) {
        return JSON.stringify({
          recyclerId: "quickscrap",
          companyName: "QuickScrap Hyderabad",
          acceptedCategories: ["laptop", "newspaper", "cardboard", "battery_household"],
          rejectedCategories: ["hazardous"],
          rates: [
            { item: "Dead Laptop / Notebook", payout: "₹180 / unit", fee: "₹199 Flat Pickup Fee" },
            { item: "Dead Mobile Phone", payout: "₹40 / unit", fee: "₹199 Flat Pickup Fee" },
          ],
          freeThresholdKg: null,
          underWeightFeeInr: null,
          minWeightKg: 0,
          convenienceFeeInr: 199,
          requiresDataWipeAck: false,
          registrationNotice: "Registration: application in process",
          quotes: [
            "₹199 Flat Pickup Fee",
            "Charged on all doorstep collections regardless of load size or material combination.",
            "Dead Laptop / Notebook",
            "₹180 / unit",
            "Dead Mobile Phone",
            "₹40 / unit",
            "Registration: application in process",
          ],
          status: "SUCCESS",
          evidence: {
            url: "http://localhost:3103/rates",
            screenshotRef: ".data/evidence/quickscrap-policy.png",
            extractedAt: new Date().toISOString(),
            sessionId: "fake-session-quickscrap",
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

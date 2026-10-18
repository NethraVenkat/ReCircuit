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

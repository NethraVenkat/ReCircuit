/**
 * packages/core/src/intake/intake.test.ts
 *
 * Vitest tests for User Intake & Item Classification:
 * - "one dead Dell laptop, Kukatpally, max fee ₹150": 1 item, laptop, 2.2 kg estimated, li_ion, feeCapInr = 150, pincode 500072, state ITEMS_PARSED.
 * - "two laptops and 8 kg newspaper, KPHB": 2 items, right weights, state ITEMS_PARSED.
 * - "some old newspaper, Madhapur": count/weight missing -> NEEDS_CLARIFICATION with question.
 * - "a mysterious metal box with wires": low confidence -> 'other' + clarification.
 * - LLM hallucinates feeCapInr = 200 when user said nothing about fee -> post-processor strips it, sets feeCapInr = null.
 * - Non-JSON from LLM -> retries once, succeeds if retry succeeds, throws LlmOutputError if retry fails.
 * - Location "Bengaluru" -> NEEDS_CLARIFICATION (Hyderabad only).
 * - applyClarification resolves a clarification and moves state to ITEMS_PARSED.
 * - Item IDs are stable UUIDs generated in TS, not LLM output.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseIntake } from "./parser.js";
import { applyClarification, createDomainRequestFromIntake } from "./post-processor.js";
import type { IntakeItem, IntakeClarification } from "./schema.js";
import { clearFakeFixtures, LlmOutputError } from "@reroute/llm";

describe("Stage 3: User Intake + Item Classification Test Suite", () => {
  beforeEach(() => {
    clearFakeFixtures();
    process.env.LLM_PROVIDER = "fake";
  });

  // -------------------------------------------------------------------------
  // 1. Canonical Laptop Sentence: Fee cap, locality, estimated weight, ITEMS_PARSED
  // -------------------------------------------------------------------------
  it("parses canonical 'one dead Dell laptop, Kukatpally, max fee ₹150' into 1 laptop item, 2.2 kg estimated, li_ion, feeCapInr 150, 500072, ITEMS_PARSED", async () => {
    const text = "one dead Dell laptop, Kukatpally, max fee ₹150";

    const result = await parseIntake(text);

    expect(result.state).toBe("ITEMS_PARSED");
    expect(result.feeCapInr).toBe(150);
    expect(result.location.locality).toBe("Kukatpally");
    expect(result.location.pincode).toBe("500072");
    expect(result.location.city).toBe("Hyderabad");
    expect(result.clarifications).toHaveLength(0);

    expect(result.items).toHaveLength(1);
    const laptop = result.items[0]!;
    expect(laptop.category).toBe("laptop");
    expect(laptop.quantity).toBe(1);
    expect(laptop.estimatedWeightKg).toBe(2.2);
    expect(laptop.weightSource).toBe("estimated");
    expect(laptop.hazardClass).toBe("battery_li_ion");
    expect(laptop.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    // Verify domain request state transition
    const domainReq = createDomainRequestFromIntake(result);
    expect(domainReq.state).toBe("ITEMS_PARSED");
    expect(domainReq.feeCapInr).toBe(150);
  });

  // -------------------------------------------------------------------------
  // 2. Multi-item: Two laptops and 8 kg newspaper
  // -------------------------------------------------------------------------
  it("parses 'two laptops and 8 kg newspaper, KPHB' into 2 items with correct weights, state ITEMS_PARSED", async () => {
    const text = "two laptops and 8 kg newspaper, KPHB";

    const result = await parseIntake(text);

    expect(result.state).toBe("ITEMS_PARSED");
    expect(result.feeCapInr).toBeNull();
    expect(result.location.locality).toBe("KPHB");
    expect(result.location.pincode).toBe("500085");
    expect(result.items).toHaveLength(2);

    const laptop = result.items.find((i: IntakeItem) => i.category === "laptop");
    expect(laptop).toBeDefined();
    expect(laptop?.quantity).toBe(2);
    expect(laptop?.estimatedWeightKg).toBe(4.4); // 2.2 * 2
    expect(laptop?.weightSource).toBe("estimated");

    const news = result.items.find((i: IntakeItem) => i.category === "newspaper");
    expect(news).toBeDefined();
    expect(news?.declaredWeightKg).toBe(8);
    expect(news?.weightSource).toBe("user_declared");
    expect(news?.hazardClass).toBe("none");

    const domainReq = createDomainRequestFromIntake(result);
    expect(domainReq.state).toBe("ITEMS_PARSED");
  });

  // -------------------------------------------------------------------------
  // 3. Missing weight on paper/cardboard -> NEEDS_CLARIFICATION
  // -------------------------------------------------------------------------
  it("flags missing weight/count on paper ('some old newspaper, Madhapur') as NEEDS_CLARIFICATION with clarification question", async () => {
    const text = "some old newspaper, Madhapur";

    const result = await parseIntake(text);

    expect(result.state).toBe("NEEDS_CLARIFICATION");
    expect(result.clarifications.length).toBeGreaterThanOrEqual(1);
    const weightClarification = result.clarifications.find((c: IntakeClarification) => c.code === "CLARIFY_WEIGHT_PAPER");
    expect(weightClarification).toBeDefined();
    expect(weightClarification?.question).toMatch(/how many kg or stacks/i);

    const domainReq = createDomainRequestFromIntake(result);
    expect(domainReq.state).toBe("NEEDS_CLARIFICATION");
  });

  // -------------------------------------------------------------------------
  // 4. Ambiguous / Vague item -> 'other' + clarification
  // -------------------------------------------------------------------------
  it("classifies vague items ('a mysterious metal box with wires') as category 'other' and asks clarification", async () => {
    const text = "a mysterious metal box with wires";

    const result = await parseIntake(text);

    expect(result.state).toBe("NEEDS_CLARIFICATION");
    expect(result.items[0]?.category).toBe("other");
    const vagueClarification = result.clarifications.find((c: IntakeClarification) => c.code === "CLARIFY_ITEM_VAGUE");
    expect(vagueClarification).toBeDefined();
    expect(vagueClarification?.question).toMatch(/what kind of item/i);
  });

  // -------------------------------------------------------------------------
  // 5. Anti-hallucination: Rejects hallucinated feeCapInr not in text
  // -------------------------------------------------------------------------
  it("discards feeCapInr if hallucinated by LLM and not mentioned in user text", async () => {
    // User mentions no fee cap, but fake adapter injects feeCapInr: 200
    const text = "test_hallucinated_cap: One Dell laptop, Kukatpally, no fee mentioned";

    const result = await parseIntake(text);

    // Deterministic post-processor must strip the hallucinated 200!
    expect(result.feeCapInr).toBeNull();
    expect(result.state).toBe("ITEMS_PARSED");
  });

  // -------------------------------------------------------------------------
  // 6. Non-JSON from LLM: Retry once, then succeed or throw LlmOutputError
  // -------------------------------------------------------------------------
  it("retries once when LLM output is non-JSON and succeeds if second attempt is valid", async () => {
    const text = "test_retry_recover: one dead Dell laptop, Kukatpally";

    const result = await parseIntake(text);

    expect(result.state).toBe("ITEMS_PARSED");
    expect(result.items[0]?.category).toBe("laptop");
  });

  it("throws typed LlmOutputError when LLM repeatedly returns non-JSON across retries", async () => {
    const text = "test_always_non_json: laptop";

    await expect(parseIntake(text)).rejects.toThrow(LlmOutputError);
  });

  // -------------------------------------------------------------------------
  // 7. Location outside service area (Bengaluru) -> NEEDS_CLARIFICATION
  // -------------------------------------------------------------------------
  it("flags location outside Hyderabad ('Bengaluru') as NEEDS_CLARIFICATION (Hyderabad only demo)", async () => {
    const text = "one laptop, Bengaluru";

    const result = await parseIntake(text);

    expect(result.state).toBe("NEEDS_CLARIFICATION");
    const locClarification = result.clarifications.find(
      (c: IntakeClarification) => c.code === "LOCATION_OUTSIDE_SERVICE_AREA"
    );
    expect(locClarification).toBeDefined();
    expect(locClarification?.question).toMatch(/only operates within Hyderabad/i);
  });

  // -------------------------------------------------------------------------
  // 8. applyClarification helper: Resolves clarification and transitions state
  // -------------------------------------------------------------------------
  it("applyClarification resolves clarification and moves state from NEEDS_CLARIFICATION to ITEMS_PARSED", async () => {
    const text = "some old newspaper, Madhapur";
    const initial = await parseIntake(text);
    expect(initial.state).toBe("NEEDS_CLARIFICATION");

    // Answer clarification with 8 kg
    const resolved = applyClarification(initial, "CLARIFY_WEIGHT_PAPER", "About 8 kg in bundles");

    expect(resolved.state).toBe("ITEMS_PARSED");
    expect(resolved.clarifications).toHaveLength(0);
    expect(resolved.items[0]?.declaredWeightKg).toBe(8);
    expect(resolved.items[0]?.weightSource).toBe("user_declared");

    const domainReq = createDomainRequestFromIntake(resolved);
    expect(domainReq.state).toBe("ITEMS_PARSED");
  });

  // -------------------------------------------------------------------------
  // 9. Stable Item UUIDs generated in TypeScript, never LLM
  // -------------------------------------------------------------------------
  it("assigns valid, unique RFC4122 v4 UUIDs generated in TypeScript to every item", async () => {
    const text = "two laptops and 8 kg newspaper, KPHB";

    const result = await parseIntake(text);

    expect(result.items).toHaveLength(2);
    const [item1, item2] = result.items;
    expect(item1?.id).toBeDefined();
    expect(item2?.id).toBeDefined();
    expect(item1?.id).not.toBe(item2?.id);
    expect(item1?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});

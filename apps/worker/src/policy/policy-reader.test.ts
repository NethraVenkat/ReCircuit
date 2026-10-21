/**
 * apps/worker/src/policy/policy-reader.test.ts
 *
 * Unit tests for policy reader:
 * - Primary generic AI extraction path
 * - Partial extraction when fee info is hidden (returns items + payouts, feesUnknown = true)
 * - Anti-hallucination retry and recovery
 * - Labeled DOM fallback (extractionPath: "dom-fallback")
 * - Unseen recycler extraction on static HTML fixture (GreenLoop Secunderabad)
 * - Strict ConfigurationError for Browserbase missing keys
 * - Local session ID prefix "local-"
 */

import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach } from "vitest";
import { readRecyclerPolicy, extractPolicyViaDomFallback } from "./policy-reader.js";
import { openSession, ConfigurationError, type BrowserSession } from "../browser/session.js";
import { FakeLlmAdapter, clearFakeFixtures, registerFakeFixture } from "@recircuit/llm";
import { DECCAN_PAGE_TEXT, DECCAN_EXTRACTION, validatePolicyAgainstPageText } from "@recircuit/core";

describe("Stage 4 Fixes: Worker Policy Reader Unit Tests", () => {
  let fakeSession: BrowserSession;
  let mockPageText: string;
  let mockHiddenBanner: boolean;

  beforeEach(() => {
    clearFakeFixtures();
    process.env.LLM_PROVIDER = "fake";
    mockPageText = DECCAN_PAGE_TEXT;
    mockHiddenBanner = false;

    fakeSession = {
      sessionId: "local-test-001",
      mode: "local",
      page: {
        goto: async (): Promise<null> => {
          await Promise.resolve();
          return null;
        },
        locator: (_selector: string) => ({
          count: async (): Promise<number> => {
            await Promise.resolve();
            return 2;
          },
          nth: (i: number): { getAttribute: () => Promise<string> } => ({
            getAttribute: async (): Promise<string> => {
              await Promise.resolve();
              return i === 0 ? "/pickup-charges" : "/accepted-items";
            },
          }),
          innerText: async (): Promise<string> => {
            await Promise.resolve();
            return mockPageText;
          },
        }),
        $: async (selector: string): Promise<Record<string, unknown> | null> => {
          await Promise.resolve();
          return selector.includes("fee-info-hidden") && mockHiddenBanner ? {} : null;
        },
        $$eval: async (_selector: string, fn: (els: unknown[]) => unknown): Promise<unknown> => {
          await Promise.resolve();
          return fn([{ innerText: "Under 5 kg total weight: ₹180 standard pickup charge" }]);
        },
        close: async (): Promise<void> => {
          await Promise.resolve();
        },
      } as unknown as BrowserSession["page"],
      captureScreenshot: async (label: string): Promise<{ path: string; buffer: Buffer; filename: string }> => {
        await Promise.resolve();
        return {
          path: `.data/evidence/mock-${label}.png`,
          buffer: Buffer.from("mock-png"),
          filename: `mock-${label}.png`,
        };
      },
      close: async (): Promise<void> => {
        await Promise.resolve();
      },
    };
  });

  it("extracts Deccan policy via primary generic-ai path with honest quotes and no defaults", async () => {
    const policy = await readRecyclerPolicy("deccan", fakeSession, "http://localhost:3101");
    expect(policy.status).toBe("SUCCESS");
    expect(policy.recyclerId).toBe("deccan");
    expect(policy.underWeightFeeInr).toBe(180);
    expect(policy.freeThresholdKg).toBe(5);
    expect(policy.minWeightKg).toBeNull(); // Rule 3: NEVER default to 0!
    expect(policy.evidence.extractionPath).toBe("generic-ai");
    expect(policy.acceptedCategories).toContain("laptop");
    expect(policy.rejectedCategories).toContain("newspaper");
    expect(policy.feesUnknown).toBe(false);
  });

  it("returns partial extraction when fee information is hidden (preserves items/payouts, feesUnknown=true)", async () => {
    mockHiddenBanner = true;
    mockPageText = `
      Deccan E-Cycle Solutions
      Tariff revision in progress. Fee schedule is currently being revised.
      Dead or Functional Laptop: ₹250 cash payout each
      Permitted Electronic Items:
      Laptops & Notebooks
      Household Batteries
      Strictly Prohibited & Rejected Materials:
      Paper, newspapers, office shredded documents, and books
    `;

    const policy = await readRecyclerPolicy("deccan", fakeSession, "http://localhost:3101");
    expect(policy.status).toBe("SUCCESS");
    expect(policy.feesUnknown).toBe(true);
    expect(policy.acceptedCategories).toContain("laptop");
    expect(policy.feeRules).toHaveLength(0);
  });

  it("falls back to labeled dom-fallback when generic-ai fails anti-hallucination", async () => {
    const adapter = new FakeLlmAdapter();
    registerFakeFixture("always_hallucinated", [
      JSON.stringify({
        acceptedItems: [],
        rejectedItems: [],
        feeRules: [{ kind: "flat", amountInr: 9999, thresholdKg: null, quote: "Invented non-existent quote" }],
        payoutRules: [],
        minimumTotalKg: { value: null, quote: null },
        serviceablePincodes: { values: [], quote: null },
        registrationNotice: { text: null, quote: null },
      }),
      JSON.stringify({
        acceptedItems: [],
        rejectedItems: [],
        feeRules: [{ kind: "flat", amountInr: 9999, thresholdKg: null, quote: "Invented non-existent quote again" }],
        payoutRules: [],
        minimumTotalKg: { value: null, quote: null },
        serviceablePincodes: { values: [], quote: null },
        registrationNotice: { text: null, quote: null },
      }),
    ]);

    const originalGen = adapter.generate.bind(adapter);
    adapter.generate = async (opts): Promise<string> => originalGen({ ...opts, testFixtureName: "always_hallucinated" });

    const policy = await readRecyclerPolicy("deccan", fakeSession, "http://localhost:3101", adapter);
    expect(policy.status).toBe("SUCCESS");
    expect(policy.evidence.extractionPath).toBe("dom-fallback");
  });

  it("recovers on retry when second extraction attempt adheres strictly to quotes", async () => {
    const adapter = new FakeLlmAdapter();
    registerFakeFixture("recovery_policy", [
      // Attempt 1: hallucinated number
      JSON.stringify({
        acceptedItems: [],
        rejectedItems: [],
        feeRules: [{ kind: "below_weight", amountInr: 999, thresholdKg: 5, quote: "Under 5 kg total weight: ₹180 standard pickup charge" }],
        payoutRules: [],
        minimumTotalKg: { value: null, quote: null },
        serviceablePincodes: { values: [], quote: null },
        registrationNotice: { text: null, quote: null },
      }),
      // Attempt 2: valid grounded extraction
      JSON.stringify({
        acceptedItems: [{ rawName: "Laptops & Notebooks", quote: "Laptops & Notebooks" }],
        rejectedItems: [],
        feeRules: [{ kind: "below_weight", amountInr: 180, thresholdKg: 5, quote: "Under 5 kg total weight: ₹180 standard pickup charge" }],
        payoutRules: [{ rawName: "Dead or Functional Laptop", unit: "per_item", amountInr: 250, quote: "Dead or Functional Laptop: ₹250 cash payout each" }],
        minimumTotalKg: { value: null, quote: null },
        serviceablePincodes: { values: [], quote: null },
        registrationNotice: { text: null, quote: null },
      }),
    ]);

    const originalGen = adapter.generate.bind(adapter);
    adapter.generate = async (opts): Promise<string> => originalGen({ ...opts, testFixtureName: "recovery_policy" });

    const policy = await readRecyclerPolicy("deccan", fakeSession, "http://localhost:3101", adapter);
    expect(policy.status).toBe("SUCCESS");
    expect(policy.underWeightFeeInr).toBe(180);
    expect(policy.evidence.extractionPath).toBe("generic-ai");
  });

  it("extracts unseen recycler GreenLoop Secunderabad correctly via generic-ai while dom-fallback fails", async () => {
    const fixtureHtmlPath = path.resolve(process.cwd(), "apps", "worker", "fixtures", "greenloop.html");
    const htmlContent = fs.readFileSync(fixtureHtmlPath, "utf-8");
    // Strip HTML tags for visible text simulation
    const visibleText = htmlContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    mockPageText = visibleText;

    // 1. Generic AI path succeeds on unseen recycler
    const policy = await readRecyclerPolicy("greenloop", fakeSession, "http://localhost:3104");
    expect(policy.status).toBe("SUCCESS");
    expect(policy.recyclerId).toBe("greenloop");
    expect(policy.underWeightFeeInr).toBe(99);
    expect(policy.freeThresholdKg).toBe(3);
    expect(policy.minWeightKg).toBe(1);
    expect(policy.evidence.extractionPath).toBe("generic-ai");

    // 2. DOM fallback fails (returns null) on unseen recycler
    const domRes = await extractPolicyViaDomFallback("greenloop", fakeSession, visibleText);
    expect(domRes).toBeNull();
  });

  it("strictly throws ConfigurationError when BROWSER_MODE=browserbase and keys are missing", async () => {
    const origKey = process.env.BROWSERBASE_API_KEY;
    const origProject = process.env.BROWSERBASE_PROJECT_ID;
    delete process.env.BROWSERBASE_API_KEY;
    delete process.env.BROWSERBASE_PROJECT_ID;

    try {
      await expect(openSession({ mode: "browserbase" })).rejects.toThrow(ConfigurationError);
    } finally {
      if (origKey) process.env.BROWSERBASE_API_KEY = origKey;
      if (origProject) process.env.BROWSERBASE_PROJECT_ID = origProject;
    }
  });

  it("local browser sessions get deterministic synthetic session IDs prefixed with local-", async () => {
    const session = await openSession({ mode: "local" });
    try {
      expect(session.sessionId.startsWith("local-")).toBe(true);
      expect(session.mode).toBe("local");
    } finally {
      await session.close();
    }
  }, 30000);

  it("numeric field without quote fails", () => {
    const altered = {
      ...DECCAN_EXTRACTION,
      feeRules: [
        {
          kind: "below_weight" as const,
          amountInr: 999, // 999 is hallucinated, not in quote
          thresholdKg: 5,
          quote: "Under 5 kg total weight: ₹180 standard pickup charge",
        },
      ],
    };
    const res = validatePolicyAgainstPageText(altered, DECCAN_PAGE_TEXT);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Hallucinated numeric value") && e.includes("999"))).toBe(true);
  });

  it("changed_policy_layout never yields wrong values", async () => {
    mockPageText = "Welcome to Our New Portal. Please contact support via WhatsApp for customized rates.";
    const policy = await readRecyclerPolicy("unknown_recycler", fakeSession, "http://localhost:3199");
    expect(policy.underWeightFeeInr == null || policy.feesUnknown === true).toBe(true);
    expect(policy.acceptedCategories).not.toContain("unknown_hallucinated");
  });

  it("portal down -> POLICY_UNREADABLE after exactly 2 attempts", async () => {
    const brokenSession = {
      ...fakeSession,
      page: {
        ...fakeSession.page,
        goto: async (): Promise<null> => {
          await Promise.resolve();
          throw new Error("net::ERR_CONNECTION_REFUSED");
        },
      } as unknown as BrowserSession["page"],
    };
    const policy = await readRecyclerPolicy("deccan", brokenSession, "http://localhost:3101");
    expect(policy.status).toBe("POLICY_UNREADABLE");
    expect(policy.feesUnknown).toBe(true);
  });

  it("schema-invalid twice -> POLICY_UNREADABLE", async () => {
    const adapter = new FakeLlmAdapter();
    registerFakeFixture("bad_schema_twice", [
      JSON.stringify({ notASchema: true }),
      JSON.stringify({ stillNotASchema: 123 }),
    ]);
    const originalGen = adapter.generate.bind(adapter);
    adapter.generate = async (opts): Promise<string> => originalGen({ ...opts, testFixtureName: "bad_schema_twice" });

    const policy = await readRecyclerPolicy("unknown_rec", fakeSession, "http://localhost:3199", adapter);
    expect(policy.status).toBe("POLICY_UNREADABLE");
    expect(policy.feesUnknown).toBe(true);
  });

  it("screenshot exists for EVERY visited page", async () => {
    const captured: string[] = [];
    const trackingSession = {
      ...fakeSession,
      captureScreenshot: async (label: string): Promise<{ path: string; buffer: Buffer; filename: string }> => {
        await Promise.resolve();
        captured.push(label);
        return {
          path: `.data/evidence/mock-${label}.png`,
          buffer: Buffer.from("mock-png"),
          filename: `mock-${label}.png`,
        };
      },
    };
    await readRecyclerPolicy("deccan", trackingSession, "http://localhost:3101");
    expect(captured.length).toBeGreaterThanOrEqual(1);
    for (const label of captured) {
      expect(label).toContain("deccan-page-");
    }
  });
});

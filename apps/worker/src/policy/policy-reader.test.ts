/**
 * apps/worker/src/policy/policy-reader.test.ts
 *
 * Unit tests for policy reader error handling, retries, and failure states.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readRecyclerPolicy } from "./policy-reader.js";
import type { BrowserSession } from "../browser/session.js";
import { FakeLlmAdapter, clearFakeFixtures, registerFakeFixture } from "@reroute/llm";

describe("Stage 4: Worker Policy Reader Unit Tests", () => {
  let fakeSession: BrowserSession;
  let mockPageText: string;
  let mockHiddenBanner: boolean;

  beforeEach(() => {
    clearFakeFixtures();
    process.env.LLM_PROVIDER = "fake";
    mockPageText = `
      Deccan E-Cycle Solutions
      Pickup Fee & Payout Schedule:
      Under 5 kg total weight: ₹180 standard pickup charge
      5 kg or more total weight: ₹0 (FREE Pickup)
      Dead or Functional Laptop: ₹250 cash payout each
      Dead or Functional Mobile Phone: ₹60 cash payout each
    `;
    mockHiddenBanner = false;

    // Create lightweight mock session
    fakeSession = {
      sessionId: "mock-session-001",
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

  it("successfully reads and validates Deccan policy with FakeLlmAdapter", async () => {
    const policy = await readRecyclerPolicy("deccan", fakeSession, "http://localhost:3101");
    expect(policy.status).toBe("SUCCESS");
    expect(policy.recyclerId).toBe("deccan");
    expect(policy.underWeightFeeInr).toBe(180);
    expect(policy.freeThresholdKg).toBe(5);
    expect(policy.evidence.sessionId).toBe("mock-session-001");
    expect(policy.quotes.length).toBeGreaterThan(0);
  });

  it("falls back to POLICY_UNREADABLE when fee information is hidden on portal", async () => {
    mockHiddenBanner = true;
    mockPageText = "Deccan E-Cycle Solutions\nTariff revision in progress. Fee schedule unlisted.";

    const policy = await readRecyclerPolicy("deccan", fakeSession, "http://localhost:3101");
    expect(policy.status).toBe("POLICY_UNREADABLE");
    expect(policy.failureReason).toContain("Fee schedule unlisted, hidden, or undergoing revision");
  });

  it("retries on anti-hallucination error and falls back to POLICY_UNREADABLE if retry fails", async () => {
    const adapter = new FakeLlmAdapter();
    // Return a policy with a hallucinated fee of ₹999 not on page
    registerFakeFixture("hallucinated_policy", [
      JSON.stringify({
        recyclerId: "deccan",
        companyName: "Deccan E-Cycle Solutions",
        acceptedCategories: ["laptop"],
        rejectedCategories: [],
        rates: [],
        underWeightFeeInr: 999, // Hallucinated!
        quotes: ["Under 5 kg total weight: ₹180 standard pickup charge"], // 999 not in quotes
      }),
      JSON.stringify({
        recyclerId: "deccan",
        companyName: "Deccan E-Cycle Solutions",
        acceptedCategories: ["laptop"],
        rejectedCategories: [],
        rates: [],
        underWeightFeeInr: 999, // Still hallucinated on retry
        quotes: ["Under 5 kg total weight: ₹180 standard pickup charge"],
      }),
    ]);

    // Override adapter generate with test fixture
    const originalGen = adapter.generate.bind(adapter);
    adapter.generate = async (opts): Promise<string> => originalGen({ ...opts, testFixtureName: "hallucinated_policy" });

    const policy = await readRecyclerPolicy("deccan", fakeSession, "http://localhost:3101", adapter);
    expect(policy.status).toBe("POLICY_UNREADABLE");
    expect(policy.failureReason).toContain("Anti-hallucination check failed");
    expect(policy.failureReason).toContain("999");
  });

  it("recovers on retry when second extraction attempt adheres strictly to quotes", async () => {
    const adapter = new FakeLlmAdapter();
    registerFakeFixture("recovery_policy", [
      // Attempt 1: hallucinated number
      JSON.stringify({
        recyclerId: "deccan",
        companyName: "Deccan E-Cycle Solutions",
        acceptedCategories: ["laptop"],
        rejectedCategories: [],
        rates: [],
        underWeightFeeInr: 999,
        quotes: ["Under 5 kg total weight: ₹180 standard pickup charge"],
      }),
      // Attempt 2: valid grounded extraction
      JSON.stringify({
        recyclerId: "deccan",
        companyName: "Deccan E-Cycle Solutions",
        acceptedCategories: ["laptop"],
        rejectedCategories: [],
        rates: [],
        underWeightFeeInr: 180,
        freeThresholdKg: 5,
        quotes: [
          "Under 5 kg total weight: ₹180 standard pickup charge",
          "5 kg or more total weight: ₹0 (FREE Pickup)",
        ],
      }),
    ]);

    const originalGen = adapter.generate.bind(adapter);
    adapter.generate = async (opts): Promise<string> => originalGen({ ...opts, testFixtureName: "recovery_policy" });

    const policy = await readRecyclerPolicy("deccan", fakeSession, "http://localhost:3101", adapter);
    expect(policy.status).toBe("SUCCESS");
    expect(policy.underWeightFeeInr).toBe(180);
    expect(policy.freeThresholdKg).toBe(5);
  });
});


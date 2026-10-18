/**
 * tests/e2e/policies.spec.ts
 *
 * Playwright E2E Integration Suite for Stage 4: Browser Policy Discovery.
 * Verifies live browser discovery, verbatim quote grounding, and failure states
 * against local Deccan, PaperPlus, and QuickScrap portals.
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import { openSession } from "../../apps/worker/src/browser/session.js";
import { readRecyclerPolicy } from "../../apps/worker/src/policy/policy-reader.js";
import { discoverPolicyPages } from "../../apps/worker/src/policy/discovery.js";

const TEST_ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-secret-token";

test.describe("Stage 4: Browser Policy Discovery & Portal Reading", () => {
  // Ensure portals are warm
  test.beforeAll(async ({ request }) => {
    test.setTimeout(60000);
    await Promise.all(
      [3101, 3102, 3103].map(async (port) => {
        for (let attempt = 0; attempt < 40; attempt++) {
          try {
            const res = await request.get(`http://localhost:${port}/api/health`);
            if (res.ok()) return;
          } catch {
            // waiting for server
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      })
    );

    // Reset failure switches
    await Promise.all(
      [3101, 3102, 3103].map(async (port) => {
        await request.post(`http://localhost:${port}/api/reset`, {
          headers: { "x-admin-token": TEST_ADMIN_TOKEN },
        });
      })
    );

    // Warm up home and policy pages so Next.js pre-compiles them
    await Promise.all([
      request.get("http://localhost:3101/"),
      request.get("http://localhost:3101/pickup-charges"),
      request.get("http://localhost:3101/accepted-items"),
      request.get("http://localhost:3102/"),
      request.get("http://localhost:3102/what-we-take"),
      request.get("http://localhost:3103/"),
      request.get("http://localhost:3103/rates"),
    ]);
  });

  test("Deccan E-Cycle: discovers policy pages and extracts grounded policy", async () => {
    const session = await openSession({ mode: "local", recyclerId: "deccan" });
    try {
      const discovered = await discoverPolicyPages(session.page, "http://localhost:3101", 4);
      expect(discovered.length).toBeGreaterThanOrEqual(2);
      expect(discovered.some((url) => url.includes("/pickup-charges"))).toBe(true);

      const policy = await readRecyclerPolicy("deccan", session, "http://localhost:3101");
      expect(policy.status).toBe("SUCCESS");
      expect(policy.recyclerId).toBe("deccan");
      expect(policy.companyName).toBe("Deccan E-Cycle Solutions");
      expect(policy.freeThresholdKg).toBe(5);
      expect(policy.underWeightFeeInr).toBe(180);
      expect(policy.requiresDataWipeAck).toBe(true);
      expect(policy.acceptedCategories).toContain("laptop");
      expect(policy.quotes.length).toBeGreaterThan(0);

      // Verify screenshot file was written to disk
      expect(fs.existsSync(policy.evidence.screenshotRef)).toBe(true);
    } finally {
      await session.close();
    }
  });

  test("PaperPlus Kabadi: discovers policy pages and extracts grounded policy", async () => {
    const session = await openSession({ mode: "local", recyclerId: "paperplus" });
    try {
      const discovered = await discoverPolicyPages(session.page, "http://localhost:3102", 4);
      expect(discovered.some((url) => url.includes("/what-we-take"))).toBe(true);

      const policy = await readRecyclerPolicy("paperplus", session, "http://localhost:3102");
      expect(policy.status).toBe("SUCCESS");
      expect(policy.recyclerId).toBe("paperplus");
      expect(policy.minWeightKg).toBe(5);
      expect(policy.convenienceFeeInr).toBe(0);
      expect(policy.acceptedCategories).toContain("newspaper");
      expect(policy.rejectedCategories).toContain("laptop");
      expect(policy.quotes.length).toBeGreaterThan(0);
      expect(fs.existsSync(policy.evidence.screenshotRef)).toBe(true);
    } finally {
      await session.close();
    }
  });

  test("QuickScrap Hyd: discovers policy pages and extracts grounded policy with notice", async () => {
    const session = await openSession({ mode: "local", recyclerId: "quickscrap" });
    try {
      const discovered = await discoverPolicyPages(session.page, "http://localhost:3103", 4);
      expect(discovered.some((url) => url.includes("/rates"))).toBe(true);

      const policy = await readRecyclerPolicy("quickscrap", session, "http://localhost:3103");
      expect(policy.status).toBe("SUCCESS");
      expect(policy.recyclerId).toBe("quickscrap");
      expect(policy.convenienceFeeInr).toBe(199);
      expect(policy.registrationNotice).toBe("Registration: application in process");
      expect(policy.quotes.length).toBeGreaterThan(0);
      expect(fs.existsSync(policy.evidence.screenshotRef)).toBe(true);
    } finally {
      await session.close();
    }
  });

  test("Discovery link cap: never discovers more than 4 pages per site", async () => {
    const session = await openSession({ mode: "local", recyclerId: "deccan" });
    try {
      const discovered = await discoverPolicyPages(session.page, "http://localhost:3101", 4);
      expect(discovered.length).toBeLessThanOrEqual(4);
    } finally {
      await session.close();
    }
  });

  test("Failure switch hide_fee_info: causes policy reader to fail closed with POLICY_UNREADABLE", async ({
    request,
  }) => {
    // 1. Toggle hideFeeInfo failure switch on Deccan
    const toggleRes = await request.post("http://localhost:3101/api/admin", {
      headers: { "x-admin-token": TEST_ADMIN_TOKEN },
      data: {
        action: "toggle_switch",
        switchName: "hideFeeInfo",
        value: true,
      },
    });
    expect(toggleRes.ok()).toBe(true);

    const session = await openSession({ mode: "local", recyclerId: "deccan" });
    try {
      const policy = await readRecyclerPolicy("deccan", session, "http://localhost:3101");
      expect(policy.status).toBe("POLICY_UNREADABLE");
      expect(policy.failureReason).toContain("Fee schedule unlisted, hidden, or undergoing revision");
    } finally {
      await session.close();
      // Revert switch
      await request.post("http://localhost:3101/api/admin", {
        headers: { "x-admin-token": TEST_ADMIN_TOKEN },
        data: {
          action: "toggle_switch",
          switchName: "hideFeeInfo",
          value: false,
        },
      });
    }
  });
});


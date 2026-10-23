import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resolveRecyclerPolicy,
  setCachedPolicy,
  clearPolicyCache,
  getPolicyCache,
  FIXTURE_POLICIES,
  type PolicySource,
} from "./policy-cache";
import type { ExtractedPolicy } from "@recircuit/core";

describe("Policy Cache & Provenance Isolation", () => {
  const mockSource: PolicySource = {
    id: "deccan",
    name: "Deccan E-Cycle Solutions",
    url: "http://127.0.0.1:3101",
  };

  const sampleLivePolicy: ExtractedPolicy = {
    ...FIXTURE_POLICIES.deccan!,
    evidence: {
      url: "http://127.0.0.1:3101",
      textHash: "live-hash-1234",
      screenshotPath: ".data/evidence/deccan.png",
      extractedAt: "2026-10-23T07:00:00.000Z",
      sessionId: "session-live-01",
      extractionPath: "generic-ai",
    },
    quotes: ["Live quote: ₹180 standard pickup charge"],
  };

  beforeEach(() => {
    clearPolicyCache();
    vi.restoreAllMocks();
  });

  it("1. Live retrieval success: stores policy in cache with immutable retrievedAt", async () => {
    const fetchLive = vi.fn().mockResolvedValue(sampleLivePolicy);

    const result = await resolveRecyclerPolicy({
      source: mockSource,
      fetchLive,
      nowMs: 1000000,
    });

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(result.policy.status).toBe("SUCCESS");
    expect(result.meta.provenance).toBe("live");
    expect(result.meta.freshness).toBe("fresh");
    expect(result.meta.cached).toBe(false);
    expect(result.meta.retrievedAt).toBe("2026-10-23T07:00:00.000Z");

    // Cache should contain entry
    const cache = getPolicyCache();
    expect(cache.has("deccan")).toBe(true);
    expect(cache.get("deccan")?.retrievedAt).toBe("2026-10-23T07:00:00.000Z");
  });

  it("2. Cache read retains original retrievedAt without refreshing timestamp", async () => {
    const originalRetrievedAt = "2026-10-23T06:30:00.000Z";
    setCachedPolicy(
      "deccan",
      {
        sourceUrl: mockSource.url,
        retrievedAt: originalRetrievedAt,
        recyclerId: "deccan",
        policy: sampleLivePolicy,
        expiresAt: 2000000, // Expires in the future
      },
      15 * 60 * 1000,
      1000000
    );

    const fetchLive = vi.fn();
    const readNowMs = 1500000; // Half a million ms later

    const result = await resolveRecyclerPolicy({
      source: mockSource,
      fetchLive,
      nowMs: readNowMs,
    });

    // fetchLive should NOT be called on fresh cache hit
    expect(fetchLive).not.toHaveBeenCalled();
    expect(result.meta.provenance).toBe("cached");
    expect(result.meta.freshness).toBe("fresh");
    expect(result.meta.cached).toBe(true);
    expect(result.meta.expired).toBe(false);

    // CRITICAL: retrievedAt must remain the original retrieval timestamp, NOT readNowMs!
    expect(result.meta.retrievedAt).toBe(originalRetrievedAt);
  });

  it("3. Live retrieval failure with NO cache produces genuine uncertainty, NOT silent fixtures", async () => {
    const fetchLive = vi.fn().mockRejectedValue(new Error("Connection refused to 127.0.0.1:3101"));

    const result = await resolveRecyclerPolicy({
      source: mockSource,
      fetchLive,
      nowMs: 1000000,
    });

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(result.policy.status).toBe("FAILED");
    expect(result.policy.feesUnknown).toBe(true);
    expect(result.policy.quotes).toEqual([]);
    expect(result.policy.failureReason).toContain("Connection refused");
    expect(result.meta.provenance).toBe("live");
    expect(result.meta.freshness).toBe("uncertain");
    expect(result.meta.cached).toBe(false);

    // Assert that fixture data was NOT secretly substituted
    expect(result.policy.acceptedCategories).toEqual([]);
    expect(result.policy.freeThresholdKg).toBeUndefined();
  });

  it("4. Live retrieval failure with expired cache explicitly discloses stale evidence", async () => {
    const originalRetrievedAt = "2026-10-23T05:00:00.000Z";
    setCachedPolicy(
      "deccan",
      {
        sourceUrl: mockSource.url,
        retrievedAt: originalRetrievedAt,
        recyclerId: "deccan",
        policy: sampleLivePolicy,
        expiresAt: 500000, // Already expired at nowMs = 1000000
      },
      15 * 60 * 1000,
      400000
    );

    const fetchLive = vi.fn().mockRejectedValue(new Error("503 Gateway Timeout"));

    const result = await resolveRecyclerPolicy({
      source: mockSource,
      fetchLive,
      nowMs: 1000000,
    });

    expect(fetchLive).toHaveBeenCalledTimes(1);
    // Returns cached policy but explicitly marks as stale
    expect(result.meta.provenance).toBe("stale");
    expect(result.meta.freshness).toBe("stale");
    expect(result.meta.cached).toBe(true);
    expect(result.meta.expired).toBe(true);
    expect(result.meta.retrievedAt).toBe(originalRetrievedAt);
    expect(result.meta.failureReason).toContain("Live refresh failed");
    expect(result.meta.failureReason).toContain("503 Gateway Timeout");
  });

  it("5. Fixtures are strictly isolated to fixture/example mode and never enter live cache", async () => {
    const fetchLive = vi.fn();

    const fixtureResult = await resolveRecyclerPolicy({
      source: mockSource,
      mode: "fixture",
      fetchLive,
      nowMs: 1000000,
    });

    expect(fetchLive).not.toHaveBeenCalled();
    expect(fixtureResult.meta.provenance).toBe("fixture");
    expect(fixtureResult.meta.freshness).toBe("fixture");
    expect(fixtureResult.meta.retrievedAt).toBeUndefined(); // Unavailable for fixture sources
    expect(fixtureResult.meta.cached).toBe(false);

    // Live cache MUST NOT be populated with fixture data
    const cache = getPolicyCache();
    expect(cache.has("deccan")).toBe(false);

    // A subsequent normal request without cache will attempt live retrieval, not reuse fixture
    fetchLive.mockRejectedValue(new Error("Offline"));
    const subsequent = await resolveRecyclerPolicy({
      source: mockSource,
      mode: "live",
      fetchLive,
      nowMs: 1000001,
    });

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(subsequent.policy.status).toBe("FAILED");
    expect(subsequent.meta.provenance).toBe("live");
    expect(subsequent.meta.freshness).toBe("uncertain");
  });

  it("6. Force refresh bypasses fresh cache and updates retrievedAt", async () => {
    const originalRetrievedAt = "2026-10-23T06:00:00.000Z";
    setCachedPolicy(
      "deccan",
      {
        sourceUrl: mockSource.url,
        retrievedAt: originalRetrievedAt,
        recyclerId: "deccan",
        policy: sampleLivePolicy,
        expiresAt: 2000000,
      },
      15 * 60 * 1000,
      1000000
    );

    const refreshedLivePolicy: ExtractedPolicy = {
      ...sampleLivePolicy,
      evidence: {
        ...sampleLivePolicy.evidence,
        extractedAt: "2026-10-23T07:15:00.000Z",
      },
      quotes: ["Updated fresh quote"],
    };

    const fetchLive = vi.fn().mockResolvedValue(refreshedLivePolicy);

    const result = await resolveRecyclerPolicy({
      source: mockSource,
      forceRefresh: true,
      fetchLive,
      nowMs: 1100000,
    });

    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(result.meta.provenance).toBe("live");
    expect(result.meta.retrievedAt).toBe("2026-10-23T07:15:00.000Z");
    expect(result.policy.quotes).toEqual(["Updated fresh quote"]);

    const cacheEntry = getPolicyCache().get("deccan");
    expect(cacheEntry?.retrievedAt).toBe("2026-10-23T07:15:00.000Z");
  });
});

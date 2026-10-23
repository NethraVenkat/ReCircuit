import type { ExtractedPolicy } from "@recircuit/core";
import {
  DECCAN_EXTRACTION,
  PAPERPLUS_EXTRACTION,
  QUICKSCRAP_EXTRACTION,
  ExtractedPolicySchema,
} from "@recircuit/core";

export type PolicyProvenance = "live" | "cached" | "stale" | "fixture";
export type PolicyFreshness = "fresh" | "stale" | "fixture" | "uncertain";

export interface PolicyMetadata {
  recyclerId: string;
  name: string;
  url: string;
  quotes: string[];
  status: string;
  retrievedAt?: string;
  extractionPath?: string;
  llmProvider?: string;
  llmModel?: string;
  llmAttempted?: boolean;
  provenance: PolicyProvenance;
  freshness: PolicyFreshness;
  cached: boolean;
  expired: boolean;
  expiresAt?: string;
  failureReason?: string;
}

export interface PolicyCacheEntry {
  sourceUrl: string;
  retrievedAt: string; // The exact immutable timestamp of retrieval from the live website
  recyclerId: string;
  policy: ExtractedPolicy;
  cachedAt: number; // Unix epoch ms
  expiresAt: number; // Unix epoch ms
}

export interface PolicySource {
  id: string;
  name: string;
  url: string;
}

export interface PolicyResolutionResult {
  policy: ExtractedPolicy;
  meta: PolicyMetadata;
}

export const DEFAULT_POLICY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const policyCacheStore = new Map<string, PolicyCacheEntry>();

export function getPolicyCache(): Map<string, PolicyCacheEntry> {
  return policyCacheStore;
}

export function clearPolicyCache(): void {
  policyCacheStore.clear();
}

export function setCachedPolicy(
  recyclerId: string,
  entry: {
    sourceUrl: string;
    retrievedAt: string;
    recyclerId: string;
    policy: ExtractedPolicy;
    expiresAt?: number;
  },
  ttlMs = DEFAULT_POLICY_CACHE_TTL_MS,
  nowMs = Date.now()
): PolicyCacheEntry {
  const fullEntry: PolicyCacheEntry = {
    ...entry,
    cachedAt: nowMs,
    expiresAt: entry.expiresAt ?? (nowMs + ttlMs),
  };
  policyCacheStore.set(recyclerId, fullEntry);
  return fullEntry;
}

export function expirePolicyCacheEntry(recyclerId: string): void {
  const entry = policyCacheStore.get(recyclerId);
  if (entry) {
    entry.expiresAt = Date.now() - 1000;
  }
}

export const FIXTURE_POLICIES: Record<string, ExtractedPolicy> = {
  deccan: {
    ...DECCAN_EXTRACTION,
    recyclerId: "deccan",
    companyName: "Deccan E-Cycle Solutions",
    status: "SUCCESS",
    feesUnknown: false,
    evidence: {
      url: "fixture://deccan",
      textHash: "fixture-deccan-hash",
      screenshotPath: ".data/evidence/deccan-policy.png",
      extractedAt: "2026-10-21T00:00:00.000Z",
      sessionId: "fixture-session-deccan",
      extractionPath: "generic-ai",
    },
    acceptedCategories: ["laptop", "desktop", "mobile_phone", "charger_cable", "battery_household", "small_electronics"],
    rejectedCategories: ["newspaper", "cardboard", "plastic", "glass"],
    freeThresholdKg: 5,
    underWeightFeeInr: 180,
    minWeightKg: null,
    requiresDataWipeAck: true,
    quotes: ["Under 5 kg total weight: ₹180 standard pickup charge"],
    rates: [],
  },
  paperplus: {
    ...PAPERPLUS_EXTRACTION,
    recyclerId: "paperplus",
    companyName: "PaperPlus Kabadi",
    status: "SUCCESS",
    feesUnknown: false,
    evidence: {
      url: "fixture://paperplus",
      textHash: "fixture-paperplus-hash",
      screenshotPath: ".data/evidence/paperplus-policy.png",
      extractedAt: "2026-10-21T00:00:00.000Z",
      sessionId: "fixture-session-paperplus",
      extractionPath: "generic-ai",
    },
    acceptedCategories: ["newspaper", "cardboard", "plastic", "glass", "textiles"],
    rejectedCategories: ["laptop", "desktop", "mobile_phone", "battery_household", "charger_cable"],
    freeThresholdKg: null,
    underWeightFeeInr: 0,
    minWeightKg: null,
    requiresDataWipeAck: false,
    quotes: ["Free doorstep collection for dry recyclables across Hyderabad"],
    rates: [],
  },
  quickscrap: {
    ...QUICKSCRAP_EXTRACTION,
    recyclerId: "quickscrap",
    companyName: "QuickScrap Hyd",
    status: "SUCCESS",
    feesUnknown: true,
    evidence: {
      url: "fixture://quickscrap",
      textHash: "fixture-quickscrap-hash",
      screenshotPath: ".data/evidence/quickscrap-policy.png",
      extractedAt: "2026-10-21T00:00:00.000Z",
      sessionId: "fixture-session-quickscrap",
      extractionPath: "generic-ai",
    },
    acceptedCategories: ["small_electronics", "desktop", "newspaper", "cardboard"],
    rejectedCategories: ["battery_household"],
    freeThresholdKg: null,
    underWeightFeeInr: 0,
    minWeightKg: 10,
    requiresDataWipeAck: false,
    quotes: ["10 kg minimum consignment weight strictly enforced"],
    rates: [],
  },
};

export async function resolveRecyclerPolicy(options: {
  source: PolicySource;
  mode?: "live" | "fixture" | "example";
  policyMode?: "live" | "fixture";
  forceRefresh?: boolean;
  ttlMs?: number;
  nowMs?: number;
  fetchLive: (source: PolicySource) => Promise<ExtractedPolicy>;
}): Promise<PolicyResolutionResult> {
  const {
    source,
    mode,
    policyMode,
    forceRefresh = false,
    ttlMs = DEFAULT_POLICY_CACHE_TTL_MS,
    nowMs = Date.now(),
    fetchLive,
  } = options;

  const isFixtureMode =
    mode === "fixture" ||
    mode === "example" ||
    policyMode === "fixture" ||
    process.env.RECIRCUIT_POLICY_MODE === "fixture";

  // 1. ISOLATED FIXTURE MODE
  // Confined exclusively to explicit example/test mode. Never stored in live cache.
  if (isFixtureMode) {
    const fixture = FIXTURE_POLICIES[source.id];
    if (fixture) {
      return {
        policy: fixture,
        meta: {
          recyclerId: source.id,
          name: source.name,
          url: fixture.evidence.url,
          quotes: fixture.quotes,
          status: fixture.status,
          retrievedAt: undefined, // Unavailable for fixture sources
          extractionPath: "fixture",
          provenance: "fixture",
          freshness: "fixture",
          cached: false,
          expired: false,
        },
      };
    }
  }

  // 2. NORMAL WORKFLOW: Live retrieval & explicit cache
  const cachedEntry = policyCacheStore.get(source.id);
  const hasCached = Boolean(cachedEntry);
  const isFresh = hasCached && cachedEntry!.policy.status === "SUCCESS" && nowMs < cachedEntry!.expiresAt;

  // A. Serve from cache if fresh and no forceRefresh
  if (hasCached && isFresh && !forceRefresh) {
    const entry = cachedEntry!;
    return {
      policy: entry.policy,
      meta: {
        recyclerId: source.id,
        name: source.name,
        url: entry.sourceUrl,
        quotes: entry.policy.quotes,
        status: entry.policy.status,
        retrievedAt: entry.retrievedAt, // Retain original timestamp without refreshing!
        extractionPath: entry.policy.evidence.extractionPath,
        llmProvider: entry.policy.evidence.llmProvider,
        llmModel: entry.policy.evidence.llmModel,
        llmAttempted: entry.policy.evidence.llmAttempted,
        provenance: "cached",
        freshness: "fresh",
        cached: true,
        expired: false,
        expiresAt: new Date(entry.expiresAt).toISOString(),
      },
    };
  }

  // B. Attempt live retrieval
  try {
    const livePolicy = await fetchLive(source);
    if (livePolicy.status === "SUCCESS") {
      const retrievedAt = livePolicy.evidence.extractedAt || new Date(nowMs).toISOString();
      const expiresAt = nowMs + ttlMs;
      setCachedPolicy(
        source.id,
        {
          sourceUrl: source.url,
          retrievedAt,
          recyclerId: source.id,
          policy: livePolicy,
          expiresAt,
        },
        ttlMs,
        nowMs
      );

      return {
        policy: livePolicy,
        meta: {
          recyclerId: source.id,
          name: source.name,
          url: source.url,
          quotes: livePolicy.quotes,
          status: livePolicy.status,
          retrievedAt,
          extractionPath: livePolicy.evidence.extractionPath,
          llmProvider: livePolicy.evidence.llmProvider,
          llmModel: livePolicy.evidence.llmModel,
          llmAttempted: livePolicy.evidence.llmAttempted,
          provenance: "live",
          freshness: "fresh",
          cached: false,
          expired: false,
          expiresAt: new Date(expiresAt).toISOString(),
        },
      };
    }

    return {
      policy: livePolicy,
      meta: {
        recyclerId: source.id,
        name: source.name,
        url: source.url,
        quotes: livePolicy.quotes,
        status: livePolicy.status,
        retrievedAt: livePolicy.evidence.extractedAt,
        extractionPath: livePolicy.evidence.extractionPath,
        llmProvider: livePolicy.evidence.llmProvider,
        llmModel: livePolicy.evidence.llmModel,
        llmAttempted: livePolicy.evidence.llmAttempted,
        provenance: "live",
        freshness: "uncertain",
        cached: false,
        expired: false,
        failureReason: livePolicy.failureReason,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // C. Live failed: Handle expired cache explicitly if available
    if (hasCached && cachedEntry!.policy.status === "SUCCESS") {
      const entry = cachedEntry!;
      return {
        policy: entry.policy,
        meta: {
          recyclerId: source.id,
          name: source.name,
          url: entry.sourceUrl,
          quotes: entry.policy.quotes,
          status: entry.policy.status,
          retrievedAt: entry.retrievedAt, // Retain original timestamp!
          extractionPath: entry.policy.evidence.extractionPath,
          llmProvider: entry.policy.evidence.llmProvider,
          llmModel: entry.policy.evidence.llmModel,
          llmAttempted: entry.policy.evidence.llmAttempted,
          provenance: "stale",
          freshness: "stale",
          cached: true,
          expired: true,
          expiresAt: new Date(entry.expiresAt).toISOString(),
          failureReason: `Live refresh failed: ${errorMsg}; disclosing stale cached evidence`,
        },
      };
    }

    // D. Live failed with NO cache: NEVER silently substitute fixtures!
    // Unavailable evidence must produce uncertainty, not invented confirmation.
    const failedPolicy = ExtractedPolicySchema.parse({
      recyclerId: source.id,
      companyName: source.name,
      status: "FAILED",
      feesUnknown: true,
      failureReason: `Policy source unavailable: ${errorMsg}`,
      evidence: {
        url: source.url,
        textHash: "",
        screenshotPath: "",
        extractedAt: new Date(nowMs).toISOString(),
        sessionId: "failed-retrieval",
        extractionPath: "generic-ai",
      },
      acceptedItems: [],
      rejectedItems: [],
      feeRules: [],
      payoutRules: [],
      minimumTotalKg: { value: null, quote: null },
      serviceablePincodes: { values: [], quote: null },
      registrationNotice: { text: null, quote: null },
    });

    return {
      policy: failedPolicy,
      meta: {
        recyclerId: source.id,
        name: source.name,
        url: source.url,
        quotes: [],
        status: "FAILED",
        retrievedAt: new Date(nowMs).toISOString(),
        extractionPath: "generic-ai",
        provenance: "live",
        freshness: "uncertain",
        cached: false,
        expired: false,
        failureReason: `Policy source unavailable: ${errorMsg}`,
      },
    };
  }
}

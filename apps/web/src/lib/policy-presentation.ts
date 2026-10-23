/** Presentation derives only from saved evidence; current configuration never rewrites history. */
export interface PolicyView {
  recyclerId?: string; name: string; url: string; quotes: string[]; status: string;
  retrievedAt?: string; extractionPath?: string; provenance?: string; freshness?: string;
  cached?: boolean; expired?: boolean; expiresAt?: string; failureReason?: string;
  llmProvider?: string; llmModel?: string; llmAttempted?: boolean;
}
export function policyPresentation(policy: PolicyView): { method: string; source: string; freshness: string; tone: string } {
  const fixture = policy.provenance === "fixture" || policy.freshness === "fixture";
  const stale = policy.expired || policy.provenance === "stale" || policy.freshness === "stale";
  const success = policy.status === "SUCCESS";
  return {
    method: fixture ? (success ? "Fixture policy — no live extraction" : "Fixture extraction failure") : !success ? "Extraction failed" : policy.extractionPath === "dom-fallback" ? "DOM fallback" : policy.extractionPath === "generic-ai" ? "AI extraction succeeded" : "Extraction method not recorded",
    source: fixture ? "Repository fixture" : policy.cached || policy.provenance === "cached" || stale ? "Cached evidence" : policy.provenance === "live" ? "Live retrieval" : "Source not recorded",
    freshness: fixture ? "Fixture — not live evidence" : stale ? "Expired — historical evidence only" : policy.freshness === "fresh" ? "Fresh at retrieval / cache check" : "Uncertain",
    tone: !success || stale ? "warning" : fixture ? "neutral" : "success",
  };
}
/** Enrich old projections from the original stored extraction, without modifying persisted records. */
export function storedPolicyMetadata(household: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!household || !Array.isArray(household.policies)) return household;
  const sources = Array.isArray(household.policySources) ? household.policySources : [];
  return { ...household, policies: household.policies.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") return entry;
    const meta = entry as Record<string, unknown>;
    const source = sources.find((value: unknown) => value && typeof value === "object" && (value as Record<string, unknown>).recyclerId === meta.recyclerId) as Record<string, unknown> | undefined;
    const evidence = source?.evidence && typeof source.evidence === "object" ? source.evidence as Record<string, unknown> : {};
    return { ...meta, ...Object.fromEntries(["llmProvider", "llmModel", "llmAttempted"].filter(key => evidence[key] !== undefined).map(key => [key, evidence[key]])) };
  }) };
}

import { describe, expect, it } from "vitest";
import { policyPresentation, storedPolicyMetadata, type PolicyView } from "./policy-presentation";
import { safeDiagnostic } from "./error-display";
const policy: PolicyView = { recyclerId: "deccan", name: "Recycler", url: "https://example.test", quotes: [], status: "SUCCESS", extractionPath: "generic-ai", provenance: "live", freshness: "fresh" };
describe("truthful source presentation", () => {
  it("does not turn an attempted generic-AI path into extraction success", () => {
    expect(policyPresentation({ ...policy, status: "POLICY_UNREADABLE", failureReason: "Historical Gemini HTTP 503" }).method).toBe("Extraction failed");
    expect(policyPresentation({ ...policy, extractionPath: "dom-fallback" }).method).toBe("DOM fallback");
  });
  it("discloses fixture and stale evidence even with SUCCESS stored", () => {
    expect(policyPresentation({ ...policy, expired: true }).freshness).toContain("Expired");
    expect(policyPresentation({ ...policy, provenance: "fixture" }).source).toBe("Repository fixture");
  });
  it("projects original Gemini model from stored evidence without mutating or guessing Groq", () => {
    const household = { policies: [{ ...policy, llmProvider: "groq" }], policySources: [{ recyclerId: "deccan", evidence: { llmProvider: "gemini", llmModel: "historical-model" } }] };
    const original = JSON.stringify(household);
    const projected = storedPolicyMetadata(household)!;
    expect((projected.policies as PolicyView[])[0]).toMatchObject({ llmProvider: "gemini", llmModel: "historical-model" });
    expect(JSON.stringify(household)).toBe(original);
    expect((storedPolicyMetadata({ policies: [policy] })!.policies as PolicyView[])[0]!.llmProvider).toBeUndefined();
  });
  it("keeps historical provider errors while redacting authenticated diagnostics", () => {
    const text = safeDiagnostic("Gemini HTTP 503 https://example.test/evidence?token=private-value&sig=secret-value Bearer private-credential");
    expect(text).toContain("Gemini HTTP 503"); expect(text).not.toContain("private-value"); expect(text).not.toContain("secret-value"); expect(text).not.toContain("private-credential");
  });
});

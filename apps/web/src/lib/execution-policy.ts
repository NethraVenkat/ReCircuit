import type { Plan } from "@recircuit/core";
import type { PolicyMetadata } from "./policy-cache";

/** Execution uses the evidence reviewed with this plan, never an unrelated cache entry. */
export function assertExecutionEvidence(plan: Plan, household?: Record<string, unknown>): void {
  // Example plans remain reviewable but the booking handler prohibits submission.
  if (household?.policyMode === "fixture") return;
  const policies = Array.isArray(household?.policies) ? household.policies as PolicyMetadata[] : [];
  for (const leg of plan.legs) {
    const evidence = policies.find(p => p.recyclerId === leg.recyclerId);
    if (!evidence || !["live", "cached"].includes(evidence.provenance) ||
        evidence.status !== "SUCCESS" || evidence.freshness !== "fresh" || evidence.expired ||
        !evidence.expiresAt || !Number.isFinite(Date.parse(evidence.expiresAt)) ||
        Date.parse(evidence.expiresAt) <= Date.now() || !Number.isFinite(leg.estimatedFee)) {
      throw new Error("STALE: Policy evidence is expired or uncertain. Refresh policies and review the resulting plan before execution.");
    }
  }
}

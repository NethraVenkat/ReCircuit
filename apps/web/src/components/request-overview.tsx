import type { Plan, Request as PickupRequest } from "@recircuit/core";
import type { PolicyView } from "../lib/policy-presentation";
import { policyPresentation } from "../lib/policy-presentation";
import { money, time } from "./ui";

export function RequestOverview({ request, plan }: { request: PickupRequest; plan: Plan | null }) {
  const units = request.items.reduce((sum, item) => sum + item.quantity, 0);
  return <dl className="rc-overview-grid" aria-label="Saved request overview">
    <div className="rc-metric"><dt>Items in this request</dt><dd>{units}<small>{request.items.length} item group{request.items.length === 1 ? "" : "s"}</small></dd></div>
    <div className="rc-metric"><dt>Selected recyclers</dt><dd>{plan?.legs.length ?? 0}<small>{plan?.legs.length ? "In the saved allocation" : "No eligible allocation saved"}</small></dd></div>
    <div className="rc-metric"><dt>Estimated pickup fee</dt><dd>{money(plan?.legs.length ? plan.totalEstimatedFee : null)}<small>{request.feeCapInr == null ? "No maximum fee specified" : `Your maximum: ${money(request.feeCapInr)}`}</small></dd></div>
    <div className="rc-metric"><dt>Booking references</dt><dd>{plan?.legs.filter(leg => Boolean(leg.bookingReference)).length ?? 0}<small>A reference is not collection evidence</small></dd></div>
  </dl>;
}

export function PolicyPreview({ policies, open }: { policies: PolicyView[]; open: () => void }) {
  return <section className="rc-evidence-preview" aria-labelledby="decision-evidence-heading"><h3 id="decision-evidence-heading">Evidence for this decision</h3>
    <p className="rc-secondary">Saved source results, separate from the current provider configuration.</p>
    {policies.length ? <ul>{policies.map((policy, index) => {
      const presentation = policyPresentation(policy);
      return <li key={`${policy.recyclerId}-${index}`}><strong>{policy.name}</strong><span className={`rc-badge rc-badge--${presentation.tone}`}>{presentation.method}</span><small>{presentation.freshness}</small><small>Retrieved {time(policy.retrievedAt)}</small></li>;
    })}</ul> : <p className="rc-notice rc-warning">No saved policy evidence is available. Acceptance is not established.</p>}
    <button onClick={open}>Inspect quotes &amp; diagnostics</button>
  </section>;
}

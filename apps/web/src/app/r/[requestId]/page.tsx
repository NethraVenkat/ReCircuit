"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { RequestOverview, PolicyPreview } from "../../../components/request-overview";
import { HumanVerification } from "../../../components/human-verification";
import { ErrorNotice, ProgressNotice } from "../../../components/feedback";
import { PolicyEvidence, RuntimeProvider } from "../../../components/policy-evidence";
import { recyclerLegDisplayStatus } from "../../../lib/leg-display-status";
import type { DetailView } from "../../../lib/view-types";
import { api, Drawer, Journey, Status, money, time } from "../../../components/ui";

export default function RequestPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [data, setData] = useState<DetailView | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const [evidence, setEvidence] = useState(false); const [review, setReview] = useState(false);
  const [ack, setAck] = useState(false); const [wipe, setWipe] = useState(false); const [checked, setChecked] = useState("");
  const load = useCallback(async () => {
    try { const next: DetailView = await api(`/api/requests/${requestId}`); setData(next); setChecked(new Date().toISOString()); }
    catch (e) { setError((e as Error).message); }
  }, [requestId]);
  useEffect(() => { setAck(false); setWipe(false); }, [data?.plan?.planHash]);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 8000); return () => clearInterval(timer); }, [load]);
  async function action(kind: string, body: object) {
    setBusy(kind); setError("");
    try { await api(`/api/${kind}`, body); await load(); }
    catch (e) { await load(); setError((e as Error).message); }
    finally { setBusy(""); }
  }
  if (!data) return <section className="rc-panel rc-state-panel"><h1>{error ? "Pickup unavailable" : "Loading your pickup…"}</h1>
    {error ? <><ErrorNotice message={error}/><div className="rc-actions"><button onClick={() => { setError(""); void load(); }}>Try again</button><Link className="rc-button" href="/">My pickups</Link></div></> : <ProgressNotice title="Reading your saved request">Loading does not submit a booking.</ProgressNotice>}</section>;
  const h = data.household, plan = data.plan;
  const awaiting = data.request.state === "AWAITING_APPROVAL";
  const started = Boolean(plan?.legs.some(l => !["APPROVED", "REJECTED"].includes(l.state)));
  const declined = data.request.state === "REJECTED";
  const current = started ? 3 : awaiting && !review ? 1 : 2;
  const needsWipe = h?.intakeResult?.items.some(i => ["laptop", "desktop", "mobile_phone"].includes(i.category));
  const canEdit = !started && !declined;
  const canBook = data.request.state === "APPROVED" && plan?.legs.some(l => l.state === "APPROVED");
  const failedSources = h?.policies?.filter(p => p.status !== "SUCCESS" || p.expired).length || 0;
  return <div data-testid="request-dashboard">
    <div className="rc-titlebar"><div><p className="rc-eyebrow">Your recycling pickup</p><h1>{started ? "Follow your pickup" : declined ? "Pickup plan declined" : awaiting ? "Let’s find the right way forward" : "Your plan is approved"}</h1><p className="rc-secondary">{h?.customer.locality} {h?.customer.pincode && `· ${h.customer.pincode}`}</p></div><Status value={started ? plan!.legs.find(l => l.state !== "APPROVED")!.state : data.request.state}/></div>
    <RequestOverview request={data.request} plan={plan}/>
    <Journey current={current}/>
    <div className="rc-toolbar"><div className="rc-actions">
      {canEdit && <Link className="rc-button" href={`/arrange?edit=${requestId}`}>Edit items &amp; preferences</Link>}
      <button onClick={() => setEvidence(true)}>Sources &amp; evidence</button><button disabled={!!busy} onClick={() => { setError(""); void load(); }}>Refresh status</button>
    </div><small>Last checked {time(checked)}</small></div>
    {error && <ErrorNotice message={error}/>}
    {busy && <ProgressNotice title={busy === "book" ? "Submitting your approved request…" : busy === "verify" ? "Checking the recycler record independently…" : "Saving your decision…"}>Your saved request remains available. Refreshing this page does not submit another booking.</ProgressNotice>}
    {declined && !started && <div className="rc-notice"><strong>This plan was declined.</strong><p>No booking can be started from this rejected request.</p><Link href="/arrange">Arrange another pickup</Link></div>}
    <div className="rc-split"><div className="rc-main-stack">
      {canBook && <section className="rc-panel rc-next-step"><div><p className="rc-eyebrow">Next step</p><h2>Ready to request your pickup</h2><p>Your plan is approved. Booking is a separate action on the simulated recycler websites.</p></div><button className="rc-primary" disabled={!!busy} onClick={() => action("book", { requestId, planHash: plan?.planHash })}>{busy === "book" ? "Submitting booking…" : "Start booking"}</button></section>}
      {awaiting && !review && plan?.legs.length ? <section className="rc-panel rc-decision-hero"><div><p className="rc-eyebrow">Recommended allocation · review required</p><h2>{plan.legs.map(leg => leg.recyclerName).join(" + ")}</h2><p>{money(plan.totalEstimatedFee)} estimated pickup fee. Check item acceptance, source limitations and your fee cap before deciding.</p></div><button className="rc-primary" onClick={() => { setReview(true); requestAnimationFrame(() => document.getElementById("review-heading")?.focus()); }}>Review recommended plan</button></section> : null}
      {awaiting && !review && <section className="rc-panel"><div className="rc-section-heading"><h2>Compare recyclers</h2><p className="rc-secondary">{h?.policyMode === "live" ? "Policies retrieved from recycler websites. Check each source’s result and freshness." : "Repository policy fixtures — this is not a live policy lookup."}</p></div>
        {failedSources > 0 && <div className="rc-notice rc-warning"><strong>{failedSources} source{failedSources === 1 ? " needs" : "s need"} review.</strong><p>Failed or expired extraction is not verified acceptance. Inspect the saved evidence before deciding.</p></div>}
        {!plan?.legs.length && <div className="rc-notice rc-warning"><h3>No eligible pickup yet</h3><p>No current allocation can be booked. Review source limitations or edit your items, weight or location.</p></div>}
        <div className="rc-comparison-grid">{h?.matrix ? Array.from(new Set(h.matrix.cells.map(c => c.recyclerId))).map(id => {
          const cells = h.matrix.cells.filter(c => c.recyclerId === id), leg = plan?.legs.find(l => l.recyclerId === id);
          return <section className="rc-comparison-card" key={id}><h3>{cells[0]?.recyclerName}</h3><div className="rc-card-recommendation">{leg && <span className="rc-badge rc-badge--success">In recommended plan</span>}</div>
            <div className="rc-comparison-items">{cells.map(c => <div key={c.itemId}><p><strong>{c.itemDescription}</strong></p><Status value={c.status} kind="eligibility"/><p className="rc-secondary">{c.reason || c.quote || "No supporting policy statement found."}</p></div>)}</div>
            <div className="rc-comparison-fee"><span className="rc-secondary">Allocated pickup fee</span><strong>{leg ? money(leg.estimatedFee) : "No selected pickup"}</strong></div>
          </section>;
        }) : <p>No comparison evidence was saved for this request.</p>}</div>
        {(h?.choices?.length ?? 0) > 1 && <details className="rc-allocation-options"><summary>Compare available allocations ({h?.choices?.length})</summary>{h?.choices?.map((choice, index) => <div className="rc-row" key={choice.plan.id}><div><strong>{index === 0 ? "Recommended allocation" : "Alternative allocation"}</strong><p className="rc-secondary">{choice.plan.legs.map(l => l.recyclerName).join(" + ")} · {money(choice.totalFee)} pickup fee · {choice.unroutedItemIds.length} unrouted item groups</p></div><button disabled={!!busy || choice.plan.id === plan?.id} onClick={() => { setAck(false); setWipe(false); void action("choose-plan", { requestId, planHash: plan?.planHash, planId: choice.plan.id }); }}>{choice.plan.id === plan?.id ? "Selected" : "Choose allocation"}</button></div>)}</details>}
        <details className="rc-allocation-options"><summary>How this allocation was chosen</summary><p>The router prioritizes item coverage, registration warnings, your fee cap, pickup cost, conditional payout and fewer trips, in that order.</p></details>
        {(h?.approvalCard?.unroutedItems?.length ?? 0) > 0 && <div className="rc-notice rc-warning"><h3>Items without a pickup</h3>{h?.approvalCard.unroutedItems.map((i, n) => <p key={n}><strong>{i.description}</strong>: {i.reasons}</p>)}</div>}
        <div className="rc-actions rc-panel-actions"><button className="rc-primary" disabled={!plan?.legs.length} onClick={() => { setReview(true); requestAnimationFrame(() => document.getElementById("review-heading")?.focus()); }}>Review allocation &amp; decide</button><button onClick={() => setEvidence(true)}>Inspect sources</button></div>
      </section>}
      {(review || started || !awaiting) && <section className="rc-panel"><h2 id="review-heading" tabIndex={-1}>{started ? "Pickup details" : "Review your pickup"}</h2>
        {!plan?.legs.length && <p>No complete pickup plan is available. Edit your items to try again.</p>}
        {plan?.legs.map((leg, index) => <article className="rc-item" data-testid={`leg-card-${index}`} key={leg.id}>
          <div className="rc-item-head"><div><p className="rc-secondary">Pickup {index + 1}</p><h3>{leg.recyclerName}</h3></div><Status value={h?.bookingStatus || recyclerLegDisplayStatus(data.request.state, leg.state)}/></div>
          <ul className="rc-list">{leg.itemIds.map(id => { const i = h?.intakeResult?.items.find(it => it.id === id), fallback = leg.items?.find(it => it.id === id); return <li key={id}>{i?.rawText || fallback?.description || id} · {i?.quantity ?? fallback?.quantity ?? "Unknown"} units · {i?.declaredWeightKg ?? i?.estimatedWeightKg ?? fallback?.estimatedWeightKg ?? "Unknown"} kg total</li>; })}</ul>
          <div className="rc-fields rc-detail-facts"><dl><dt>Pickup fee</dt><dd className="rc-price">{money(leg.estimatedFee)}</dd><dt>Conditional estimated payout</dt><dd>{money(leg.estimatedPayout)} · subject to recycler assessment</dd></dl><dl><dt>Booking reference</dt><dd data-testid="booking-reference-badge" className="rc-reference">{leg.bookingReference || "Not submitted"}</dd><dt>Requested slot</dt><dd>{plan.slotPreference?.day || "Not specified"} · {plan.slotPreference?.window || "any"}</dd><dt>Assigned slot</dt><dd>{leg.slot || "Not assigned"}</dd></dl></div>
          {leg.state === "SUBMITTING" && <div className="rc-notice rc-warning">Submission is in progress or its outcome is uncertain. Refresh to check. Automatic resubmission is blocked.</div>}
          {leg.state === "NEEDS_HUMAN" && <div className="rc-notice rc-warning"><h3>Human verification needed</h3>{h?.humanHandoffs?.[leg.id] ? <HumanVerification requestId={requestId} legId={leg.id} planHash={plan.planHash} handoff={h.humanHandoffs[leg.id]!} busy={!!busy} onSubmit={body => action("book", body)}/> : <p>{h?.handoff || "No resumable cloud session is available. No completion is claimed."}</p>}</div>}
          {leg.state === "FAILED" && <p className="rc-notice rc-warning">Booking failed or needs reconciliation. Review the recycler record before trying another booking.</p>}
          {leg.bookingReference && <section className="rc-verification"><h3>Independent verification</h3>{h?.verifications?.[leg.id] ? (() => { const v = h.verifications[leg.id]; return <><p className="rc-notice">{v.verified && v.independent && !v.isUncertain ? "The independent check matched the exposed booking fields." : "The booking has not been fully verified. Missing or mismatched fields need review."}</p><dl className="rc-source-facts"><div><dt>Recycler status</dt><dd><Status value={v.observedStatus}/></dd></div><div><dt>Last independent check</dt><dd>{time(v.checkedAt)}</dd></div><div><dt>Observed fee</dt><dd>{v.observedFeeText || "Not exposed"}</dd></div></dl><p className="rc-secondary">{v.observedStatus === "RECEIVED" ? "The recycler received the booking. Your items have not been reported as collected." : "Booking verification and physical collection are separate events."}</p><ul className="rc-list">{(v.observedItems || []).map((item, n) => <li key={n}>{item.name} · {item.quantity ?? "Quantity missing"} · {item.weightKg ?? "Weight missing"} kg</li>)}</ul>{v.error && <ErrorNotice message={v.error}/>}</>; })() : <p className="rc-secondary">No independent result is saved yet. A reference alone does not verify the full booking.</p>}{["REQUEST_SUBMITTED", "REQUEST_CONFIRMED"].includes(leg.state) && <button data-testid="run-independent-verification-button" disabled={!!busy} onClick={() => action("verify", { requestId, legId: leg.id })}>{busy === "verify" ? "Checking independently…" : "Check recycler record"}</button>}</section>}
        </article>)}
        {h?.customer && <details className="rc-contact"><summary>Pickup address &amp; contact</summary><p>{h.customer.fullName}<br/>{h.customer.addressLine}<br/>{h.customer.locality} · {h.customer.pincode}</p></details>}
        {awaiting && <div className="rc-actions"><button onClick={() => setReview(false)}>Back to comparison</button></div>}
      </section>}
      {review && awaiting && <section id="approval" className="rc-panel rc-approval"><h2>Your approval</h2>{h?.approvalCard?.warnings?.map(w => <p className="rc-notice rc-warning" key={w}>{w}</p>)}<p>Approve the destinations, item quantities, total row weights and fees shown above. Booking is a separate action after approval.</p><p className="rc-notice">This environment uses simulated recycler websites. Approving this request does not arrange a real-world collection.</p><label className="rc-check"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}/>I have reviewed the allocation, pickup fees and items that cannot be routed.</label><label className="rc-check"><input type="checkbox" checked={wipe} onChange={e => setWipe(e.target.checked)}/>I confirm any required data wipe for data-bearing electronics.</label><p className="rc-secondary">{!ack ? "Review the allocation and acknowledge it to enable approval." : needsWipe && !wipe ? "Data-bearing electronics also require your data-wipe confirmation." : "Your acknowledgements are ready. Approval does not submit the booking."}</p><div className="rc-actions rc-panel-actions"><button data-testid="approve-plan-button" className="rc-primary" disabled={!ack || (needsWipe && !wipe) || !!busy || !plan?.legs.length} onClick={() => action("approve", { requestId, planHash: plan?.planHash, decision: "approved", dataWipeConfirmed: wipe })}>{busy === "approve" ? "Saving approval…" : "Approve this plan"}</button><button className="rc-danger" disabled={!!busy} onClick={() => action("approve", { requestId, planHash: plan?.planHash, decision: "rejected" })}>Decline plan</button></div></section>}
      {h?.bookingError && <ErrorNotice title="Booking needs review. Check its saved status before trying again." message={h.bookingError}/>}
      {h?.verificationError && <ErrorNotice title="The independent check could not be completed." message={h.verificationError}/>}
      {started && <details className="rc-panel"><summary>Recorded activity ({data.auditEvents.length})</summary>{data.auditEvents.length ? <ol className="rc-list">{data.auditEvents.map((e, n) => <li key={`${e.id}-${n}`}><Status value={e.newState}/><p className="rc-secondary">{time(e.observedAt)}</p></li>)}</ol> : <p className="rc-secondary">No timestamped execution events have been saved. Refresh reads the existing request; it does not submit another booking.</p>}</details>}
    </div><aside className="rc-panel rc-summary">
      <PolicyPreview policies={h?.policies || []} open={() => setEvidence(true)}/>
      {review && awaiting && <a className="rc-button rc-primary" href="#approval">Go to approval</a>}
      <details className="rc-payout-details"><summary>Conditional payout estimate</summary><p className="rc-total">{money(plan?.legs.length ? plan.totalEstimatedPayout : null)}</p><p className="rc-secondary">Payout is separate from the pickup fee and depends on the recycler’s assessment.</p></details>
      <hr/><p className="rc-secondary">A booking request is not evidence of collection.</p><Link href="/">Back to my pickups</Link>
    </aside></div>
    {evidence && <Drawer title="Sources & evidence" close={() => setEvidence(false)}><p className="rc-notice">{h?.policyMode === "live" ? "Saved policy evidence. Retrieval and extraction results are shown per source." : "Policy fixtures supplied by the repository; no live retrieval is claimed."}</p><RuntimeProvider/>{h?.policies?.length ? h.policies.map((p, n) => <PolicyEvidence key={n} policy={p}/>) : <p>No source evidence saved.</p>}{h?.provenance && <details><summary>Record provenance</summary><pre>{JSON.stringify(h.provenance, null, 2)}</pre></details>}<h3>Verification evidence</h3><p className="rc-secondary">Independent field observations appear alongside each booked pickup. Unavailable fields are never inferred matches.</p><details className="rc-diagnostics"><summary>Technical details</summary><dl><dt>Request ID</dt><dd>{requestId}</dd><dt>Plan hash</dt><dd>{plan?.planHash || "Not available"}</dd><dt>Saved state</dt><dd>{data.request.state}</dd><dt>Last saved</dt><dd>{time(data.updatedAt)}</dd></dl></details></Drawer>}
  </div>;
}

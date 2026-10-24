"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { RoutingGeocodeReview } from "../../../components/RoutingGeocodeReview";
import { RoutingMap } from "../../../components/RoutingMap";
import { RoutingFleetEditor } from "../../../components/RoutingFleetEditor";
import { RoutingStopList } from "../../../components/RoutingStopList";
import type { SavedProposal, WorkspaceSettings } from "../../../lib/geospatial/service";
import type { Conversion } from "../../../lib/geospatial/contracts";
import { displayDuration, displayNumber, displayTimestamp } from "../../../lib/geospatial/presentation";
import "./workspace.css";

function reasonLabel(code: string): string {
  const labels: Record<string, string> = {
    INDEPENDENT_VERIFICATION_REQUIRED: "Independent booking verification is missing or stale. Use the existing verification workflow first.",
    COORDINATE_REVIEW_REQUIRED: "Address coordinates need operator review.",
    COORDINATE_EVIDENCE_EXPIRED: "Coordinate evidence has expired. Find fresh candidates and explicitly review again.",
    SERVICE_DURATION_UNKNOWN: "Enter an explicit service-duration assumption.",
    LOAD_OR_MATERIAL_UNKNOWN: "Total-row weight, quantity or material category is missing; routing cannot infer it.",
    LIFECYCLE_EXCLUDED: "Booking status is not eligible for pickup planning.",
    TENANT_MISMATCH: "Booking belongs to another recycler and cannot be routed here.",
    CONFIRMED_WINDOW_NOT_INTERPRETED: "A dispatcher window exists but its time cannot be interpreted safely.",
    INVALID_PREPARATION: "Preparation data is incomplete or invalid.",
  };
  return labels[code] || code.replaceAll("_", " ").toLowerCase();
}
function errorSummary(code: string): string {
  if (code.includes("UNAUTHORIZED")) return "The operator token was not accepted. Check it and read the bookings again.";
  if (code.includes("GEOCODE_REVIEW_STALE") || code.includes("PUBLIC_TEST_COORDINATES")) return "Public-location evidence needs review. Check the registered depot, refresh expired candidates and explicitly review the selection.";
  if (code.includes("NO_ELIGIBLE")) return "No pickups are ready for planning. Resolve the preparation items before calculating.";
  if (code.includes("NETWORK") || code.includes("RATE_LIMIT")) return "The provider could not complete the request. Review access and quota before retrying.";
  return "The planning step could not complete. Review the inputs and service details before retrying.";
}
interface Preview {
  sourceFingerprint: string; conversions: Conversion[]; settings: WorkspaceSettings;
  addresses: Array<{ id: string; reference: string; address: string }>;
  history: Array<{ id: string; version: number; createdAt: string }>;
  map: { enabled: boolean; key?: string; reason?: string };
}
type PresentedProposal = SavedProposal & { current: boolean };
function RouteMark() { return <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M25 11a10 10 0 0 0-17-3L4 12m0-7v7h7M7 21a10 10 0 0 0 17 3l4-4m0 7v-7h-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

export default function RoutingWorkspace() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [section, setSection] = useState("route-overview");
  useEffect(() => {
    const update = () => setSection(window.location.hash.slice(1) || "route-overview");
    update(); window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const [token, setToken] = useState(""), [date, setDate] = useState("2026-10-24");
  const [preview, setPreview] = useState<Preview | null>(null), [proposal, setProposal] = useState<PresentedProposal | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [fleet, setFleet] = useState("[]");
  async function call(url: string, body?: unknown) {
    const response = await fetch(url, { method: body ? "POST" : "GET", headers: { "x-admin-token": token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw Error(data.error || "Routing service unavailable"); return data;
  }
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function load(selectedId?: string) {
    const data: Preview = await call("/api/routing?date=" + date); setPreview(data); setFleet(JSON.stringify(data.settings.vehicles, null, 2));
    const id = selectedId ?? [...data.history].sort((a, b) => b.version - a.version)[0]?.id;
    setProposal(id ? await call("/api/routing?id=" + id) : null);
  }
  const eligible = preview?.conversions.filter(c => c.eligible).length ?? 0;
  const excluded = (preview?.conversions.length ?? 0) - eligible;
  const canGenerate = !!preview?.settings.vehicles.length && eligible > 0 && !busy;
  const stage = proposal?.current ? 2 : preview ? 1 : 0;
  const planningSeconds = proposal?.optimization.solution.routes.reduce((total, route) => total + route.totalSeconds, 0) ?? 0;

  return <div className="routing-shell"><a className="routing-skip" href="#routing-main">Skip to routing workspace</a>
    <aside className="routing-navigation"><Link className="routing-brand" href="/admin"><span className="routing-brand-mark"><RouteMark/></span><span>ReCircuit<small>Recycler workspace</small></span></Link>
      <p className="routing-nav-label">Operations</p><nav aria-label="Routing workspace"><a href="#route-overview" aria-current={section === "route-overview" ? "page" : undefined}><span aria-hidden="true">01</span>Route overview</a><a href="#preparation" aria-current={section === "preparation" ? "page" : undefined}><span aria-hidden="true">02</span>Preparation</a><a href="#fleet" aria-current={section === "fleet" ? "page" : undefined}><span aria-hidden="true">03</span>Fleet & depots</a><a href="#history" aria-current={section === "history" ? "page" : undefined}><span aria-hidden="true">04</span>Saved proposals</a><Link href="/admin"><span aria-hidden="true">↗</span>Operator console</Link></nav>
      <div className="routing-pilot-note"><span className="routing-status-dot"/>Local pilot<p>Planning proposals only. No driver assignment or dispatch.</p></div>
    </aside>
    <main id="routing-main" className="routing-workspace"><header className="routing-page-header"><div><p className="routing-eyebrow">Operations / Pickup planning</p><h1>Pickup routing</h1><p>Prepare existing requests, review evidence and propose a pickup sequence.</p></div><span className="routing-badge">Proposal only</span></header>
      <ol className="routing-workflow" aria-label="Pickup planning workflow">{["Read existing requests", "Review preparation", "Review proposal"].map((label, index) => <li key={label} data-active={stage === index} data-complete={stage > index} aria-current={stage === index ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
      <details className="routing-card routing-access" open={!preview}><summary>{preview ? `Workspace access / service ${date} / IST` : "Connect to existing requests"}</summary><form onSubmit={event => { event.preventDefault(); void run(() => load(proposal?.id)); }} className="routing-access-form"><label>Operator token<input type="password" autoComplete="off" required value={token} onChange={event => setToken(event.target.value)}/></label><label>Service date<input type="date" required value={date} onChange={event => { setDate(event.target.value); setPreview(null); setProposal(null); }}/></label><button className="routing-button" disabled={!ready || busy}>{!ready ? "Preparing workspace…" : busy ? "Reading…" : "Read eligible bookings"}</button></form><p className="routing-hint">Token stays out of the URL and browser storage. Reads do not change booking status.</p></details>
      {error && <div role="alert" className="routing-error"><strong>Planning step could not complete</strong><p>{errorSummary(error)}</p><details><summary>Technical details</summary><code>{error}</code></details></div>}
      {busy && <p className="routing-busy" role="status">Reading or calculating planning evidence…</p>}
      {!preview && !busy && <section id="route-overview" className="routing-card routing-welcome"><div className="routing-welcome-mark"><RouteMark/></div><h2>Start with the requests you already have</h2><p>Read your bookings, check verification and coordinate evidence, then create a proposal. Nothing is dispatched from this workspace.</p><div><span>1 · Read requests</span><span>2 · Resolve preparation</span><span>3 · Review a proposal</span></div></section>}
      {preview && <>
        <dl className="routing-summary" aria-label="Planning summary"><div><dt>Existing requests</dt><dd>{preview.addresses.length}</dd><small>Read from this recycler</small></div><div><dt>Ready for planning</dt><dd>{eligible}<span className="routing-metric-note"> / {preview.conversions.length}</span></dd><small>{excluded ? `${excluded} need preparation` : "No preparation exclusions"}</small></div><div><dt>Proposed distance</dt><dd>{proposal ? displayNumber(proposal.optimization.solution.metres / 1000, 3) : "—"}<span className="routing-metric-note">{proposal ? " km" : ""}</span></dd><small>{proposal ? "Saved plan · not distance driven" : "Select or calculate a proposal"}</small></div><div><dt>Total route time</dt><dd className="routing-duration-value">{proposal ? displayDuration(planningSeconds) : "—"}</dd><small>{proposal ? "Sum of travel, service & waiting" : "No proposal selected"}</small></div></dl>
        <section id="route-overview" className="routing-card routing-overview" aria-labelledby="route-title"><div className="routing-section-heading"><div><p className="routing-eyebrow">{proposal ? `Version ${proposal.version} · ${proposal.optimization.solution.served} proposed stop${proposal.optimization.solution.served === 1 ? "" : "s"}` : "Planning workspace"}</p><h2 id="route-title">Route overview</h2></div><div className="routing-heading-actions">{proposal && <span className={"routing-badge " + (proposal.current ? "routing-badge--ready" : "routing-badge--stale")}>{proposal.current ? "Current inputs" : "Stale proposal"}</span>}<button className="routing-button" disabled={!canGenerate} onClick={() => void run(async () => { const data: PresentedProposal = await call("/api/routing", { action: "generate", payload: { serviceDate: date, requestKey: crypto.randomUUID() } }); await load(data.id); })}>Generate proposal</button></div></div>
          {proposal && !proposal.current ? <div className="routing-stale-notice" role="status"><div><strong>Historical route — preparation needs review</strong><p>This saved proposal has expired evidence or changed inputs. Review preparation, refresh expired candidates and explicitly review them before recalculating. The route below is for reference.</p></div><a className="routing-button routing-button--secondary" href="#preparation">Review preparation</a></div> : !preview.settings.vehicles.length ? <p className="routing-notice">Add a planning resource in Fleet & depots before calculating.</p> : !eligible ? <p className="routing-notice">Resolve the preparation exclusions below before a proposal can be calculated.</p> : <p className="routing-hint">Ready for an explicit calculation. A proposal does not confirm a slot, dispatch a vehicle or record collection.</p>}
          {proposal ? <><div className="routing-plan-meta"><span>{proposal.independentValidation.valid ? "✓ Independently replayed" : "Independent validation failed"}</span><span>Service {proposal.input.serviceDate} · IST</span><span>{proposal.optimization.status === "proven-optimum" ? "Proven optimum for these inputs" : proposal.optimization.status === "heuristic-feasible" ? "Feasible heuristic result" : "No feasible solution found"}</span></div><div className="routing-map-stop-grid"><RoutingMap key={proposal.id} proposal={proposal} configuration={preview.map}/><RoutingStopList proposal={proposal}/></div></> : <div className="routing-no-proposal"><h3>No saved proposal selected</h3><p>{preview.history.length ? "Choose a saved proposal below or resolve preparation to calculate a new one." : "Prepare at least one eligible pickup and a planning vehicle to calculate a route."}</p><a href="#preparation">Go to preparation →</a></div>}
        </section>
        <div className="routing-lower-grid"><section id="preparation" className="routing-card" aria-labelledby="preparation-title"><div className="routing-section-heading"><div><p className="routing-eyebrow">Before calculating</p><h2 id="preparation-title">Preparation</h2></div><span className={"routing-badge " + (excluded ? "routing-badge--stale" : "routing-badge--ready")}>{excluded ? `${excluded} need review` : "Ready"}</span></div><p className="routing-muted">Only registered public test locations are enabled. Verification, coordinate review and service-duration assumptions remain required.</p>{!preview.conversions.length && <p className="routing-empty">No existing bookings were found for this recycler.</p>}{preview.conversions.map(conversion => {
          const id = conversion.eligible ? conversion.pickup.id : conversion.id, address = preview.addresses.find(item => item.id === id);
          return <article key={id} className="routing-booking"><div className="routing-booking-heading"><h3>{address?.reference || id}</h3><span className={"routing-badge " + (conversion.eligible ? "routing-badge--ready" : "routing-badge--stale")}>{conversion.eligible ? "Ready" : "Needs review"}</span></div><p>{conversion.eligible ? "Ready for planning; not dispatched." : conversion.reasons.map(reasonLabel).join(" ")}</p><RoutingGeocodeReview bookingId={id} address={address?.address || ""} attempt={preview.settings.geocoding?.[id]} busy={busy} geocode={() => void run(async () => { await call("/api/routing", { action: "geocode", payload: { bookingId: id } }); await load(proposal?.id); })} review={payload => void run(async () => { await call("/api/routing", { action: "review", payload }); await load(proposal?.id); })}/></article>;
        })}</section>
          <aside className="routing-utilities"><section id="fleet" className="routing-card"><div className="routing-section-heading"><h2>Fleet & depots</h2><span className="routing-count">{preview.settings.vehicles.length}</span></div><p className="routing-muted">Planning resources, not driver assignments.</p>{!preview.settings.vehicles.length && <p className="routing-empty">No planning vehicles configured.</p>}<ul className="routing-fleet-summary">{preview.settings.vehicles.map(vehicle => <li key={vehicle.id}><strong>{vehicle.id}</strong><span>{displayNumber(vehicle.capacityKg)} kg capacity · {displayNumber(vehicle.initialLoadKg)} kg initial load</span></li>)}</ul><details className="routing-fleet-editor"><summary>Edit planning fleet</summary><RoutingFleetEditor settings={preview.settings} busy={busy} save={vehicles => run(async () => { await call("/api/routing", { action: "vehicles", payload: vehicles }); await load(proposal?.id); })}/><details><summary>Advanced vehicle JSON</summary><label>Vehicle JSON<textarea rows={12} value={fleet} onChange={event => setFleet(event.target.value)}/></label><button className="routing-button" disabled={busy} onClick={() => void run(async () => { await call("/api/routing", { action: "vehicles", payload: JSON.parse(fleet) }); await load(proposal?.id); })}>Save fleet version</button></details></details></section>
            <section id="history" className="routing-card"><div className="routing-section-heading"><h2>Saved proposals</h2><span className="routing-count">{preview.history.length}</span></div>{!preview.history.length && <p className="routing-empty">No saved proposals yet.</p>}<div className="routing-history-list" role="region" aria-label="Saved proposal versions" tabIndex={0}>{[...preview.history].sort((a, b) => b.version - a.version).map(item => <button key={item.id} type="button" aria-pressed={proposal?.id === item.id} disabled={busy} onClick={() => void run(async () => setProposal(await call("/api/routing?id=" + item.id)))}><span>Version {item.version}{proposal?.id === item.id && <small>Selected</small>}</span><time dateTime={item.createdAt}>{displayTimestamp(item.createdAt)}</time></button>)}</div></section>
          </aside>
        </div>
        <details className="routing-card routing-evidence"><summary>Evidence & calculation details</summary><div className="routing-evidence-content"><p>All calculations use Asia/Kolkata, directed metres/seconds and total-row kg. Confirmed dispatcher windows constrain completion; requested windows remain preferences.</p><p>Fuel and emissions estimates are omitted because no applicable measured or sourced factor is configured.</p><p>{preview.map.enabled ? "MapTiler browser access is enabled for the configured application origins." : preview.map.reason || "The basemap is disabled; the diagram and ordered stop list remain available."}</p>{proposal && <><dl className="routing-evidence-facts"><div><dt>Saved road provider</dt><dd>{proposal.input.matrix.provider} / {proposal.input.matrix.profile}</dd></div><div><dt>Retrieved / expires (IST)</dt><dd>{displayTimestamp(proposal.input.matrix.retrievedAt)} / {displayTimestamp(proposal.input.matrix.expiresAt)}</dd></div><div><dt>Baseline comparison</dt><dd>{proposal.comparison.comparable ? `${(proposal.comparison.deltaMetres === null ? "unavailable" : displayNumber(proposal.comparison.deltaMetres))} m planned difference; ${proposal.comparison.reductionPercent === null ? "percentage undefined" : displayNumber(proposal.comparison.reductionPercent) + "%"}` : proposal.comparison.reason}</dd></div></dl><details><summary>Calculation provenance</summary><pre>{JSON.stringify({ correlationId: proposal.correlationId, inputFingerprint: proposal.optimization.inputFingerprint, algorithm: proposal.optimization.algorithm, preparationSnapshot: proposal.preparationSnapshot ?? "Historical proposal; no preparation snapshot recorded", matrix: { provider: proposal.input.matrix.provider, profile: proposal.input.matrix.profile, retrievedAt: proposal.input.matrix.retrievedAt, expiresAt: proposal.input.matrix.expiresAt, approximation: proposal.input.matrix.approximation }, evaluations: proposal.optimization.evaluations, baseline: proposal.optimization.baseline, objective: proposal.optimization.objective }, null, 2)}</pre></details></>}</div></details>
      </>}
      <footer className="routing-footer">ReCircuit · Local public-location pilot. Planning never changes booking lifecycle, scheduling or collection status.</footer>
    </main>
  </div>;
}

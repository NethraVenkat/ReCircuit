"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Conversion } from "../../lib/geospatial/contracts";
import type { SavedProposal, WorkspaceSettings } from "../../lib/geospatial/service";
import { navigationSection, routingDate, routingHref } from "../../lib/geospatial/navigation";

export type PresentedProposal = SavedProposal & { current: boolean };
export interface Preview {
  tenant: string; serviceDate: string; sourceFingerprint: string; conversions: Conversion[]; settings: WorkspaceSettings;
  addresses: Array<{ id: string; reference: string; address: string }>;
  history: Array<{ id: string; version: number; createdAt: string; serviceDate: string; correlationId: string }>;
  map: { enabled: boolean; key?: string; reason?: string };
}
interface Session {
  preview: Preview; date: string; busy: boolean; revision: number; query: URLSearchParams;
  href: (path: string) => string;
  navigate: (path: string) => void;
  request: <T>(url: string) => Promise<T>;
  act: <T>(action: "review" | "geocode" | "vehicles" | "generate", payload: unknown) => Promise<T | undefined>;
}
const Context = createContext<Session | null>(null);
export function useRouting() { const value = useContext(Context); if (!value) throw Error("Routing authentication is required"); return value; }
export function RouteMark() { return <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M25 11a10 10 0 0 0-17-3L4 12m0-7v7h7M7 21a10 10 0 0 0 17 3l4-4m0 7v-7h-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
export function routingError(code: string): string {
  if (code.includes("UNAUTHORIZED")) return "The operator token was not accepted. Enter an authorized token to continue.";
  if (code.includes("NOT_FOUND")) return "This proposal or booking is unavailable for the current recycler. Check the link or return to saved proposals.";
  if (code.includes("GEOCODE_REVIEW_STALE") || code.includes("PUBLIC_TEST_COORDINATES")) return "Public-location evidence needs review. Refresh expired candidates and explicitly review them before calculating.";
  if (code.includes("NO_ELIGIBLE")) return "No pickups are ready. Resolve the preparation exclusions first.";
  if (code.includes("CONTEXT_CHANGED")) return "The service date or operator changed. Read the current workspace before retrying.";
  return "This step could not complete. Check the inputs and service details before retrying. No booking lifecycle change was made.";
}
export function RoutingError({ code }: { code: string }) { return <div role="alert" className="routing-error"><strong>Routing step could not complete</strong><p>{routingError(code)}</p><details><summary>Technical details</summary><code>{code}</code></details></div>; }

const links = [
  { section: "overview", path: "/admin/routing", label: "Route overview" },
  { section: "preparation", path: "/admin/routing/preparation", label: "Preparation" },
  { section: "fleet", path: "/admin/routing/fleet", label: "Fleet & depots" },
  { section: "proposals", path: "/admin/routing/proposals", label: "Saved proposals" },
];
export function RoutingWorkspace({ children }: { children: React.ReactNode }) {
  const path = usePathname(), params = useSearchParams(), router = useRouter(), date = routingDate(params.get("date")), section = navigationSection(path);
  const title = path.startsWith("/admin/routing/proposals/") ? "Proposal details" : links.find(item => item.section === section)!.label;
  const descriptions: Record<string, string> = { overview: "Review the saved route, current preparation and the next planning action.", preparation: "Review eligibility, public-location evidence and explicit planning assumptions.", fleet: "Inspect capacity, material compatibility, operating windows and depot configuration.", proposals: "Browse immutable planning versions and their actual stored evidence." };
  const [token, setToken] = useState(""), [entry, setEntry] = useState(""), [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [revision, setRevision] = useState(0), [ready, setReady] = useState(false);
  const epoch = useRef(0);
  const loadedContext = useRef("");
  useEffect(() => setReady(true), []);
  const forget = useCallback(() => { epoch.current++; setToken(""); setEntry(""); setPreview(null); setError(""); setBusy(false); }, []);
  const fetchJson = useCallback(async <T,>(url: string, credential: string, body?: unknown): Promise<T> => {
    const stamp = epoch.current;
    const response = await fetch(url, { method: body ? "POST" : "GET", headers: { "x-admin-token": credential, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    if (stamp !== epoch.current) throw Error("ROUTING_CONTEXT_CHANGED");
    const value = await response.json();
    if (!response.ok) { if (response.status === 401) forget(); throw Error(value.error || "ROUTING_SERVICE_UNAVAILABLE"); }
    return value as T;
  }, [forget]);
  const request = useCallback(<T,>(url: string) => fetchJson<T>(url, token), [fetchJson, token]);
  useEffect(() => {
    if (!token || loadedContext.current === path + "?date=" + date && preview?.serviceDate === date) return;
    loadedContext.current = path + "?date=" + date;
    let active = true; setBusy(true); setError("");
    void request<Preview>("/api/routing?date=" + date).then(value => { if (active) setPreview(value); }).catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [path, date, token, preview?.serviceDate, request]);
  async function connect(event: React.FormEvent) {
    event.preventDefault(); epoch.current++; setBusy(true); setError(""); setPreview(null); setToken("");
    try { const value = await fetchJson<Preview>("/api/routing?date=" + date, entry); loadedContext.current = path + "?date=" + date; setPreview(value); setToken(entry); setEntry(""); setRevision(value => value + 1); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError("");
    try { setPreview(await request<Preview>("/api/routing?date=" + date)); setRevision(value => value + 1); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function act<T>(action: "review" | "geocode" | "vehicles" | "generate", payload: unknown): Promise<T | undefined> {
    setBusy(true); setError("");
    try { const value = await fetchJson<T>("/api/routing", token, { action, payload }); setPreview(await request<Preview>("/api/routing?date=" + date)); setRevision(value => value + 1); return value; }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const href = (destination: string) => routingHref(destination, date), authenticated = !!token && preview?.serviceDate === date;
  return <div className="routing-shell"><a className="routing-skip" href="#routing-main">Skip to routing content</a><aside className="routing-navigation"><Link className="routing-brand" href="/admin"><span className="routing-brand-mark"><RouteMark/></span><span>ReCircuit<small>Recycler workspace</small></span></Link><p className="routing-nav-label">Operations</p><nav aria-label="Routing workspace">{links.map((item, index) => <Link key={item.section} href={href(item.path)} prefetch={false} aria-current={section === item.section ? "page" : undefined}><span aria-hidden="true">0{index + 1}</span>{item.label}</Link>)}<Link href="/admin"><span aria-hidden="true">↗</span>Operator console</Link></nav><div className="routing-pilot-note"><span className="routing-status-dot"/>Local pilot<p>Planning proposals only. No driver assignment or dispatch.</p></div></aside>
    <main id="routing-main" className="routing-workspace"><header className="routing-page-header"><div><p className="routing-eyebrow">Operations / Pickup planning</p><h1>{title}</h1><p>{descriptions[section]}</p></div><span className="routing-badge">Proposal only</span></header>
      <section className="routing-card routing-session" aria-label="Routing access and service date"><div className="routing-session-bar"><label>Service date<input type="date" value={date} required onChange={event => { if (!event.target.value) return; epoch.current++; setPreview(null); router.push(routingHref(path, event.target.value)); }}/></label><p>{token ? <>Connected to <strong>{preview?.tenant || "the authorized recycler"}</strong>. Token remains in this layout’s memory only.</> : "Enter the operator token to read this page. Refreshing requires token entry again."}</p>{token && <div className="routing-action-group"><button type="button" disabled={busy} className="routing-button routing-button--secondary" onClick={() => void refresh()}>Refresh local data</button><button type="button" className="routing-button routing-button--secondary" onClick={forget}>Forget token</button></div>}</div>
      {!token && <form onSubmit={event => void connect(event)} className="routing-entry"><label>Operator token<input type="password" autoComplete="off" required value={entry} onChange={event => setEntry(event.target.value)}/></label><button className="routing-button" disabled={!ready || busy}>{!ready ? "Preparing workspace…" : busy ? "Reading…" : "Unlock routing workspace"}</button><p className="routing-hint">Header authentication only. The token never enters URLs, localStorage, sessionStorage or cookies.</p></form>}</section>
      {error && <RoutingError code={error}/>} {busy && <p role="status" className="routing-busy">Reading or saving local planning evidence…</p>}
      {authenticated && preview ? <Context.Provider value={{ preview, date, busy, revision, query: new URLSearchParams(params.toString()), href, navigate: destination => router.push(destination), request, act }}>{children}</Context.Provider> : !busy && !error ? <section className="routing-card routing-welcome"><div className="routing-welcome-mark"><RouteMark/></div><h2>Open {title.toLowerCase()}</h2><p>Use the authorized operator token above. Your destination and service date remain in the URL; credentials are never saved. Navigation does not calculate routes or contact external routing providers.</p></section> : null}
      <footer className="routing-footer">ReCircuit · Local public-location pilot. Planning never confirms slots, dispatches vehicles or changes booking collection status.</footer>
    </main></div>;
}

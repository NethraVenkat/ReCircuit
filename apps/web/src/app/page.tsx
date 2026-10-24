"use client";
import { useRecordList, RecordListControls, RecordListPagination } from "../../../../packages/ui/record-list";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Plan, Request as PickupRequest } from "@recircuit/core";
import { api, Status, money, time } from "../components/ui";
import { ErrorNotice, ProgressNotice } from "../components/feedback";
import { IntakeExamples } from "../components/intake-examples";

type Pickup = { bookingStatus?: string; request: PickupRequest; plan?: Plan; updatedAt: string; customer?: { fullName?: string; locality: string; pincode: string } };
export default function PickupsPage() {
  const [records, setRecords] = useState<Pickup[]>([]); const [busy, setBusy] = useState(true); const [error, setError] = useState("");
  async function load() { setBusy(true); setError(""); try { setRecords((await api("/api/requests")).requests); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, []);
  const ordered = [...records].sort((a,b) => Number(a.request.state === "REJECTED") - Number(b.request.state === "REJECTED"));
  const list = useRecordList(ordered, r => [r.customer?.fullName, r.request.description, ...r.request.items.map(i => i.description)].join(" "), r => r.request.state, 10);
  const listStatuses = [{ value: "AWAITING_APPROVAL", label: "Awaiting approval" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Declined" }];
  const metrics = [
    ["Saved requests", records.length, "Available in this workspace"],
    ["Awaiting your review", records.filter(r => r.request.state === "AWAITING_APPROVAL").length, "Approval is always explicit"],
    ["Booking references", records.reduce((sum, r) => sum + (r.plan?.legs.filter(l => Boolean(l.bookingReference)).length ?? 0), 0), "References do not prove collection"],
    ["Declined plans", records.filter(r => r.request.state === "REJECTED").length, "No booking from a rejected request"],
  ];
  return <><div className="rc-titlebar"><div><p className="rc-eyebrow">Your household, a little lighter</p><h1>My pickups</h1><p className="rc-secondary">Review a plan, follow a booking, or make room for something new.</p></div><Link className="rc-button rc-primary" href="/arrange">Arrange a pickup <span aria-hidden="true">↗</span></Link></div><p className="rc-secondary">Showing saved requests for this workspace. Keep this browser’s cookies to return to your pickups.</p>{!busy && !error && <dl className="rc-overview-grid" aria-label="Your saved request totals">{metrics.map(([label, value, detail]) => <div className="rc-metric" key={label}><dt>{label}</dt><dd>{value}<small>{detail}</small></dd></div>)}</dl>}{error && <><ErrorNotice message={error}/><button onClick={load}>Try again</button></>}{busy && !records.length ? <div aria-label="Loading pickups" aria-busy="true"><ProgressNotice title="Loading your pickups…">Reading saved requests for this workspace.</ProgressNotice></div> : error ? null : !records.length ? <section className="rc-panel rc-first-visit"><div className="rc-empty"><div className="rc-empty-icon" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 4"/></svg></div><h2>No pickups yet</h2><p className="rc-secondary">Start with the items you want to recycle. You'll see suitable recyclers and the pickup fee before you decide.</p></div><IntakeExamples/></section> : <section className="rc-panel"><h2>Your requests</h2><RecordListControls list={list} statuses={listStatuses} searchLabel="Search pickups"/>{list.rows.map(r => <article className="rc-row" key={r.request.id}><div><h3><Link href={`/r/${r.request.id}`}>{r.customer?.fullName && <>{r.customer.fullName} · </>}{r.request.items.map(i => `${i.quantity} · ${i.description}`).join(", ") || "Recycling pickup"}</Link></h3><p className="rc-secondary">{r.customer ? `${r.customer.locality} · ${r.customer.pincode}` : "Location not recorded"}</p><p className="rc-secondary">{r.plan?.legs.map(l=>l.recyclerName).join(" + ") || "No recycler selected"} · {money(r.plan?.totalEstimatedFee)} pickup fee</p><small>Updated {time(r.updatedAt)}</small></div><div className="rc-stack"><Status value={r.bookingStatus || r.plan?.legs.find(l=>l.state!=="APPROVED")?.state || r.request.state}/><Link className="rc-button" href={`/r/${r.request.id}`}>{r.request.state === "AWAITING_APPROVAL" ? "Review pickup" : "View pickup"}</Link></div></article>)}<RecordListPagination list={list}/></section>}<div className="rc-row"><div><h3>A clear decision, every time</h3><p className="rc-secondary">Review item allocation, costs and source information before approving.</p></div><Link href="/test-cases">Explore examples</Link></div></>;
}

"use client";
import { useEffect, useRef, type ReactNode, type KeyboardEvent } from "react";

export const money = (value: number | null | undefined) => value == null ? "Unknown" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
export const time = (value?: string) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
const labels: Record<string, string> = { AWAITING_APPROVAL: "Ready for review", APPROVED: "Approved", REJECTED: "Declined", SUBMITTING: "Booking in progress", REQUEST_SUBMITTED: "Booking requested", REQUEST_CONFIRMED: "Booking independently checked", PICKUP_SCHEDULED: "Pickup scheduled", NEEDS_HUMAN: "Needs your attention", FAILED: "Needs review", RECEIVED: "Booking received", PICKED_UP: "Collection recorded", RECYCLED: "Recycled" };
export function Status({ value }: { value?: string }) { return <span className="rc-badge">{value ? labels[value] || value.replaceAll("_", " ").toLowerCase() : "Status unavailable"}</span>; }
export function Journey({ current }: { current: number }) { return <ol className="rc-journey" aria-label="Pickup journey">{["Items", "Recyclers", "Review", "Tracking"].map((s, i) => <li key={s} aria-current={current === i ? "step" : undefined}><span>{i + 1}</span>{s}</li>)}</ol>; }
export function Drawer({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const trigger = document.activeElement as HTMLElement; ref.current?.showModal(); return () => trigger?.focus(); }, []);
  function containFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if(event.key!=="Tab")return;
    const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button,a[href],input,select,textarea,summary,[tabindex]:not([tabindex='-1'])")).filter(el=>!el.hasAttribute("disabled")&&el.getClientRects().length>0);
    const first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  return <dialog className="rc-drawer" ref={ref} onKeyDown={containFocus} onCancel={close} aria-labelledby="drawer-title"><div className="rc-drawer-head"><h2 id="drawer-title">{title}</h2><button type="button" onClick={close} aria-label="Close drawer">Close</button></div>{children}</dialog>;
}
export async function api(url: string, body?: unknown) {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to complete this action. Please try again.");
  return data;
}

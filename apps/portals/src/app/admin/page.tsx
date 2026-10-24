"use client";

import { useRecordList, RecordListControls, RecordListPagination } from "../../../../../packages/ui/record-list";
import { trackingSlots } from "../../lib/tracking-slots";
import { bookingStatusLabel } from "../../lib/status-presentation";
import { RecyclingLoader } from "../../../../../packages/ui/recycling-loader";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { PortalFeedback } from "@/components/PortalFeedback";
import { useSearchParams } from "next/navigation";
import type { PortalBooking, RecyclerId } from "@/lib/types";
import { RECYCLER_CONFIGS, getAvailableSlots } from "@/lib/config";

function AdminPageContent(): JSX.Element {
  const searchParams = useSearchParams();
  const initialToken = searchParams.get("token") || "";
  const [token, setToken] = useState<string>(() => {
    if (initialToken) {
      if (typeof window !== "undefined") sessionStorage.setItem("rc_admin_token", initialToken);
      return initialToken;
    }
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("rc_admin_token") || "";
    }
    return "";
  });

  useEffect(() => {
    if (initialToken && initialToken !== token) {
      setToken(initialToken);
      if (typeof window !== "undefined") sessionStorage.setItem("rc_admin_token", initialToken);
    }
  }, [initialToken]);

  const [recyclerId, setRecyclerId] = useState<RecyclerId>("deccan");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [adminDisabled, setAdminDisabled] = useState<boolean>(false);
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [pendingAction, setPendingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [inputWeight, setInputWeight] = useState("4.5");

  const list = useRecordList(bookings, b => [b.fullName, b.bookingReference, ...b.items.map(i => i.name)].join(" "), b => b.status);
  const listStatuses = [...new Set(bookings.map(b => b.status))].map(value => ({ value, label: bookingStatusLabel(bookings.find(b => b.status === value)!) }));
  const slots = useMemo(() => getAvailableSlots(), []);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true); setLoadError("");
    const activeToken = token || (typeof window !== "undefined" ? sessionStorage.getItem("rc_admin_token") || "" : "");
    try {
      const url = "/api/admin";
      const res = await fetch(url, {
        headers: activeToken ? { "x-admin-token": activeToken } : {},
      });
      if (res.status === 503) {
        setAdminDisabled(true);
        setLoading(false);
        return;
      }
      if (res.status === 401) {
        setAuthenticated(false);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`Operator service returned HTTP ${res.status}`);

      const data = await res.json();
      setAuthenticated(true);
      if (typeof window !== "undefined" && window.location.search.includes("token=")) {
        window.history.replaceState({}, "", "/admin");
      }
      setRecyclerId(data.recyclerId || "deccan");
      setBookings(data.bookings || []);
    } catch {
      setLoadError("The operator service could not be reached. Your credentials have not been classified as invalid.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
    if (slots.length > 0) setSelectedSlot(slots[0] || "");
  }, [loadData, slots]);

  const handleAction = async (action: string, reference: string, extra: Record<string, unknown> = {}): Promise<void> => {
    if (pendingAction) return;
    if (action === "weighed" && (typeof extra.weightKg !== "number" || !Number.isFinite(extra.weightKg) || extra.weightKg <= 0)) { setActionMessage("Error: Enter a positive measured weight before recording it."); return; }
    setPendingAction(true); setActionMessage("");
    const activeToken = token || (typeof window !== "undefined" ? sessionStorage.getItem("rc_admin_token") || "" : "");
    try {
      const url = "/api/admin";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activeToken ? { "x-admin-token": activeToken } : {}),
        },
        body: JSON.stringify({ action, reference, expectedUpdatedAt: bookings.find(b => b.bookingReference === reference)?.updatedAt, ...extra }),
      });
      const data = await res.json();
      if (data.ok) {
        setActionMessage(`Pickup ${reference} updated. This is a simulated event.${data.pickupOtp ? ` Collection code: ${data.pickupOtp}` : ""}`);
        loadData();
      } else {
        setActionMessage(`Error: ${data.error || "Action failed"}`);
      }
    } catch (err: unknown) {
      setActionMessage(`Network error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally { setPendingAction(false); }
  };

  if (loadError && authenticated !== true) return <main className="portal-operator"><div className="portal-card"><h1 className="text-2xl font-bold mb-4">Operator console unavailable</h1><PortalFeedback message={loadError}/><button className="portal-button mt-4" onClick={() => void loadData()}>Try again</button></div></main>;
  if (authenticated === null && !adminDisabled) return <main className="portal-operator" aria-busy="true"><RecyclingLoader label="Opening operator console..."/></main>;
  if (adminDisabled) {
    return (
      <main className="portal-operator portal-auth">
        <div data-testid="admin-disabled" className="max-w-md w-full bg-white p-8 rounded-lg border border-red-300 shadow-xs text-center space-y-4">
          <svg className="portal-auth-icon" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>
          <h1 className="text-xl font-bold text-slate-900">Operator console disabled</h1>
          <p className="text-sm text-slate-600">
            Admin console and operational APIs are disabled because ADMIN_TOKEN is not configured on this server.
          </p>
        </div>
      </main>
    );
  }

  if (authenticated === false) {
    return (
      <main className="portal-operator portal-auth">
        <div data-testid="admin-unauthorized" className="max-w-md w-full bg-white p-8 rounded-lg border shadow-xs text-center space-y-4">
          <svg className="portal-auth-icon" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>
          <h1 className="text-xl font-bold text-slate-900">Administrator sign in</h1>
          <p className="text-sm text-slate-600">
            Access to this portal management interface requires a valid administrator token.
          </p>
          <form className="space-y-3 text-left" onSubmit={e => { e.preventDefault(); const value = tokenDraft.trim(); setToken(value); sessionStorage.setItem("rc_admin_token", value); setTokenDraft(""); }}>
            <label htmlFor="operator-token" className="block font-semibold text-sm">Administrator token</label>
            <input id="operator-token" type="password" autoComplete="off" required value={tokenDraft} onChange={e => setTokenDraft(e.target.value)} className="w-full"/>
            <p className="text-sm text-slate-600">Use the token supplied by your portal operator. It is sent in an authorization header, not added to the address bar.</p>
            <button className="portal-button w-full" type="submit">Sign in</button>
          </form>
        </div>
      </main>
    );
  }

  const config = RECYCLER_CONFIGS[recyclerId];

  return (
    <main className="portal-operator">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white p-6 rounded-lg border shadow-xs flex flex-wrap justify-between items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-sm text-xs font-bold bg-emerald-800 text-white">
                Operator console
              </span>
              <h1 className="text-2xl font-black text-slate-900">{config.name}</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Manage pickup requests, scheduling and collection history.
            </p>
          </div>

          <div className="portal-actions"><a className="portal-button portal-button--secondary" href="/admin/routing">Pickup route planning</a>

            <a
              href="/"
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-sm"
            >
              View public portal
            </a>
          </div>
        </div>

        {actionMessage && (/error|failed/i.test(actionMessage) ? <PortalFeedback message={actionMessage} title="The operational action needs review."/> : <div data-testid="admin-action-message" role="status" className="portal-notice">{actionMessage}</div>)}
        {loadError && <PortalFeedback message={loadError}/>}
        {loading && <RecyclingLoader label="Refreshing saved bookings..."/>}



        {/* Bookings Table & Simulated Actions */}
        <div className="bg-white p-6 rounded-lg border shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Portal bookings list</h2>
              <p className="text-xs text-slate-500">
                Select actions below to advance bookings through downstream lifecycle stages.
              </p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="text-xs text-slate-600 hover:text-slate-900 font-bold underline"
            >
              Refresh bookings
            </button>
          </div>

          <RecordListControls list={list} statuses={listStatuses} searchLabel="Search bookings"/>
          {bookings.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center italic">
              No bookings logged yet for {config.name}. Use the public portal booking form to create one.
            </p>
          ) : (
            <div className="operator-table-region" role="region" aria-label="Saved bookings and operational actions" tabIndex={0}>
              <table className="w-full text-xs text-left border-collapse">
                <caption className="sr-only">Saved booking details and simulated operator actions</caption>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <th className="py-2.5 px-3 font-bold">Reference</th>
                    <th className="py-2.5 px-3 font-bold">Customer</th>
                    <th className="py-2.5 px-3 font-bold">Items</th>
                    <th className="py-2.5 px-3 font-bold">Slot</th>
                    <th className="py-2.5 px-3 font-bold">Status</th>
                    <th className="py-2.5 px-3 font-bold">Simulated Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.rows.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-sans font-bold text-slate-900"><a href={`${config.routes.track}?ref=${encodeURIComponent(b.bookingReference)}`}>{b.bookingReference}</a></td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold block">{b.fullName}</span>{b.provenance && <details><summary>Record provenance</summary><p>{b.provenance.scenario}</p><p>Sample record; simulated operational events. No real collection is claimed.</p><pre>{JSON.stringify(b.provenance, null, 2)}</pre></details>}
                        <span className="text-[11px] text-slate-500">{b.phone}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        {b.items.map((it, idx) => (
                          <div key={idx} className="text-[11px] text-slate-600">
                            {it.name} · Qty {it.quantity ?? "Unknown"} · {it.weightKg ?? "Unknown"} kg
                          </div>
                        ))}
                        <p className="text-[11px] text-slate-600">Pickup fee: {b.chargedFeeInr == null ? "Not recorded" : `₹${b.chargedFeeInr}`}</p>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-sans text-[11px]"><span className="block">Requested: {trackingSlots(b).requestedSlot || "Not recorded"}</span><span className="block">Assigned: {trackingSlots(b).assignedSlot || "Not assigned"}</span></td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-sm text-[10px] font-black uppercase ${
                            b.status === "PICKED_UP" || b.status === "WEIGHED"
                              ? "bg-green-100 text-green-800"
                              : b.status === "SCHEDULED" || b.status === "CONFIRMED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {bookingStatusLabel(b)}
                        </span>
                        {b.pickupOtp && (
                          <span className="block text-[10px] text-emerald-700 font-sans font-bold mt-0.5">
                            OTP: {b.pickupOtp}
                          </span>
                        )}
                        {b.weightKg !== undefined && (
                          <span className="block text-[10px] text-emerald-700 font-bold mt-0.5">
                            Wt: {b.weightKg} kg
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Confirm */}
                          <button
                            type="button"
                            data-testid={`btn-confirm-${b.bookingReference}`}
                            onClick={() => handleAction("confirm", b.bookingReference)}
                            disabled={pendingAction || b.status !== "RECEIVED"}
                            className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-30 text-white rounded-sm font-bold text-[10px]"
                          >
                            Confirm
                          </button>

                          {/* Schedule */}
                          <button
                            type="button"
                            data-testid={`btn-schedule-${b.bookingReference}`}
                            onClick={() =>
                              handleAction("schedule", b.bookingReference, { slot: selectedSlot })
                            }
                            disabled={pendingAction || ["PICKED_UP", "WEIGHED", "CANCELLED"].includes(b.status)}
                            className="px-2 py-1 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-30 text-white rounded-sm font-bold text-[10px]"
                          >
                            Schedule
                          </button>

                          <button type="button" disabled={pendingAction || ["CANCELLED", "PICKED_UP", "WEIGHED"].includes(b.status)} className="portal-button portal-button--secondary" onClick={() => handleAction("cancel", b.bookingReference)}>Cancel pickup</button>
                          {/* Picked Up (OTP) */}
                          <button
                            type="button"
                            data-testid={`btn-pickup-${b.bookingReference}`}
                            onClick={() => handleAction("picked_up", b.bookingReference)}
                            disabled={pendingAction || b.status === "PICKED_UP" || b.status === "WEIGHED"}
                            className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-30 text-white rounded-sm font-bold text-[10px]"
                          >
                            Mark picked up
                          </button>

                          {/* Weighed */}
                          <button
                            type="button"
                            data-testid={`btn-weigh-${b.bookingReference}`}
                            disabled={pendingAction}
                            onClick={() =>
                              handleAction("weighed", b.bookingReference, { weightKg: parseFloat(inputWeight) })
                            }
                            className="px-2 py-1 bg-emerald-800 hover:bg-emerald-900 text-white rounded-sm font-bold text-[10px]"
                          >
                            Record weight
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <RecordListPagination list={list}/>
          {/* Quick inputs for schedule slot and weight */}
          <div className="portal-operator-controls border-t">
            <div>
              <label htmlFor="operator-slot">Dispatcher slot for Schedule</label>
              <select
                id="operator-slot"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                className="px-2 py-1 border rounded-sm text-xs bg-white"
              >
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="operator-weight">Measured weight for Record weight (kg)</label>
              <input
                id="operator-weight"
                min="0.01"
                type="number"
                value={inputWeight}
                onChange={(e) => setInputWeight(e.target.value)}
                step="0.5"
                className="w-16 px-2 py-1 border rounded-sm text-xs bg-white text-center font-bold"
              />
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}

export default function AdminPage(): JSX.Element {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-8">
          <RecyclingLoader label="Opening operator console..."/>
        </div>
      }
    >
      <AdminPageContent />
    </React.Suspense>
  );
}



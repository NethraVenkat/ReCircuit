"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type { FailureSwitches, PortalBooking, RecyclerId } from "@/lib/types";
import { RECYCLER_CONFIGS, getAvailableSlots } from "@/lib/config";

function AdminPageContent(): JSX.Element {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [recyclerId, setRecyclerId] = useState<RecyclerId>("deccan");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [adminDisabled, setAdminDisabled] = useState<boolean>(false);
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [switches, setSwitches] = useState<FailureSwitches>({
    failNextSubmit: false,
    omitNextReference: false,
    changedPolicyLayout: false,
    hideFeeInfo: false,
    raiseFee: false,
  });
  const [_loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [inputWeight, setInputWeight] = useState("4.5");

  const slots = getAvailableSlots();

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const url = token ? `/api/admin?token=${encodeURIComponent(token)}` : "/api/admin";
      const res = await fetch(url);
      if (res.status === 503) {
        setAdminDisabled(true);
        setLoading(false);
        return;
      }
      if (res.status === 401 || !res.ok) {
        setAuthenticated(false);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setAuthenticated(true);
      if (typeof window !== "undefined" && window.location.search.includes("token=")) {
        window.history.replaceState({}, "", "/admin");
      }
      setRecyclerId(data.recyclerId || "deccan");
      setBookings(data.bookings || []);
      setSwitches(data.switches || { failNextSubmit: false, omitNextReference: false, changedPolicyLayout: false });
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
    if (slots.length > 0) setSelectedSlot(slots[0] || "");
  }, [loadData, slots]);

  const handleAction = async (action: string, reference: string, extra: Record<string, unknown> = {}): Promise<void> => {
    setActionMessage("");
    try {
      const res = await fetch(`/api/admin?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reference, ...extra }),
      });
      const data = await res.json();
      if (data.ok) {
        const statusMap: Record<string, string> = {
          confirm: "CONFIRMED",
          schedule: "SCHEDULED",
          pickup: "PICKED_UP",
          weigh: "WEIGHED",
          receive: "RECEIVED_AT_RECYCLER",
          process: "PROCESSED",
          recycle: "RECYCLED",
          certificate: "CERTIFICATE_ISSUED",
        };
        const statusUpper = statusMap[action] || action.toUpperCase();
        setActionMessage(
          `Success: Executed "${action}" (${statusUpper}) on ${reference} (SIMULATED DOWNSTREAM EVENT)${
            data.pickupOtp ? ` - OTP Generated: ${data.pickupOtp}` : ""
          }`
        );
        loadData();
      } else {
        setActionMessage(`Error: ${data.error || "Action failed"}`);
      }
    } catch (err: unknown) {
      setActionMessage(`Network error: ${err instanceof Error ? err.message : "Failed"}`);
    }
  };

  const handleToggleSwitch = async (switchName: keyof FailureSwitches): Promise<void> => {
    const nextVal = !switches[switchName];
    try {
      const res = await fetch(`/api/admin?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_switch", switchName, value: nextVal }),
      });
      const data = await res.json();
      if (data.ok) {
        setSwitches(data.switches);
        setActionMessage(`Failure switch "${switchName}" set to ${nextVal}`);
      }
    } catch (err: unknown) {
      setActionMessage(`Failed to toggle switch: ${err instanceof Error ? err.message : "Error"}`);
    }
  };

  const handleResetDemo = async (): Promise<void> => {
    if (!confirm("Are you sure you want to reset all bookings and failure switches for this demo portal?")) return;
    try {
      const res = await fetch(`/api/reset?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "x-admin-token": token },
      });
      const data = await res.json();
      if (data.ok) {
        setActionMessage("Portal demo state cleared successfully.");
        loadData();
      } else {
        setActionMessage(`Reset failed: ${data.error}`);
      }
    } catch (err: unknown) {
      setActionMessage(`Reset error: ${err instanceof Error ? err.message : "Error"}`);
    }
  };

  if (adminDisabled) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div data-testid="admin-disabled" className="max-w-md w-full bg-white p-8 rounded-lg border border-red-300 shadow-sm text-center space-y-4">
          <span className="text-4xl block">🛑</span>
          <h2 className="text-xl font-bold text-slate-900">503 Admin disabled</h2>
          <p className="text-sm text-slate-600">
            Admin console and operational APIs are disabled because ADMIN_TOKEN is not configured on this server.
          </p>
        </div>
      </div>
    );
  }

  if (authenticated === false) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div data-testid="admin-unauthorized" className="max-w-md w-full bg-white p-8 rounded-lg border shadow-sm text-center space-y-4">
          <span className="text-4xl block">🔒</span>
          <h2 className="text-xl font-bold text-slate-900">Admin Authentication Required</h2>
          <p className="text-sm text-slate-600">
            Access to this portal management interface requires a valid administrator token.
          </p>
          <div className="p-3 bg-slate-50 border rounded text-xs font-mono text-slate-500">
            Pass <span className="font-bold text-slate-800">?token=ADMIN_TOKEN</span> in the URL query string.
          </div>
        </div>
      </div>
    );
  }

  const config = RECYCLER_CONFIGS[recyclerId];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white p-6 rounded-lg border shadow-sm flex flex-wrap justify-between items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded text-xs font-bold uppercase bg-slate-800 text-white">
                Admin Console
              </span>
              <h1 className="text-2xl font-black text-slate-900">{config.name}</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Dispatch, scheduling, simulated downstream lifecycle events, and test failure switches.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              data-testid="btn-reset-demo"
              onClick={handleResetDemo}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded shadow"
            >
              Reset Demo State
            </button>
            <a
              href="/"
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded"
            >
              View Public Portal
            </a>
          </div>
        </div>

        {actionMessage && (
          <div
            data-testid="admin-action-message"
            className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold rounded shadow-sm"
          >
            {actionMessage}
          </div>
        )}

        {/* Failure Switches for Agent Hardening Tests */}
        <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
          <div className="border-b pb-2 flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-slate-900">Agent Test Failure Switches</h2>
              <p className="text-xs text-slate-500">
                Trigger simulated portal failures to test the ReCircuit agent’s error handling and verification invariants.
              </p>
            </div>
            <span className="text-xs font-bold text-purple-700 uppercase">Test Swappable</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Switch 1: Fail submit with HTTP 500 */}
            <div className="p-4 rounded border bg-slate-50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold">Fail Next Submit (HTTP 500)</span>
                <input
                  type="checkbox"
                  data-testid="switch-fail-submit"
                  checked={switches.failNextSubmit}
                  onChange={() => handleToggleSwitch("failNextSubmit")}
                  className="rounded text-red-600 w-4 h-4"
                />
              </div>
              <p className="text-[11px] text-slate-600">
                Returns HTTP 500 on the next <code className="font-mono">POST /api/bookings</code> submission. One-shot.
              </p>
            </div>

            {/* Switch 2: Omit reference on confirmation */}
            <div className="p-4 rounded border bg-slate-50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold">Omit Next Reference</span>
                <input
                  type="checkbox"
                  data-testid="switch-omit-reference"
                  checked={switches.omitNextReference}
                  onChange={() => handleToggleSwitch("omitNextReference")}
                  className="rounded text-amber-600 w-4 h-4"
                />
              </div>
              <p className="text-[11px] text-slate-600">
                Suppresses the reference code on the confirmation page to test Booker missing-ref detection. One-shot.
              </p>
            </div>

            {/* Switch 3: Serve changed layout on policy page */}
            <div className="p-4 rounded border bg-slate-50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold">Serve Changed Policy Layout</span>
                <input
                  type="checkbox"
                  data-testid="switch-changed-layout"
                  checked={switches.changedPolicyLayout}
                  onChange={() => handleToggleSwitch("changedPolicyLayout")}
                  className="rounded text-purple-600 w-4 h-4"
                />
              </div>
              <p className="text-[11px] text-slate-600">
                Renames headings and moves fee schedule on policy pages to test LLM extraction robustness. Toggled.
              </p>
            </div>

            {/* Switch 4: Hide fee info */}
            <div className="p-4 rounded border bg-slate-50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold">Hide Fee Info</span>
                <input
                  type="checkbox"
                  data-testid="switch-hide-fee-info"
                  checked={switches.hideFeeInfo}
                  onChange={() => handleToggleSwitch("hideFeeInfo")}
                  className="rounded text-rose-600 w-4 h-4"
                />
              </div>
              <p className="text-[11px] text-slate-600">
                Omits fee thresholds and rates on policy pages to simulate extraction error and POLICY_UNREADABLE. Toggled.
              </p>
            </div>

            {/* Switch 5: Raise Fee (+₹40) */}
            <div className="p-4 rounded border bg-slate-50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-red-900">Raise Fee (+₹40) [Fee Drift]</span>
                <input
                  type="checkbox"
                  data-testid="switch-raise-fee"
                  checked={Boolean(switches.raiseFee)}
                  onChange={() => handleToggleSwitch("raiseFee")}
                  className="rounded text-red-600 w-4 h-4"
                />
              </div>
              <p className="text-[11px] text-slate-600">
                Adds ₹40 to the computed pickup charge to simulate fee drift / unexpected price increase. Toggled.
              </p>
            </div>
          </div>
        </div>

        {/* Bookings Table & Simulated Actions */}
        <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Portal Bookings List</h2>
              <p className="text-xs text-slate-500">
                Select actions below to advance bookings through downstream lifecycle stages.
              </p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="text-xs text-slate-600 hover:text-slate-900 font-bold underline"
            >
              Refresh Table
            </button>
          </div>

          {bookings.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center italic">
              No bookings logged yet for {config.name}. Use the public portal booking form to create one.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
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
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{b.bookingReference}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold block">{b.fullName}</span>
                        <span className="text-[11px] text-slate-500">{b.phone}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        {b.items.map((it, idx) => (
                          <div key={idx} className="text-[11px] text-slate-600">
                            {it.name} {it.weightKg ? `(${it.weightKg}kg)` : ""}
                          </div>
                        ))}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">{b.preferredSlot}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            b.status === "PICKED_UP" || b.status === "WEIGHED"
                              ? "bg-green-100 text-green-800"
                              : b.status === "SCHEDULED" || b.status === "CONFIRMED"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {b.status}
                        </span>
                        {b.pickupOtp && (
                          <span className="block text-[10px] text-emerald-700 font-mono font-bold mt-0.5">
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
                            disabled={b.status !== "RECEIVED"}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white rounded font-bold text-[10px]"
                          >
                            Confirm
                          </button>

                          {/* Schedule */}
                          <button
                            type="button"
                            data-testid={`btn-schedule-${b.bookingReference}`}
                            onClick={() =>
                              handleAction("schedule", b.bookingReference, { slot: selectedSlot || "Tomorrow 10:00–12:00 IST" })
                            }
                            disabled={b.status === "PICKED_UP" || b.status === "WEIGHED"}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white rounded font-bold text-[10px]"
                          >
                            Schedule
                          </button>

                          {/* Picked Up (OTP) */}
                          <button
                            type="button"
                            data-testid={`btn-pickup-${b.bookingReference}`}
                            onClick={() => handleAction("picked_up", b.bookingReference)}
                            disabled={b.status === "PICKED_UP" || b.status === "WEIGHED"}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 text-white rounded font-bold text-[10px]"
                          >
                            Mark Picked Up
                          </button>

                          {/* Weighed */}
                          <button
                            type="button"
                            data-testid={`btn-weigh-${b.bookingReference}`}
                            onClick={() =>
                              handleAction("weighed", b.bookingReference, { weightKg: parseFloat(inputWeight) || 5.0 })
                            }
                            className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-[10px]"
                          >
                            Record Weight
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick inputs for schedule slot and weight */}
          <div className="flex flex-wrap items-center gap-4 text-xs pt-3 border-t">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-500">Slot for &quot;Schedule&quot;:</span>
              <select
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                className="px-2 py-1 border rounded text-xs bg-white"
              >
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-500">Weight (kg) for &quot;Record Weight&quot;:</span>
              <input
                type="number"
                value={inputWeight}
                onChange={(e) => setInputWeight(e.target.value)}
                step="0.5"
                className="w-16 px-2 py-1 border rounded text-xs bg-white text-center font-bold"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage(): JSX.Element {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-8">
          <p className="text-sm font-semibold text-slate-600">Loading admin console...</p>
        </div>
      }
    >
      <AdminPageContent />
    </React.Suspense>
  );
}



"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ScoredPlanSummary {
  plan: {
    id: string;
    totalEstimatedFee: number;
    totalEstimatedPayout: number;
    planHash: string;
    legs: Array<{
      id: string;
      recyclerName: string;
      estimatedFee: number;
      estimatedPayout: number;
      itemIds: string[];
    }>;
  };
  totalFee: number;
  totalKnownPayout: number;
  netPayout: number;
  isPartial: boolean;
  approvalReasons: Array<{ code: string; message: string }>;
  unroutedItemIds: string[];
}

interface IntakeItem {
  id: string;
  rawText: string;
  category: string;
  quantity: number;
  estimatedWeightKg?: number;
  hazardClass?: string;
}

interface MatrixCell {
  itemId: string;
  recyclerId: string;
  recyclerName: string;
  status: "ACCEPTED" | "REJECTED" | "UNKNOWN";
  reason?: string;
  feeQuote?: string;
}

export default function HouseholdIntakePage() {
  const router = useRouter();
  const [inputText, setInputText] = useState("I have 1 old Dell laptop and 2 dead AA household batteries");
  const [feeCap, setFeeCap] = useState<string>("500");
  const [pincode, setPincode] = useState("500033");
  const [locality, setLocality] = useState("Jubilee Hills");
  const [fullName, setFullName] = useState("Ananya Sharma");
  const [phone, setPhone] = useState("9876543210");
  const [addressLine, setAddressLine] = useState("Flat 402, Green Meadows");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestId, setRequestId] = useState<string | null>(null);
  const [planData, setPlanData] = useState<ScoredPlanSummary["plan"] | null>(null);
  const [approvalCard, setApprovalCard] = useState<any>(null);
  const [matrix, setMatrix] = useState<{ items: IntakeItem[]; cells: MatrixCell[] } | null>(null);
  const [intakeItems, setIntakeItems] = useState<IntakeItem[]>([]);

  const [dataWipeAck, setDataWipeAck] = useState(true);
  const [slotDay, setSlotDay] = useState("earliest");
  const [slotWindow, setSlotWindow] = useState<"morning" | "afternoon" | "any">("morning");
  const [bookingLoading, setBookingLoading] = useState(false);

  async function handlePlan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          feeCapInr: feeCap ? parseInt(feeCap, 10) : undefined,
          slotDay,
          slotWindow,
          customer: { fullName, phone, addressLine, locality, pincode },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate plan");

      setRequestId(data.requestId);
      setPlanData(data.plan);
      setApprovalCard(data.approvalCard);
      setMatrix(data.matrix);
      setIntakeItems(data.intakeResult?.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleApproveAndBook() {
    if (!requestId || !planData) return;
    setBookingLoading(true);
    setError(null);
    try {
      // 1. Approve Plan
      const approveRes = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          planHash: planData.planHash,
          decision: "approve",
          slotPreference: { day: slotDay, window: slotWindow },
          dataWipeConfirmed: dataWipeAck,
        }),
      });

      const approveData = await approveRes.json();
      if (!approveRes.ok) throw new Error(approveData.error || "Approval failed");

      // 2. Execute Booking
      const bookRes = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          customer: { fullName, phone, addressLine, locality, pincode },
        }),
      });

      const bookData = await bookRes.json();
      if (!bookRes.ok) throw new Error(bookData.error || "Booking execution failed");

      // Redirect to verifiable tracking dashboard
      router.push(`/r/${requestId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBookingLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-emerald-900 to-slate-900 rounded-2xl p-8 text-white shadow-xl">
        <div className="max-w-3xl">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-4">
            Autonomous Reverse-Logistics Agent
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Responsible E-Waste & Recycling, Coordinated with Verifiable Integrity.
          </h1>
          <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
            Tell ReCircuit what you want to dispose of. Our autonomous agent matches certified recyclers, checks live doorstep collection tariffs, constructs an optimal split routing plan, and submits portal bookings only after your explicit human approval.
          </p>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Intake Controls */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">1</span>
              Household Disposal Request
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  What items do you have?
                </label>
                <textarea
                  data-testid="intake-text-input"
                  rows={3}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                  placeholder="e.g. 1 old Dell laptop, 5 kg cardboard boxes, and 2 AA batteries"
                />
              </div>

              {/* Sample Prompts */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setInputText("1 old Dell laptop")}
                  className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  💻 Laptop Only (TC1)
                </button>
                <button
                  type="button"
                  onClick={() => setInputText("1 stack of newspapers and 2 household AA batteries")}
                  className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  📰 Paper + Battery (TC2)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputText("1 old Dell laptop");
                    setFeeCap("100");
                  }}
                  className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  ⚠️ Over-Budget ₹100 (TC3)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Pickup Fee Limit (₹)
                  </label>
                  <input
                    type="number"
                    value={feeCap}
                    onChange={(e) => setFeeCap(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. 300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Pincode
                  </label>
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Locality / Area
                </label>
                <input
                  type="text"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2">
                <button
                  data-testid="generate-plan-button"
                  type="button"
                  onClick={handlePlan}
                  disabled={loading || !inputText.trim()}
                  className="w-full py-3 px-4 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-md flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span>Routing with Verified Policies...</span>
                  ) : (
                    <span>Match Recyclers & Generate Plan</span>
                  )}
                </button>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Household Contact Details (Used for Booker) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Pickup Address & Contact Details
            </h3>
            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-slate-600 mb-0.5">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded p-1.5 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-0.5">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded p-1.5 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-0.5">Street Address</label>
                <input
                  type="text"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded p-1.5 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Routing Plan, Matrix & Approval */}
        <div className="lg:col-span-7 space-y-6">
          {!planData ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
              <div className="text-4xl mb-3">📦</div>
              <h3 className="text-base font-semibold text-slate-700">No Routing Plan Generated Yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Enter your items on the left and click "Match Recyclers & Generate Plan" to run autonomous material classification and policy routing.
              </p>
            </div>
          ) : (
            <>
              {/* Live Eligibility Matrix */}
              {matrix && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center justify-between">
                    <span>Live Recycler Policy Eligibility Matrix</span>
                    <span className="text-xs font-normal text-slate-500">Autonomous Policy Matching</span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                          <th className="py-2 px-3">Item / Category</th>
                          <th className="py-2 px-3">Deccan E-Cycle</th>
                          <th className="py-2 px-3">PaperPlus Kabadi</th>
                          <th className="py-2 px-3">QuickScrap Hyd</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {intakeItems.map((item) => {
                          const deccanCell = matrix.cells.find((c) => c.itemId === item.id && c.recyclerId === "deccan");
                          const paperCell = matrix.cells.find((c) => c.itemId === item.id && c.recyclerId === "paperplus");
                          const quickCell = matrix.cells.find((c) => c.itemId === item.id && c.recyclerId === "quickscrap");

                          return (
                            <tr key={item.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-medium text-slate-900">
                                {item.rawText}
                                <span className="block text-[10px] text-slate-400 capitalize">
                                  {item.category.replace(/_/g, " ")} · {item.quantity} qty
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  deccanCell?.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-800" :
                                  deccanCell?.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
                                }`}>
                                  {deccanCell?.status || "UNKNOWN"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  paperCell?.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-800" :
                                  paperCell?.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
                                }`}>
                                  {paperCell?.status || "UNKNOWN"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  quickCell?.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-800" :
                                  quickCell?.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
                                }`}>
                                  {quickCell?.status || "UNKNOWN"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Proposed Split Routing Plan */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Proposed Reverse-Logistics Plan
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Hash: {planData.planHash.slice(0, 16)}...
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">Total Est. Fee</span>
                    <span className="text-lg font-bold text-slate-900">₹{planData.totalEstimatedFee}</span>
                  </div>
                </div>

                {/* Plan Legs Breakdown */}
                <div className="space-y-3">
                  {planData.legs.map((leg, idx) => (
                    <div key={leg.id} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-slate-900">
                          Leg {idx + 1}: {leg.recyclerName}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded font-medium bg-emerald-100 text-emerald-800">
                          Pickup Fee: ₹{leg.estimatedFee}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Assigned Items ({leg.itemIds.length}):{" "}
                        {leg.itemIds
                          .map((id) => intakeItems.find((i) => i.id === id)?.rawText || id)
                          .join(", ")}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Unrouted / Rejections Warning */}
                {approvalCard?.unroutedItems && approvalCard.unroutedItems.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                    <span className="font-bold flex items-center gap-1">
                      ⚠️ Partially Routed Request — Excluded Items:
                    </span>
                    {approvalCard.unroutedItems.map((un: any, i: number) => (
                      <p key={i} className="pl-4">
                        • <span className="font-medium">{un.description}</span>: {un.reasons}
                      </p>
                    ))}
                  </div>
                )}

                {/* Mandatory Approval Warnings (e.g. Budget Escalation) */}
                {approvalCard?.approvalReasons && approvalCard.approvalReasons.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1">
                    <span className="font-bold flex items-center gap-1">
                      🚨 Approval Escalation Conditions:
                    </span>
                    {approvalCard.approvalReasons.map((r: any, i: number) => (
                      <p key={i} className="pl-4">
                        • {r.message}
                      </p>
                    ))}
                  </div>
                )}

                {/* Human Approval Controls (Stage 6) */}
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Human Approval & Slot Preferences
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Preferred Pickup Date
                      </label>
                      <select
                        value={slotDay}
                        onChange={(e) => setSlotDay(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="earliest">Earliest Available</option>
                        <option value="2026-10-22">Tomorrow (2026-10-22)</option>
                        <option value="2026-10-23">Friday (2026-10-23)</option>
                        <option value="2026-10-25">Sunday (2026-10-25)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Time Window
                      </label>
                      <select
                        value={slotWindow}
                        onChange={(e) => setSlotWindow(e.target.value as any)}
                        className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="morning">Morning (09:00 - 13:00 IST)</option>
                        <option value="afternoon">Afternoon (14:00 - 18:00 IST)</option>
                        <option value="any">Any Time</option>
                      </select>
                    </div>
                  </div>

                  {/* Certified Data Wipe Ack */}
                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dataWipeAck}
                      onChange={(e) => setDataWipeAck(e.target.checked)}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-slate-700">
                      I acknowledge that all computing devices will undergo secure data destruction per ISO 27001 / R2 standards.
                    </span>
                  </label>

                  {/* Human Decision Buttons */}
                  <div className="flex gap-3 pt-3">
                    <button
                      data-testid="approve-plan-button"
                      type="button"
                      onClick={handleApproveAndBook}
                      disabled={bookingLoading}
                      className="flex-1 py-3 px-4 rounded-lg bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-md flex items-center justify-center gap-2"
                    >
                      {bookingLoading ? (
                        <span>Executing Portal Bookings...</span>
                      ) : (
                        <span>Approve & Book Pickup</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlanData(null);
                        setApprovalCard(null);
                      }}
                      disabled={bookingLoading}
                      className="py-3 px-4 rounded-lg bg-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-300 disabled:opacity-50 transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

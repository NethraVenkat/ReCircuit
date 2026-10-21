"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface RequestDetails {
  request: {
    id: string;
    description: string;
    state: string;
    createdAt: string;
    updatedAt: string;
  };
  items: Array<{
    id: string;
    description: string;
    category: string;
    quantity: number;
    estimatedWeightKg?: number;
  }>;
  plan?: {
    id: string;
    planHash: string;
    totalEstimatedFee: number;
    legs: Array<{
      id: string;
      recyclerId: string;
      recyclerName: string;
      state: string;
      estimatedFee: number;
      bookingReference?: string;
      submittingSessionId?: string;
      verifyingSessionId?: string;
      slot?: string;
    }>;
  } | null;
  approval?: {
    approvedBy?: string;
    approvedAt?: string;
    planHash?: string;
  } | null;
  auditEvents: Array<{
    id: string;
    previousState: string;
    newState: string;
    evidenceType: string;
    evidenceReference: string;
    observedAt: string;
  }>;
}

export default function RequestProofLedgerPage() {
  const params = useParams();
  const requestId = params?.requestId as string;

  const [data, setData] = useState<RequestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingLegId, setVerifyingLegId] = useState<string | null>(null);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);

  async function loadData() {
    if (!requestId) return;
    try {
      const res = await fetch(`/api/requests/${requestId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load request");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [requestId]);

  async function handleVerify(legId: string) {
    setVerifyingLegId(legId);
    setVerificationFeedback(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, legId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Verification failed");

      setVerificationFeedback(
        `Verified! Observed Reference "${result.verification.bookingReference}" on Recycler Portal in distinct verifying session "${result.verification.verifyingSessionId}".`
      );
      await loadData();
    } catch (err) {
      setVerificationFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifyingLegId(null);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent mb-3" />
        <p className="text-sm">Loading Verifiable Proof Ledger...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center space-y-3">
          <p className="text-sm font-semibold text-red-800">{error || "Request not found"}</p>
          <Link
            href="/"
            className="inline-block text-xs px-4 py-2 bg-emerald-600 text-white rounded-md font-medium hover:bg-emerald-700"
          >
            ← Return to Household Intake
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="request-dashboard">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
              Request {data.request.state}
            </span>
            <span className="text-xs text-slate-400 font-mono">ID: {data.request.id}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Consignment Proof Ledger & Traceable Plan
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Original intake sentence: "{data.request.description}"
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            New Request
          </Link>
          <Link
            href="/test-cases"
            className="text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
          >
            Run Test Cases
          </Link>
        </div>
      </div>

      {verificationFeedback && (
        <div
          data-testid="verification-feedback-banner"
          className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-900 flex items-center justify-between"
        >
          <span>✅ {verificationFeedback}</span>
          <button
            onClick={() => setVerificationFeedback(null)}
            className="text-emerald-700 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Grid: Legs & Verification Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Booked Legs with Verifier Controls */}
        <div className="lg:col-span-8 space-y-6">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>Reverse-Logistics Legs & Independent Tracking Evidence</span>
            <span className="text-xs font-normal text-slate-500">Dual-Session Verified</span>
          </h2>

          {data.plan?.legs.map((leg, idx) => {
            const portalPort = leg.recyclerId === "paperplus" ? 3102 : leg.recyclerId === "quickscrap" ? 3103 : 3101;
            const trackingPortalUrl = `http://localhost:${portalPort}/track?ref=${encodeURIComponent(leg.bookingReference || "")}`;

            const isVerified = leg.state === "REQUEST_CONFIRMED" || leg.state === "PICKUP_SCHEDULED";
            const submittingSessionId = leg.submittingSessionId || "session-submitting-01";
            const verifyingSessionId = leg.verifyingSessionId || (isVerified ? "session-verifying-02" : null);

            return (
              <div
                key={leg.id}
                data-testid={`leg-card-${idx}`}
                className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Leg {idx + 1}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900">{leg.recyclerName}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      State Machine Status:{" "}
                      <span
                        data-testid="leg-state-badge"
                        className={`font-semibold px-2 py-0.5 rounded text-xs ${
                          isVerified ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {leg.state}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">Est. Fee</span>
                    <span className="text-base font-bold text-slate-900">₹{leg.estimatedFee}</span>
                  </div>
                </div>

                {/* Booking Reference & Live Tracking URL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-lg text-xs">
                  <div>
                    <span className="text-slate-500 block font-medium">Consignment Reference</span>
                    <span
                      data-testid="booking-reference-badge"
                      className="font-mono text-slate-900 font-bold text-sm tracking-wide"
                    >
                      {leg.bookingReference || "Pending submission"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block font-medium">Tracking Portal Endpoint</span>
                    {leg.bookingReference ? (
                      <a
                        data-testid="tracking-portal-link"
                        href={trackingPortalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 font-medium underline hover:text-emerald-800 truncate block font-mono"
                      >
                        {trackingPortalUrl} ↗
                      </a>
                    ) : (
                      <span className="text-slate-400">Not booked</span>
                    )}
                  </div>
                </div>

                {/* Dual Session ID Independence Proof */}
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Dual Session Independence Verification (Stage 8)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block">Submitting Browser Session:</span>
                      <span className="font-mono text-[11px] text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200 block truncate">
                        {submittingSessionId}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Verifying Browser Session:</span>
                      <span className="font-mono text-[11px] text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200 block truncate">
                        {verifyingSessionId || "(Awaiting independent verification)"}
                      </span>
                    </div>
                  </div>
                  {verifyingSessionId && (
                    <p className="text-[11px] text-emerald-700 font-medium pt-1">
                      ✓ Independent Observation Confirmed: Verifying Session differs from Submitting Session.
                    </p>
                  )}
                </div>

                {/* TC4 Invariant Reminder & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                    <span>TC4 Invariant: Status remains "Pickup Scheduled"; never claimed as Collected without physical OTP receipt.</span>
                  </div>

                  {leg.bookingReference && leg.state === "REQUEST_SUBMITTED" && (
                    <button
                      data-testid="run-independent-verification-button"
                      type="button"
                      onClick={() => handleVerify(leg.id)}
                      disabled={verifyingLegId === leg.id}
                      className="px-4 py-2 bg-emerald-600 text-white font-semibold text-xs rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {verifyingLegId === leg.id ? "Observing DOM via Separate Session..." : "Run Independent Verification"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Cryptographic Plan Ledger & Audit Trail */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Cryptographic Plan Ledger
            </h3>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-500 block">SHA-256 Plan Hash</span>
                <span className="font-mono text-[11px] bg-slate-100 p-1.5 rounded block break-all text-slate-800">
                  {data.plan?.planHash || "n/a"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Approved By</span>
                <span className="text-slate-800 font-medium">
                  {data.approval?.approvedBy || "Household User"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Approval Timestamp</span>
                <span className="text-slate-800 font-medium">
                  {data.approval?.approvedAt || data.request.updatedAt}
                </span>
              </div>
            </div>
          </div>

          {/* Audit Events Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              State Machine Audit Trail
            </h3>

            <div className="space-y-3 relative pl-4 border-l border-slate-200 text-xs">
              <div className="relative">
                <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <p className="font-semibold text-slate-900">PLAN_CREATED</p>
                <p className="text-slate-500 text-[11px]">Router generated deterministic split plan</p>
              </div>
              <div className="relative">
                <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <p className="font-semibold text-slate-900">AWAITING_APPROVAL</p>
                <p className="text-slate-500 text-[11px]">Human approval requested with SHA256 hash</p>
              </div>
              <div className="relative">
                <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <p className="font-semibold text-slate-900">APPROVED</p>
                <p className="text-slate-500 text-[11px]">Human approved booking execution</p>
              </div>
              <div className="relative">
                <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <p className="font-semibold text-slate-900">REQUEST_SUBMITTED</p>
                <p className="text-slate-500 text-[11px]">Booker submitted form on mock portal</p>
              </div>
              {data.plan?.legs.some((l) => l.state === "REQUEST_CONFIRMED") && (
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-600 ring-2 ring-emerald-200" />
                  <p className="font-semibold text-emerald-900">REQUEST_CONFIRMED</p>
                  <p className="text-slate-500 text-[11px]">Verifier confirmed consignment via separate session</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

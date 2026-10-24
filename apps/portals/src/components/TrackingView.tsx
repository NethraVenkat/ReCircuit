"use client";
import { RecyclingLoader } from "../../../../packages/ui/recycling-loader";
import { bookingStatusLabel } from "../lib/status-presentation";

import React, { useState, useEffect, useRef } from "react";
import type { PortalBooking, RecyclerId } from "@/lib/types";
import { PortalFeedback } from "./PortalFeedback";
import { TrackingSlotDetails } from "./TrackingSlotDetails";
import { trackingEventMessage } from "../lib/tracking-slots";

interface TrackingViewProps {
  recyclerId: RecyclerId;
  initialReference?: string;
  initialClientRequestId?: string;
}

export function TrackingView({
  recyclerId,
  initialReference = "",
  initialClientRequestId = "",
}: TrackingViewProps): JSX.Element {
  const [reference, setReference] = useState(initialReference);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<PortalBooking | null>(null);
  const [searched, setSearched] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [requestError, setRequestError] = useState("");
  const sequence = useRef(0);

  const fetchTracking = async (ref: string, clientId: string = ""): Promise<void> => {
    if (!ref.trim() && !clientId.trim()) return;
    const current = ++sequence.current;
    setLoading(true);
    setRequestError("");
    setNotFound(false);
    setSearched(true);

    try {
      let effectiveTenant = recyclerId;
      if (ref.trim().toUpperCase().startsWith("DEC-")) effectiveTenant = "deccan";
      else if (ref.trim().toUpperCase().startsWith("PPK-")) effectiveTenant = "paperplus";
      else if (ref.trim().toUpperCase().startsWith("QSH-")) effectiveTenant = "quickscrap";
      const isPrefixed = typeof window !== "undefined" && window.location.pathname.startsWith("/portal/");
      const apiPrefix = isPrefixed ? `/portal/${effectiveTenant}` : "";
      const url = ref.trim()
        ? `${apiPrefix}/api/bookings?ref=${encodeURIComponent(ref.trim())}`
        : `${apiPrefix}/api/bookings?client=${encodeURIComponent(clientId.trim())}`;
      const res = await fetch(url, {
        headers: { "x-recycler-id": effectiveTenant },
      });
      if (current !== sequence.current) return;
      if (res.status !== 404 && !res.ok) throw new Error(`Tracking lookup returned HTTP ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        if (data.booking) {
          setBooking(data.booking as PortalBooking);
          setNotFound(false);
          setLoading(false);
          return;
        }
      }
      if (res.ok) throw new Error("Tracking response contained no booking record");
      setBooking(null); setNotFound(true);
    } catch (error) {
      if (current !== sequence.current) return;
      setBooking(null); setNotFound(false); setRequestError(error instanceof Error ? error.message : "Network request failed");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (initialReference) {
      fetchTracking(initialReference, "");
    } else if (initialClientRequestId) {
      fetchTracking("", initialClientRequestId);
    }
  }, [initialReference, initialClientRequestId]);

  const handleSearch = (e: React.FormEvent): void => {
    e.preventDefault();
    fetchTracking(reference);
  };

  return (
    <div className="portal-tracking-view space-y-6" aria-busy={loading}>
      <form onSubmit={handleSearch} className="portal-tracking-search">
        <div><label htmlFor="search_reference">Booking reference</label><input id="search_reference" type="text" data-testid="input-reference" required autoComplete="off" value={reference} onChange={e => setReference(e.target.value)} placeholder={`e.g. ${{deccan:"DEC",paperplus:"PPK",quickscrap:"QSH"}[recyclerId]}-12345`} className="px-4 py-2 border rounded-sm text-slate-900 bg-white font-sans"/></div>
        <button type="submit" data-testid="submit-track" disabled={loading} className="portal-button">{loading ? "Checking…" : "Track booking"}</button>
      </form>
      {!searched && <p className="text-sm">Enter the reference saved when your request was submitted. A requested slot is not a dispatcher assignment.</p>}
      {loading && <RecyclingLoader label="Finding your booking..."/>}
      {requestError && <PortalFeedback message={requestError} title="The tracking service could not return a result. This does not establish that your booking is missing."/>}

      {/* 404 / Not Found message */}
      {notFound && searched && (
        <div
          data-testid="not-found-message"
          className="p-6 rounded-sm border border-red-200 bg-red-50 text-red-900 text-sm max-w-xl"
        >
          <div className="flex items-center space-x-2 font-bold text-base text-red-700 mb-1">
            <span>⚠️</span>
            <span>No booking found</span>
          </div>
          <p>
            We could not find any saved booking with reference{" "}
            <span className="font-sans font-bold">{reference}</span>. Please verify the reference code and try again.
          </p>
        </div>
      )}

      {/* Found Booking Details */}
      {booking && (
        <div
          data-testid="tracking-result"
          className="p-6 rounded-lg border bg-white shadow-xs space-y-6 text-slate-900"
        >
          <p className="portal-notice">This is the saved recycler status. A received or confirmed request is not evidence of collection. Simulated downstream events are labelled in the history.</p>
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between border-b pb-4 gap-4">
            <div>
              <span className="text-xs text-slate-500 font-semibold block uppercase tracking-wider">
                Booking reference
              </span>
              <span
                data-testid="booking-reference"
                className="text-2xl font-black font-sans tracking-wider text-slate-900"
              >
                {booking.bookingReference}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 font-semibold block uppercase tracking-wider">
                Current status
              </span>
              <span
                data-testid="tracking-status"
                className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                  booking.status === "PICKED_UP" || booking.status === "WEIGHED"
                    ? "bg-green-100 text-green-800 border border-green-300"
                    : booking.status === "SCHEDULED" || booking.status === "CONFIRMED"
                    ? "bg-green-100 text-green-800 border border-green-300"
                    : "bg-amber-100 text-amber-800 border border-amber-300"
                }`}
              >
                {bookingStatusLabel(booking)}
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-bold text-slate-500 block">Customer name</span>
              <span className="font-semibold text-slate-800 text-sm">{booking.fullName}</span>
            </div>
            <div>
              <span className="font-bold text-slate-500 block">Contact phone</span>
              <span className="font-semibold text-slate-800 text-sm font-sans">{booking.phone}</span>
            </div>
            <div>
              <span className="font-bold text-slate-500 block">Address & locality</span>
              <span className="font-semibold text-slate-800 text-sm">
                {booking.addressLine}, {booking.locality} ({booking.pincode})
              </span>
            </div>
            <TrackingSlotDetails booking={booking}/>
            {booking.pickupOtp && (
              <div>
                <span className="font-bold text-emerald-700 block">Pickup collection code</span>
                <span className="font-black text-emerald-900 text-sm font-sans">{booking.pickupOtp}</span>
              </div>
            )}
            {booking.weightKg !== undefined && (
              <div>
                <span className="font-bold text-emerald-700 block">Recorded depot weight</span>
                <span className="font-black text-emerald-900 text-sm">{booking.weightKg} kg</span>
              </div>
            )}
          </div>

          {/* Items List */}
          <div data-testid="tracking-fee">
            Pickup fee: {booking.chargedFeeInr == null ? "UNKNOWN" : `₹${booking.chargedFeeInr}`}
          </div>
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Booked items</h4>
            <div data-testid="tracking-items-list" className="border rounded-sm divide-y text-xs">
              {(booking.items || []).map((item, i) => (
                <div key={i} data-testid="tracking-item-row" className="p-2.5 flex justify-between bg-slate-50/50">
                  <span data-testid="tracking-item-name" className="font-bold">{item.name}</span>
                  <span data-testid="tracking-item-details" className="text-slate-600">
                    {item.quantity ? `Qty: ${item.quantity}` : ""}
                    {item.weightKg ? ` · Weight: ${item.weightKg} kg` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {booking.provenance && <details><summary>Record provenance</summary><pre>{JSON.stringify(booking.provenance, null, 2)}</pre></details>}
          {/* Historical Timeline */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-3">
              Collection history
            </h4>
            <div data-testid="tracking-history" className="space-y-2 border-l-2 border-slate-200 pl-4 ml-2">
              {(booking.events || []).map((evt) => (
                <div key={evt.id} className="relative pb-2">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{bookingStatusLabel({ ...booking, status: evt.status })}</span>
                    <span className="text-[11px] text-slate-400 font-sans">
                      {new Date(evt.createdAt).toLocaleString()}
                    </span>
                    {evt.isSimulated && (
                      <span
                        data-testid="simulated-event-badge"
                        className="px-2 py-0.5 rounded-sm text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-900 border border-slate-300"
                      >
                        Simulated event
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{trackingEventMessage(evt).replace(/\s*\(SIMULATED DOWNSTREAM EVENT\)/g, "")}</p>
                  <details><summary>Event details</summary><p>{evt.eventType} · {evt.status}</p><p>{trackingEventMessage(evt)}</p></details>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


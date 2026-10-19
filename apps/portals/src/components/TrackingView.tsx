"use client";

import React, { useState, useEffect } from "react";
import type { PortalBooking, RecyclerId } from "@/lib/types";

interface TrackingViewProps {
  recyclerId: RecyclerId;
  initialReference?: string;
  initialClientRequestId?: string;
}

export function TrackingView({
  recyclerId: _recyclerId,
  initialReference = "",
  initialClientRequestId = "",
}: TrackingViewProps): JSX.Element {
  const [reference, setReference] = useState(initialReference);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<PortalBooking | null>(null);
  const [searched, setSearched] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const fetchTracking = async (ref: string, clientId: string = ""): Promise<void> => {
    if (!ref.trim() && !clientId.trim()) return;
    setLoading(true);
    setNotFound(false);
    setSearched(true);

    try {
      const url = ref.trim()
        ? `/api/bookings?ref=${encodeURIComponent(ref.trim())}`
        : `/api/bookings?client=${encodeURIComponent(clientId.trim())}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.booking) {
          setBooking(data.booking as PortalBooking);
          setNotFound(false);
          setLoading(false);
          return;
        }
      }
      setBooking(null);
      setNotFound(true);
    } catch {
      setBooking(null);
      setNotFound(true);
    } finally {
      setLoading(false);
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
    <div className="space-y-6">
      {/* Search Input Box */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-xl">
        <label htmlFor="search_reference" className="sr-only">Booking Reference</label>
        <input
          id="search_reference"
          type="text"
          data-testid="input-reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Enter Booking Reference (e.g. DEC-12345)"
          className="flex-1 px-4 py-2 border rounded text-sm text-slate-900 bg-white font-mono font-bold"
        />
        <button
          type="submit"
          data-testid="submit-track"
          disabled={loading}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded shadow"
        >
          {loading ? "Tracking..." : "Track"}
        </button>
      </form>

      {/* 404 / Not Found message */}
      {notFound && searched && (
        <div
          data-testid="not-found-message"
          className="p-6 rounded border border-red-200 bg-red-50 text-red-900 text-sm max-w-xl"
        >
          <div className="flex items-center space-x-2 font-bold text-base text-red-700 mb-1">
            <span>⚠️</span>
            <span>No booking found</span>
          </div>
          <p>
            We could not find any active booking with reference{" "}
            <span className="font-mono font-bold">{reference}</span>. Please verify the reference code and try again.
          </p>
        </div>
      )}

      {/* Found Booking Details */}
      {booking && (
        <div
          data-testid="tracking-result"
          className="p-6 rounded-lg border bg-white shadow-sm space-y-6 text-slate-900"
        >
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between border-b pb-4 gap-4">
            <div>
              <span className="text-xs text-slate-500 font-semibold block uppercase tracking-wider">
                Booking Reference
              </span>
              <span
                data-testid="booking-reference"
                className="text-2xl font-black font-mono tracking-wider text-slate-900"
              >
                {booking.bookingReference}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 font-semibold block uppercase tracking-wider">
                Current Status
              </span>
              <span
                data-testid="tracking-status"
                className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                  booking.status === "PICKED_UP" || booking.status === "WEIGHED"
                    ? "bg-green-100 text-green-800 border border-green-300"
                    : booking.status === "SCHEDULED" || booking.status === "CONFIRMED"
                    ? "bg-blue-100 text-blue-800 border border-blue-300"
                    : "bg-amber-100 text-amber-800 border border-amber-300"
                }`}
              >
                {booking.status}
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-bold text-slate-500 block">Customer Name</span>
              <span className="font-semibold text-slate-800 text-sm">{booking.fullName}</span>
            </div>
            <div>
              <span className="font-bold text-slate-500 block">Contact Phone</span>
              <span className="font-semibold text-slate-800 text-sm font-mono">{booking.phone}</span>
            </div>
            <div>
              <span className="font-bold text-slate-500 block">Address & Locality</span>
              <span className="font-semibold text-slate-800 text-sm">
                {booking.addressLine}, {booking.locality} ({booking.pincode})
              </span>
            </div>
            <div>
              <span className="font-bold text-slate-500 block">Assigned / Preferred Slot</span>
              <span className="font-semibold text-slate-800 text-sm font-mono">{booking.preferredSlot}</span>
            </div>
            {booking.pickupOtp && (
              <div>
                <span className="font-bold text-emerald-700 block">Pickup OTP Code</span>
                <span className="font-black text-emerald-900 text-sm font-mono">{booking.pickupOtp}</span>
              </div>
            )}
            {booking.weightKg !== undefined && (
              <div>
                <span className="font-bold text-emerald-700 block">Verified Depot Weight</span>
                <span className="font-black text-emerald-900 text-sm">{booking.weightKg} kg</span>
              </div>
            )}
          </div>

          {/* Items List */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Booked Items</h4>
            <div data-testid="tracking-items-list" className="border rounded divide-y text-xs">
              {booking.items.map((item, i) => (
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

          {/* Historical Timeline */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-3">
              Status Event History & Proof Audit
            </h4>
            <div data-testid="tracking-history" className="space-y-2 border-l-2 border-slate-200 pl-4 ml-2">
              {booking.events.map((evt) => (
                <div key={evt.id} className="relative pb-2">
                  <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-400" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 uppercase font-mono">{evt.status}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(evt.createdAt).toLocaleString()}
                    </span>
                    {evt.isSimulated && (
                      <span
                        data-testid="simulated-event-badge"
                        className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-300"
                      >
                        SIMULATED DOWNSTREAM EVENT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{evt.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


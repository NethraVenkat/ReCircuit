import { bookingStatusLabel } from "../lib/status-presentation";
import React from "react";
import Link from "next/link";
import type { PortalBooking } from "../lib/types";
import { trackingSlots } from "../lib/tracking-slots";

export function BookingConfirmation({ booking, reference, duplicate, trackPath }: { booking: PortalBooking | null; reference: string; duplicate: boolean; trackPath: string }): JSX.Element {
  if (!booking) return <section className="portal-card space-y-5"><h2 className="text-2xl font-bold">Booking confirmation unavailable</h2>
    <div className="portal-notice portal-notice--warning" role="status"><p>{reference ? "No saved booking matches this reference. This page cannot confirm that a request was received." : "A booking reference was not returned. The submission outcome needs review; do not submit again until it is reconciled."}</p></div>
    {reference ? <p>Requested reference: <strong className="font-mono">{reference}</strong></p> : <p data-testid="booking-reference-missing">Booking reference unavailable</p>}
    <p>Opening a confirmation URL is not evidence of a booking, assigned slot or collection.</p><div className="portal-actions"><Link className="portal-button" href={trackPath}>Check booking status</Link><Link className="portal-button portal-button--secondary" href="/">Return home</Link></div>
  </section>;
  const slots = trackingSlots(booking);
  return <section className="portal-card space-y-6"><div><p className="text-sm text-slate-600 mb-2">Saved recycler record</p><h2 className="text-2xl font-bold">Booking request recorded</h2><p className="mt-2 text-slate-600">Check the recorded status below. A request is not evidence that items have been collected.</p></div>
    {duplicate && <div data-testid="duplicate-notice" className="portal-notice">This reference already identifies a saved request. Viewing this page does not submit another booking.</div>}
    <dl className="portal-facts"><div><dt>Booking reference</dt><dd data-testid="booking-reference" className="text-2xl font-mono">{booking.bookingReference}</dd></div><div><dt>Recorded status</dt><dd><span data-testid="confirmation-status" className="portal-status">{bookingStatusLabel(booking)}</span></dd></div><div><dt>Requested slot</dt><dd>{slots.requestedSlot || "Not recorded"}</dd></div><div><dt>Assigned slot</dt><dd>{slots.assignedSlot || "Not assigned"}</dd></div><div><dt>Recorded pickup fee</dt><dd>{booking.chargedFeeInr == null ? "Not recorded" : `₹${booking.chargedFeeInr}`}</dd></div><div><dt>Pickup address</dt><dd>{booking.addressLine}, {booking.locality} · {booking.pincode}</dd></div></dl>
    <section><h3 className="text-lg font-bold mb-3">Booked items</h3><ul className="space-y-3">{booking.items.map((item, i) => <li className="border rounded-lg p-4 bg-slate-50 text-slate-900" key={i}><strong>{item.name}</strong><p className="mt-1 text-sm text-slate-600">Quantity: {item.quantity ?? "Not recorded"} · Total row weight: {item.weightKg ?? "Not recorded"} kg</p></li>)}</ul></section>
    <div className="portal-actions"><Link className="portal-button" href={`${trackPath}?ref=${encodeURIComponent(booking.bookingReference)}`}>Track this booking</Link><Link className="portal-button portal-button--secondary" href="/">Return home</Link></div>
  </section>;
}

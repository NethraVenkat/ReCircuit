import React from "react";
import Link from "next/link";
import { DeccanLayout } from "@/components/DeccanLayout";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

interface ConfirmationPageProps {
  searchParams: { ref?: string; dup?: string };
}

export default async function ConfirmationPage({ searchParams }: ConfirmationPageProps): Promise<JSX.Element> {
  const ref = (searchParams.ref || "").trim();
  const isDuplicate = searchParams.dup === "true";

  const repo = getRepository();
  const booking = ref ? await repo.getBookingByReference("deccan", ref) : null;

  return (
    <DeccanLayout activePath="/book-pickup">
      <div className="space-y-6 max-w-2xl">
        <div className="p-6 bg-white border border-emerald-300 rounded-lg shadow-sm space-y-4">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">✅</span>
            <div>
              <h2 className="text-xl font-black text-emerald-950">Pickup Request Successfully Logged</h2>
              <p className="text-xs text-emerald-700 font-semibold">
                Deccan E-Cycle Dispatch Center has received your submission.
              </p>
            </div>
          </div>

          {isDuplicate && (
            <div
              data-testid="duplicate-notice"
              className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded font-bold"
            >
              ℹ️ This request was already received. Returning existing booking details.
            </div>
          )}

          {/* Reference Element with data-testid="booking-reference" */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 block mb-1">
              Official Booking Reference
            </span>
            {ref ? (
              <span
                data-testid="booking-reference"
                className="text-3xl font-black font-mono text-emerald-950 tracking-widest block"
              >
                {ref}
              </span>
            ) : (
              <span
                data-testid="booking-reference-missing"
                className="text-sm font-bold text-red-600 block italic"
              >
                [Notice: Reference omitted by system directive]
              </span>
            )}
          </div>

          {/* Booking Summary */}
          <div className="space-y-2 text-xs border-t pt-4">
            <div className="flex justify-between py-1 border-b">
              <span className="text-slate-500 font-semibold">Portal Status:</span>
              <span data-testid="confirmation-status" className="font-black text-emerald-800 uppercase">
                {booking?.status || "Received"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-slate-500 font-semibold">Assigned Time Window:</span>
              <span className="font-semibold text-slate-800">{booking?.preferredSlot || "As Selected"}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-semibold">Collection Locality:</span>
              <span className="font-semibold text-slate-800">
                {booking ? `${booking.locality} (${booking.pincode})` : "Hyderabad"}
              </span>
            </div>
          </div>

          {booking?.items && booking.items.length > 0 && (
            <div className="border rounded p-3 bg-slate-50 text-xs space-y-1">
              <span className="font-bold text-slate-700 block mb-1">Booked Consignment Items:</span>
              {booking.items.map((it, idx) => (
                <div key={idx} className="flex justify-between text-slate-600">
                  <span>{it.name}</span>
                  <span>{it.quantity ? `Qty: ${it.quantity}` : `${it.weightKg} kg`}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 flex justify-between items-center">
            {ref && (
              <Link
                href={`/track?ref=${encodeURIComponent(ref)}`}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline"
              >
                Go to Tracking Page →
              </Link>
            )}
            <Link
              href="/"
              className="text-xs text-slate-500 hover:text-slate-800 font-medium"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    </DeccanLayout>
  );
}


import React from "react";
import Link from "next/link";
import { PaperPlusLayout } from "@/components/PaperPlusLayout";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

interface DonePageProps {
  searchParams: { ref?: string; dup?: string };
}

export default async function ScheduleDonePage({ searchParams }: DonePageProps): Promise<JSX.Element> {
  const ref = (searchParams.ref || "").trim();
  const isDuplicate = searchParams.dup === "true";

  const repo = getRepository();
  const booking = ref ? await repo.getBookingByReference("paperplus", ref) : null;

  return (
    <PaperPlusLayout activePath="/schedule">
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="p-6 bg-white border-2 border-amber-400 rounded-lg shadow space-y-4">
          <div className="text-center space-y-1">
            <span className="text-4xl block">🎉</span>
            <h2 className="text-2xl font-black text-amber-950">Pickup Scheduled Successfully!</h2>
            <p className="text-xs text-amber-800 font-semibold">
              Our paper collection team will visit your location during the chosen slot.
            </p>
          </div>

          {isDuplicate && (
            <div
              data-testid="duplicate-notice"
              className="p-3 bg-amber-100 border border-amber-400 text-amber-950 text-xs rounded font-bold"
            >
              ℹ️ This request was already received. Returning existing booking details.
            </div>
          )}

          {/* Reference Element */}
          <div className="p-5 bg-amber-50 border-2 border-dashed border-amber-300 rounded text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 block mb-1">
              Your PaperPlus Reference
            </span>
            {ref ? (
              <span
                data-testid="booking-reference"
                className="text-3xl font-black font-mono text-amber-900 tracking-wider block"
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

          {/* Summary */}
          <div className="space-y-2 text-xs border-t border-amber-200 pt-4">
            <div className="flex justify-between py-1 border-b border-amber-100">
              <span className="text-amber-800 font-bold">Status:</span>
              <span data-testid="confirmation-status" className="font-black text-amber-900 uppercase">
                {booking?.status || "Received"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-amber-100">
              <span className="text-amber-800 font-bold">Slot Window:</span>
              <span className="font-semibold text-slate-800">{booking?.preferredSlot || "As Selected"}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-amber-800 font-bold">Address:</span>
              <span className="font-semibold text-slate-800">
                {booking ? `${booking.addressLine}, ${booking.locality} (${booking.pincode})` : "Hyderabad"}
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-between items-center text-xs">
            {ref && (
              <Link
                href={`/status?ref=${encodeURIComponent(ref)}`}
                className="font-bold text-amber-800 hover:text-amber-950 underline"
              >
                Check Pickup Status →
              </Link>
            )}
            <Link href="/" className="text-amber-700 hover:text-amber-950 font-semibold">
              Return Home
            </Link>
          </div>
        </div>
      </div>
    </PaperPlusLayout>
  );
}


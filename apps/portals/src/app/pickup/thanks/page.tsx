import React from "react";
import Link from "next/link";
import { QuickScrapLayout } from "@/components/QuickScrapLayout";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

interface ThanksPageProps {
  searchParams: { ref?: string; dup?: string };
}

export default async function ThanksPage({ searchParams }: ThanksPageProps): Promise<JSX.Element> {
  const ref = (searchParams.ref || "").trim();
  const isDuplicate = searchParams.dup === "true";

  const repo = getRepository();
  const booking = ref ? await repo.getBookingByReference("quickscrap", ref) : null;

  return (
    <QuickScrapLayout activePath="/pickup">
      <div className="space-y-6 max-w-2xl mx-auto font-mono">
        <div className="p-6 bg-slate-900 border border-slate-800 rounded space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-lg font-bold uppercase text-white tracking-wider flex items-center space-x-2">
              <span className="text-orange-500">▶</span>
              <span>Pickup Order Transmitted</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">QuickScrap aggregator dispatch engine has queued your order.</p>
          </div>

          {isDuplicate && (
            <div
              data-testid="duplicate-notice"
              className="p-3 bg-slate-950 border border-orange-600/70 text-orange-300 text-xs rounded"
            >
              [NOTICE] This request was already received. Returning existing order details.
            </div>
          )}

          {/* Reference Element */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Order Reference
            </span>
            {ref ? (
              <span
                data-testid="booking-reference"
                className="text-3xl font-black font-mono text-orange-500 tracking-widest block"
              >
                {ref}
              </span>
            ) : (
              <span
                data-testid="booking-reference-missing"
                className="text-xs font-bold text-red-400 block"
              >
                [Reference suppressed by failure directive]
              </span>
            )}
          </div>

          <div className="space-y-1.5 text-xs text-slate-300 border-t border-slate-800 pt-3">
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Status:</span>
              <span data-testid="confirmation-status" className="text-white font-bold uppercase">
                {booking?.status || "Received"}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Logistics Fee:</span>
              <span className="text-orange-400 font-bold">₹199 Flat</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Assigned Window:</span>
              <span className="text-slate-200">{booking?.preferredSlot || "As Selected"}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
            {ref && (
              <Link
                href={`/track-order?ref=${encodeURIComponent(ref)}`}
                className="text-orange-400 hover:text-orange-300 underline font-bold uppercase"
              >
                Track Order Status →
              </Link>
            )}
            <Link href="/" className="text-slate-500 hover:text-slate-300 uppercase">
              Home
            </Link>
          </div>
        </div>
      </div>
    </QuickScrapLayout>
  );
}


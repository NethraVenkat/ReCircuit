import React from "react";
import { QuickScrapLayout } from "@/components/QuickScrapLayout";
import { BookingForm } from "@/components/BookingForm";

export const dynamic = "force-dynamic";

export default function PickupPage(): JSX.Element {
  return (
    <QuickScrapLayout activePath="/pickup">
      <div className="space-y-6 max-w-3xl">
        <div className="border-b border-slate-800 pb-3">
          <h2 className="text-xl font-bold uppercase tracking-wider text-white">Quick On-Demand Scrap Pickup</h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Fast doorstep dispatch across Hyderabad · Standard flat fee ₹199
          </p>
        </div>

        <BookingForm recyclerId="quickscrap" />
      </div>
    </QuickScrapLayout>
  );
}


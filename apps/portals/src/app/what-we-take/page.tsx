import React from "react";
import { PaperPlusLayout } from "@/components/PaperPlusLayout";
import { RECYCLER_CONFIGS } from "@/lib/config";

import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function WhatWeTakePage(): Promise<JSX.Element> {
  const config = RECYCLER_CONFIGS.paperplus;
  const repo = getRepository();
  const switches = await repo.getFailureSwitches("paperplus");

  if (switches.hideFeeInfo) {
    return (
      <PaperPlusLayout activePath="/what-we-take">
        <div className="space-y-6">
          <h2 className="text-3xl font-black text-amber-950">What PaperPlus Buys & Full Rate Card</h2>
          <div data-testid="fee-info-hidden" className="p-6 bg-amber-50 border-2 border-amber-300 rounded-sm text-amber-950 text-sm">
            <p className="font-bold">Notice: Rate card updates underway.</p>
            <p className="text-xs mt-1">Scrap paper rates and minimum weight requirements are temporarily unlisted.</p>
          </div>
        </div>
      </PaperPlusLayout>
    );
  }

  return (
    <PaperPlusLayout activePath="/what-we-take">
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-black text-amber-950">What PaperPlus Buys & Full Rate Card</h2>
          <p className="text-sm text-amber-800 font-semibold mt-1">
            Hyderabad's best prices for household paper waste. Doorstep digital weighing!
          </p>
        </div>

        {/* Accepted Items Grid */}
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-amber-900 border-b border-amber-300 pb-2">
            Accepted Paper Scrap Materials
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {config.rates.rateCard.map((entry) => (
              <div key={entry.item} className="bg-white p-5 rounded-lg border-2 border-amber-300 shadow-xs">
                <span className="text-3xl block mb-2">📄</span>
                <h4 className="font-bold text-base text-amber-950">{entry.item}</h4>
                <p className="text-2xl font-black text-amber-700 my-2">{entry.payout}</p>
                <p className="text-xs text-slate-600">Doorstep digital weighing with certified scales</p>
              </div>
            ))}
          </div>
        </div>

        {/* Requirements and Minimums */}
        <div id="rates" className="bg-amber-100/70 p-6 rounded-lg border border-amber-300 space-y-2 text-xs">
          <h3 className="text-base font-bold text-amber-950">Buying & Collection Rules</h3>
          <ul className="space-y-1 list-disc list-inside text-amber-900 font-medium">
            <li>
              <strong>Minimum Weight:</strong> At least {config.rates.minWeightKg} kg total scrap weight is required for home pickup.
            </li>
            <li>
              <strong>Doorstep Pickup:</strong> 100% Free pickup across Kukatpally, Madhapur, and KPHB.
            </li>
            <li>
              <strong>Instant Payment:</strong> Immediate cash or UPI transfer upon weighing.
            </li>
          </ul>
        </div>

        {/* Rejection Notice */}
        <div className="bg-red-50 p-6 rounded-lg border-2 border-red-300 text-red-950 space-y-2">
          <h3 className="text-base font-bold text-red-900">⛔ Materials Strictly Rejected by PaperPlus</h3>
          <p className="text-xs text-red-800">
            {config.rates.rejectedSummary}
          </p>
          <ul className="list-disc list-inside text-xs font-semibold text-red-900 space-y-1">
            {config.rates.rejectedCategories.map((cat) => (
              <li key={cat}>{cat}</li>
            ))}
          </ul>
        </div>
      </div>
    </PaperPlusLayout>
  );
}


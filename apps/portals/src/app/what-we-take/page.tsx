import React from "react";
import { PaperPlusLayout } from "@/components/PaperPlusLayout";

export const dynamic = "force-dynamic";

export default function WhatWeTakePage(): JSX.Element {
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-lg border-2 border-amber-300 shadow-sm">
              <span className="text-3xl block mb-2">📰</span>
              <h4 className="font-bold text-base text-amber-950">Daily Newspapers</h4>
              <p className="text-3xl font-black text-amber-700 my-2">₹12 / kg</p>
              <p className="text-xs text-slate-600">English, Telugu, Hindi newspapers, press supplements</p>
            </div>

            <div className="bg-white p-5 rounded-lg border-2 border-amber-300 shadow-sm">
              <span className="text-3xl block mb-2">📦</span>
              <h4 className="font-bold text-base text-amber-950">Cardboard & Cartons</h4>
              <p className="text-3xl font-black text-amber-700 my-2">₹6 / kg</p>
              <p className="text-xs text-slate-600">Corrugated packaging, brown boxes, e-commerce delivery boxes</p>
            </div>

            <div className="bg-white p-5 rounded-lg border-2 border-amber-300 shadow-sm">
              <span className="text-3xl block mb-2">📚</span>
              <h4 className="font-bold text-base text-amber-950">Old Books & Magazines</h4>
              <p className="text-3xl font-black text-amber-700 my-2">₹10 / kg</p>
              <p className="text-xs text-slate-600">College textbooks, school notebooks, glossy magazines</p>
            </div>
          </div>
        </div>

        {/* Requirements and Minimums */}
        <div id="rates" className="bg-amber-100/70 p-6 rounded-lg border border-amber-300 space-y-2 text-xs">
          <h3 className="text-base font-bold text-amber-950">Buying & Collection Rules</h3>
          <ul className="space-y-1 list-disc list-inside text-amber-900 font-medium">
            <li>
              <strong>Minimum Weight:</strong> At least 5 kg total scrap weight is required for home pickup.
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
            We are dedicated paper buyers. We DO NOT accept or purchase:
          </p>
          <ul className="list-disc list-inside text-xs font-semibold text-red-900 space-y-1">
            <li>Batteries (car, inverter, AA/AAA, or lithium cells are prohibited)</li>
            <li>Any electronics (laptops, phones, chargers, wires, appliances)</li>
            <li>Plastic scrap, milk packets, or polythene</li>
          </ul>
        </div>
      </div>
    </PaperPlusLayout>
  );
}


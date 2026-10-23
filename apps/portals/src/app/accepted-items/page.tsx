import React from "react";
import { DeccanLayout } from "@/components/DeccanLayout";

export const dynamic = "force-dynamic";

export default function AcceptedItemsPage(): JSX.Element {
  return (
    <DeccanLayout activePath="/accepted-items">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-black text-emerald-950">Deccan E-Cycle — Material Acceptance Guidelines</h2>
          <p className="text-sm text-emerald-800 font-medium mt-1">
            Official guidelines under CPCB E-Waste Management Rules (Hyderabad Region)
          </p>
        </div>

        {/* Accepted Items Table */}
        <div className="bg-white p-6 rounded-lg border border-emerald-200 shadow-sm space-y-3">
          <h3 className="text-base font-bold text-emerald-900 border-b pb-2">✅ Permitted Electronic Items</h3>
          <p className="text-xs text-slate-600">
            Deccan E-Cycle collects and recycles the following categories of household and office electronics:
          </p>
          <div role="region" aria-label="Recycler policy table" tabIndex={0} className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-emerald-50 text-emerald-900 border-b border-emerald-200">
                  <th className="py-2.5 px-3 font-bold">Category</th>
                  <th className="py-2.5 px-3 font-bold">Accepted Items</th>
                  <th className="py-2.5 px-3 font-bold">Payout / Processing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-slate-800">Laptops & Notebooks</td>
                  <td className="py-2.5 px-3 text-slate-600">All brands, working or dead (Dell, HP, Lenovo, Apple, etc.)</td>
                  <td className="py-2.5 px-3 font-bold text-emerald-700">₹250 payout per dead laptop</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-slate-800">Mobile Phones & Tablets</td>
                  <td className="py-2.5 px-3 text-slate-600">Smartphones, feature phones, broken display devices</td>
                  <td className="py-2.5 px-3 font-bold text-emerald-700">₹60 payout per dead phone</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-slate-800">Desktops & Monitors</td>
                  <td className="py-2.5 px-3 text-slate-600">CPUs, motherboards, LCD/LED monitors, power supplies</td>
                  <td className="py-2.5 px-3 text-slate-600">Free certified disposal</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-slate-800">Household Batteries</td>
                  <td className="py-2.5 px-3 text-slate-600">Lithium-ion batteries, alkaline AA/AAA cells, laptop batteries</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-700">₹0 payout (free safe disposal)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-slate-800">Chargers & Cables</td>
                  <td className="py-2.5 px-3 text-slate-600">Power bricks, USB cords, HDMI cables, adapters</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-700">₹0 payout (free safe disposal)</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-slate-800">Small Consumer Electronics</td>
                  <td className="py-2.5 px-3 text-slate-600">Keyboards, mice, routers, set-top boxes, calculators</td>
                  <td className="py-2.5 px-3 text-slate-600">Free certified disposal</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Rejected Items Section */}
        <div className="bg-red-50/70 p-6 rounded-lg border border-red-200 text-red-950 space-y-3">
          <h3 className="text-base font-bold text-red-900 border-b border-red-200 pb-2">
            ❌ Strictly Prohibited & Rejected Materials
          </h3>
          <p className="text-xs text-red-800">
            Deccan E-Cycle is an e-waste facility only. The following items will be rejected immediately:
          </p>
          <ul className="list-disc list-inside text-xs text-red-900 space-y-1 font-medium">
            <li>Paper, newspapers, office shredded documents, and books</li>
            <li>Cardboard packaging boxes and cartons</li>
            <li>Household plastics, pet bottles, and plastic containers</li>
            <li>Glass bottles, window panes, and broken glass</li>
          </ul>
          <p className="text-[11px] text-red-700 font-semibold pt-1">
            Rule enforcement: Any pickup request containing rejected items will be declined by our automated portal or
            driver upon inspection.
          </p>
        </div>
      </div>
    </DeccanLayout>
  );
}


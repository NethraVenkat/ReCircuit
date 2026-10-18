import React from "react";
import { DeccanLayout } from "@/components/DeccanLayout";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function PickupChargesPage(): Promise<JSX.Element> {
  const repo = getRepository();
  const switches = await repo.getFailureSwitches("deccan");
  const isChangedLayout = switches.changedPolicyLayout;

  if (switches.hideFeeInfo) {
    return (
      <DeccanLayout activePath="/pickup-charges">
        <div className="space-y-6">
          <div className="border-b border-emerald-950/20 pb-4">
            <h2 className="text-2xl font-black text-emerald-950">Pickup Charges & Rates</h2>
            <p className="text-sm text-emerald-800 font-semibold mt-1">
              Commercial tariff schedule for residential collections across Hyderabad.
            </p>
          </div>
          <div data-testid="fee-info-hidden" className="p-6 bg-amber-50 border border-amber-300 rounded text-amber-900 text-sm">
            <p className="font-bold">Notice: Tariff revision in progress.</p>
            <p className="text-xs mt-1">Pickup fee thresholds, underweight surcharge, and payout figures are temporarily unlisted.</p>
          </div>
        </div>
      </DeccanLayout>
    );
  }

  const feeTable = (
    <div className="bg-white p-6 rounded-lg border border-emerald-200 shadow-sm space-y-4">
      <h3 className="text-base font-bold text-emerald-900 border-b pb-2">
        {isChangedLayout ? "Discharge & Handling Compensation Table" : "Pickup Fee & Payout Schedule"}
      </h3>
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="bg-emerald-50 text-emerald-900 border-b border-emerald-200">
            <th className="py-2.5 px-3 font-bold">Total E-Waste Weight</th>
            <th className="py-2.5 px-3 font-bold">Doorstep Pickup Charge</th>
            <th className="py-2.5 px-3 font-bold">Payouts Available</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr>
            <td className="py-2.5 px-3 font-bold text-slate-800">Under 5 kg total weight</td>
            <td className="py-2.5 px-3 font-bold text-amber-800">₹180 standard pickup charge</td>
            <td className="py-2.5 px-3 text-slate-600">Per-item cash payout still credited</td>
          </tr>
          <tr>
            <td className="py-2.5 px-3 font-bold text-slate-800">5 kg or more total weight</td>
            <td className="py-2.5 px-3 font-black text-emerald-700">₹0 (FREE Pickup)</td>
            <td className="py-2.5 px-3 text-slate-600">Full per-item cash payout credited</td>
          </tr>
        </tbody>
      </table>

      <div className="pt-2">
        <h4 className="font-bold text-xs text-emerald-950 mb-2">Item-Specific Payout Rates:</h4>
        <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
          <li>
            <strong>Dead or Functional Laptop:</strong> ₹250 cash payout each
          </li>
          <li>
            <strong>Dead or Functional Mobile Phone:</strong> ₹60 cash payout each
          </li>
          <li>
            <strong>Batteries (Li-ion / Alkaline):</strong> ₹0 payout (free safe ecological handling)
          </li>
          <li>
            <strong>Chargers, Adapters & Wires:</strong> ₹0 payout (free safe ecological handling)
          </li>
        </ul>
      </div>
    </div>
  );

  return (
    <DeccanLayout activePath="/pickup-charges">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-black text-emerald-950">
            {isChangedLayout
              ? "Tariff Matrix & Logistics Assessment Protocol"
              : "Pickup Charges & Payout Rates"}
          </h2>
          <p className="text-sm text-emerald-800 font-medium mt-1">
            Transparent pricing and reverse logistics terms for Hyderabad households
          </p>
        </div>

        {/* If standard layout, feeTable is at top */}
        {!isChangedLayout && feeTable}

        {/* Informational prose */}
        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 text-slate-700 text-xs space-y-3 leading-relaxed">
          <h3 className="text-sm font-bold text-slate-900">Pickup Logistics & Weighing Policy</h3>
          <p>
            Our certified collection technician carries an electronic digital scale calibrated to Department of Legal
            Metrology standards. Total electronic scrap weight is assessed upon arrival at your doorstep.
          </p>
          <p>
            If your consignment equals or exceeds 5.0 kg, the ₹180 logistics tariff is completely waived. If your scrap
            weighs less than 5.0 kg, ₹180 is deducted from your gross device payout (or payable via UPI / cash).
          </p>
        </div>

        {/* If layout is changed, feeTable is moved to the bottom */}
        {isChangedLayout && (
          <div className="space-y-2">
            <span className="text-[11px] font-mono text-purple-700 font-bold block">
              [Layout Modification Active via Admin Failure Switch]
            </span>
            {feeTable}
          </div>
        )}
      </div>
    </DeccanLayout>
  );
}


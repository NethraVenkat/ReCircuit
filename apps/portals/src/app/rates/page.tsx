import { QuickScrapLayout } from "@/components/QuickScrapLayout";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function RatesPage(): Promise<JSX.Element> {
  const repo = getRepository();
  const switches = await repo.getFailureSwitches("quickscrap");

  if (switches.hideFeeInfo) {
    return (
      <QuickScrapLayout activePath="/rates">
        <div className="space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wider text-white">
              QuickScrap Tariff & Aggregator Rate Card
            </h2>
          </div>
          <div data-testid="fee-info-hidden" className="p-6 bg-slate-900 border border-amber-600/50 rounded text-amber-200 text-sm font-mono">
            <p className="font-bold text-amber-400">Notice: Tariff undergoing revision.</p>
            <p className="text-xs mt-1 text-slate-300">Standard logistics fees and scrap payouts are temporarily unlisted.</p>
          </div>
        </div>
      </QuickScrapLayout>
    );
  }

  return (
    <QuickScrapLayout activePath="/rates">
      <div className="space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h2 className="text-xl font-bold uppercase tracking-wider text-white">
            QuickScrap Tariff & Aggregator Rate Card
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Standard pricing schedule across Greater Hyderabad area
          </p>
        </div>

        {/* Flat Fee Highlight */}
        <div className="p-4 bg-orange-950/40 border border-orange-800/60 rounded">
          <span className="text-xs font-bold text-orange-400 uppercase tracking-wider block mb-1">
            Standard Logistics Fee
          </span>
          <p className="text-2xl font-black text-white font-mono">₹50 Flat Pickup Fee</p>
          <p className="text-xs text-slate-300 mt-1">
            Charged on all doorstep collections regardless of load size or material combination.
          </p>
        </div>

        {/* Rates Table */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Material Payout Table (Aggregator Discount Applied)
          </h3>
          <table className="w-full text-xs text-left border-collapse font-mono">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <th className="py-2 px-3">Item Category</th>
                <th className="py-2 px-3">Aggregator Rate</th>
                <th className="py-2 px-3">Terms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td className="py-2.5 px-3 text-white font-bold">Dead Laptop / Notebook</td>
                <td className="py-2.5 px-3 text-orange-400 font-bold">₹180 / unit</td>
                <td className="py-2.5 px-3 text-slate-400">All models & specifications</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-white font-bold">Dead Mobile Phone</td>
                <td className="py-2.5 px-3 text-orange-400 font-bold">₹40 / unit</td>
                <td className="py-2.5 px-3 text-slate-400">Smartphones or keypads</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-white font-bold">Old Newspaper</td>
                <td className="py-2.5 px-3 text-orange-400 font-bold">₹9 / kg</td>
                <td className="py-2.5 px-3 text-slate-400">Dry weight basis</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-white font-bold">Corrugated Cardboard</td>
                <td className="py-2.5 px-3 text-orange-400 font-bold">₹4 / kg</td>
                <td className="py-2.5 px-3 text-slate-400">Flattened packaging</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-white font-bold">Batteries & Small Plastics</td>
                <td className="py-2.5 px-3 text-slate-400">₹0 (Disposal only)</td>
                <td className="py-2.5 px-3 text-slate-500">Collected with pickup</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Status notice */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded text-xs text-slate-400 space-y-1">
          <span className="text-orange-400 font-bold block uppercase text-[11px]">
            ⚠️ Regulatory Notice (Synthetic Demo Data)
          </span>
          <p>
            QuickScrap Hyd is a private reverse-logistics startup. Registration application is in process with state
            pollution control authorities. This platform does not display CPCB certification.
          </p>
        </div>
      </div>
    </QuickScrapLayout>
  );
}


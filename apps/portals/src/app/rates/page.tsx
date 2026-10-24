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
            <h2 className="text-xl font-bold text-slate-900">
              Accepted items & rates
            </h2>
          </div>
          <div data-testid="fee-info-hidden" className="p-6 bg-white border border-emerald-600/50 rounded-sm text-emerald-200 text-sm font-sans">
            <p className="font-bold text-emerald-400">Notice: Tariff undergoing revision.</p>
            <p className="text-xs mt-1 text-slate-700">Standard logistics fees and scrap payouts are temporarily unlisted.</p>
          </div>
        </div>
      </QuickScrapLayout>
    );
  }

  return (
    <QuickScrapLayout activePath="/rates">
      <div className="space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h2 className="text-xl font-bold text-slate-900">
            Accepted items & rates
          </h2>
          <p className="text-xs text-slate-600 mt-1 font-sans">
            Standard pricing schedule across Greater Hyderabad area
          </p>
        </div>

        {/* Flat Fee Highlight */}
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-sm">
          <span className="text-xs font-bold text-emerald-400 block mb-1">
            Pickup fee
          </span>
          <p className="text-2xl font-black text-slate-900 font-sans">₹50 per pickup</p>
          <p className="text-xs text-slate-700 mt-1">
            Charged on all doorstep collections regardless of load size or material combination.
          </p>
        </div>

        {/* Rates Table */}
        <div className="p-4 bg-white border border-slate-800 rounded-sm space-y-3">
          <h3 className="text-xs font-bold text-slate-700">
            Material payouts
          </h3>
          <table className="w-full text-xs text-left border-collapse font-sans">
            <thead>
              <tr className="bg-white text-slate-600 border-b border-slate-800">
                <th className="py-2 px-3">Item Category</th>
                <th className="py-2 px-3">Aggregator Rate</th>
                <th className="py-2 px-3">Terms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td className="py-2.5 px-3 text-slate-900 font-bold">Dead Laptop / Notebook</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">₹180 / unit</td>
                <td className="py-2.5 px-3 text-slate-600">All models & specifications</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-900 font-bold">Dead Mobile Phone</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">₹40 / unit</td>
                <td className="py-2.5 px-3 text-slate-600">Smartphones or keypads</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-900 font-bold">Old Newspaper</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">₹9 / kg</td>
                <td className="py-2.5 px-3 text-slate-600">Dry weight basis</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-900 font-bold">Corrugated Cardboard</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">₹4 / kg</td>
                <td className="py-2.5 px-3 text-slate-600">Flattened packaging</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-slate-900 font-bold">Batteries & Small Plastics</td>
                <td className="py-2.5 px-3 text-slate-600">₹0 (Disposal only)</td>
                <td className="py-2.5 px-3 text-slate-500">Collected with pickup</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Status notice */}
        <div className="p-4 bg-white border border-slate-800 rounded-sm text-xs text-slate-600 space-y-1">
          <span className="text-emerald-400 font-bold block uppercase text-[11px]">
            Registration information
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


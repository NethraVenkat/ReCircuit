import React from "react";
import { headers } from "next/headers";
import Link from "next/link";
import { resolveRecyclerId, RECYCLER_CONFIGS } from "@/lib/config";
import { DeccanLayout } from "@/components/DeccanLayout";
import { PaperPlusLayout } from "@/components/PaperPlusLayout";
import { QuickScrapLayout } from "@/components/QuickScrapLayout";

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<JSX.Element> {
  const headersList = await headers();
  const host = headersList.get("host");
  const recyclerId = resolveRecyclerId(host);

  if (recyclerId === "deccan") {
    const config = RECYCLER_CONFIGS.deccan;
    return (
      <DeccanLayout activePath="/">
        <div className="space-y-6">
          <div className="border-b border-emerald-200 pb-4">
            <h2 className="text-3xl font-extrabold text-emerald-950">Deccan E-Cycle Hyderabad</h2>
            <p className="text-base text-emerald-800 font-medium mt-1">
              Electronics collection in Hyderabad
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 bg-white rounded-lg border border-emerald-200 shadow-xs">
              <h3 className="font-bold text-emerald-900 mb-2">Accepted electronics</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                We accept laptops, desktops, mobile phones, chargers and household batteries.
              </p>
              <Link
                href={config.routes.items}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline"
              >
                View Acceptance Policy →
              </Link>
            </div>

            <div className="p-5 bg-white rounded-lg border border-emerald-200 shadow-xs">
              <h3 className="font-bold text-emerald-900 mb-2">Pickup charges & rates</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                {config.rates.payoutDescription}
              </p>
              <Link
                href={config.routes.fees}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline"
              >
                Check Pricing Structure →
              </Link>
            </div>

            <div className="p-5 bg-white rounded-lg border border-emerald-200 shadow-xs">
              <h3 className="font-bold text-emerald-900 mb-2">Book e-waste pickup</h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Arrange a doorstep pickup. A data-wipe declaration is required for laptops and phones.
              </p>
              <Link
                href={config.routes.book}
                className="inline-block bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-1.5 rounded-sm text-xs font-bold shadow-xs"
              >
                Book Now →
              </Link>
            </div>
          </div>

          {/* Policy prose table */}
          <div className="bg-white p-6 rounded-lg border border-emerald-200 shadow-xs space-y-4">
            <h3 className="text-lg font-bold text-emerald-950">Service and verification requirements</h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              Review registration evidence independently before booking. Collection, weighing and disposal status must be confirmed through the saved record and supporting evidence.
            </p>
            <div className="text-xs bg-emerald-50 text-emerald-900 p-3 rounded-sm border border-emerald-200 font-medium">
              {config.rates.rejectedSummary}
            </div>
          </div>
        </div>
      </DeccanLayout>
    );
  }

  if (recyclerId === "paperplus") {
    const config = RECYCLER_CONFIGS.paperplus;
    return (
      <PaperPlusLayout activePath="/">
        <div className="space-y-8">
          <div className="bg-emerald-100/60 p-6 rounded-lg border border-emerald-300 text-center space-y-2">
            <h2 className="text-3xl font-black text-emerald-950">Recycle your paper and cardboard</h2>
            <p className="text-sm text-emerald-800 font-semibold max-w-xl mx-auto">
              Doorstep paper collection with a minimum total weight of 5 kg. Review the item rates before booking.
            </p>
            <div className="pt-2">
              <Link
                href={config.routes.book}
                className="inline-block bg-emerald-800 hover:bg-emerald-700 text-white font-black px-6 py-2.5 rounded-sm shadow-sm text-sm"
              >
                Schedule Doorstep Pickup →
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-lg border border-emerald-200 shadow-xs text-center">
              <div className="text-3xl mb-2">📰</div>
              <h3 className="font-bold text-base text-emerald-950">Newspaper (raddi)</h3>
              <p className="text-2xl font-black text-emerald-700 my-1">₹12 / kg</p>
              <p className="text-xs text-emerald-900">English & Telugu daily newspapers</p>
            </div>

            <div className="bg-white p-5 rounded-lg border border-emerald-200 shadow-xs text-center">
              <div className="text-3xl mb-2">📦</div>
              <h3 className="font-bold text-base text-emerald-950">Corrugated cardboard</h3>
              <p className="text-2xl font-black text-emerald-700 my-1">₹9 / kg</p>
              <p className="text-xs text-emerald-900">Delivery cartons & packaging boxes</p>
            </div>

            <div className="bg-white p-5 rounded-lg border border-emerald-200 shadow-xs text-center">
              <div className="text-3xl mb-2">📚</div>
              <h3 className="font-bold text-base text-emerald-950">Old books & office paper</h3>
              <p className="text-2xl font-black text-emerald-700 my-1">₹10 / kg</p>
              <p className="text-xs text-emerald-900">Textbooks, notebooks & office paper</p>
            </div>
          </div>

          <div className="bg-emerald-50 p-6 rounded-lg border border-emerald-300 space-y-2">
            <h3 className="text-base font-bold text-emerald-950">PaperPlus buying rules</h3>
            <ul className="text-xs text-emerald-900 space-y-1.5 list-disc list-inside">
              <li>Minimum pickup quantity is 5 kg total weight.</li>
              <li>Pickup is 100% free with no hidden charges.</li>
              <li>
                <strong>Strictly Rejected:</strong> We do NOT take batteries, electronics, computers, mobile phones, or
                plastics.
              </li>
              <li>A verification security check is required before submitting your pickup slot.</li>
            </ul>
          </div>
        </div>
      </PaperPlusLayout>
    );
  }

  // QuickScrap Hyd
  const config = RECYCLER_CONFIGS.quickscrap;
  return (
    <QuickScrapLayout activePath="/">
      <div className="space-y-6">
        <div className="p-6 bg-white border border-slate-800 rounded-sm">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-white uppercase tracking-wider">QuickScrap Hyd Aggregator</h2>
              <p className="text-xs text-emerald-400 mt-1 font-semibold">
                Single-window collection for electronics, scrap paper, metals & batteries
              </p>
            </div>
            <Link
              href={config.routes.book}
              className="bg-emerald-800 hover:bg-emerald-900 text-white font-bold px-4 py-2 rounded-sm text-xs uppercase"
            >
              Book Instant Pickup
            </Link>
          </div>
        </div>

        {/* Accordions / Sections */}
        <div className="space-y-4" data-testid="quickscrap-accordions">
          <details open className="p-4 bg-white border border-slate-800 rounded-sm group" data-testid="quickscrap-accordion">
            <summary className="text-sm font-bold text-emerald-400 uppercase tracking-wide cursor-pointer select-none">
              1. Flat Fee Structure & Logistics
            </summary>
            <p className="text-xs text-slate-700 leading-relaxed mt-3">
              QuickScrap charges a standard convenience fee of ₹50 per pickup trip regardless of weight. Our pickup team
              records your requested slot; a dispatcher-assigned time is shown only when confirmed.
            </p>
          </details>

          <details open className="p-4 bg-white border border-slate-800 rounded-sm group" data-testid="quickscrap-accordion">
            <summary className="text-sm font-bold text-emerald-400 uppercase tracking-wide cursor-pointer select-none">
              2. Accepted Materials & Rate Card
            </summary>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-3 mt-1">
              <div className="p-2 bg-white border border-slate-800 rounded-sm">
                <span className="text-slate-600 block">Dead Laptop</span>
                <span className="text-white font-bold text-sm">₹180 / unit</span>
              </div>
              <div className="p-2 bg-white border border-slate-800 rounded-sm">
                <span className="text-slate-600 block">Dead Phone</span>
                <span className="text-white font-bold text-sm">₹40 / unit</span>
              </div>
              <div className="p-2 bg-white border border-slate-800 rounded-sm">
                <span className="text-slate-600 block">Newspaper</span>
                <span className="text-white font-bold text-sm">₹9 / kg</span>
              </div>
              <div className="p-2 bg-white border border-slate-800 rounded-sm">
                <span className="text-slate-600 block">Cardboard</span>
                <span className="text-white font-bold text-sm">₹4 / kg</span>
              </div>
            </div>
          </details>

          <details open className="p-4 bg-white border border-slate-800 rounded-sm group" data-testid="quickscrap-accordion">
            <summary className="text-sm font-bold text-emerald-400 uppercase tracking-wide cursor-pointer select-none">
              3. Regulatory Disclosure & Status
            </summary>
            <p className="text-xs text-slate-600 leading-relaxed mt-3">
              Registration: application in process. QuickScrap operates as an independent reverse logistics aggregator in Hyderabad.
            </p>
          </details>
        </div>
      </div>
    </QuickScrapLayout>
  );
}


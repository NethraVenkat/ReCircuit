import React from "react";
import { QuickScrapLayout } from "@/components/QuickScrapLayout";
import { TrackingView } from "@/components/TrackingView";

export const dynamic = "force-dynamic";

interface TrackOrderPageProps {
  searchParams: Promise<{ ref?: string; client?: string }>;
}

export default async function TrackOrderPage({ searchParams }: TrackOrderPageProps): Promise<JSX.Element> {
  const query = await searchParams;
  const initialRef = query.ref || "";
  const initialClient = query.client || "";

  return (
    <QuickScrapLayout activePath="/track-order">
      <div className="space-y-6 max-w-3xl">
        <div className="border-b border-slate-800 pb-3">
          <h2 className="text-xl font-bold uppercase tracking-wider text-white">QuickScrap Order Tracking</h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Enter your QSH-XXXXX order reference to monitor collection dispatch and weighbridge records.
          </p>
        </div>

        <TrackingView recyclerId="quickscrap" initialReference={initialRef} initialClientRequestId={initialClient} />
      </div>
    </QuickScrapLayout>
  );
}


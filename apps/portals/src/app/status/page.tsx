import React from "react";
import { PaperPlusLayout } from "@/components/PaperPlusLayout";
import { TrackingView } from "@/components/TrackingView";

export const dynamic = "force-dynamic";

interface StatusPageProps {
  searchParams: Promise<{ ref?: string; client?: string }>;
}

export default async function StatusPage({ searchParams }: StatusPageProps): Promise<JSX.Element> {
  const query = await searchParams;
  const initialRef = query.ref || "";
  const initialClient = query.client || "";

  return (
    <PaperPlusLayout activePath="/status">
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-3xl font-black text-amber-950">PaperPlus Pickup Status</h2>
          <p className="text-sm text-amber-800 font-semibold mt-1">
            Enter your PPK-XXXXX booking reference below to check collection, weighing, and payout status.
          </p>
        </div>

        <TrackingView recyclerId="paperplus" initialReference={initialRef} initialClientRequestId={initialClient} />
      </div>
    </PaperPlusLayout>
  );
}


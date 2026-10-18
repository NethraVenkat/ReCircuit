import React from "react";
import { PaperPlusLayout } from "@/components/PaperPlusLayout";
import { TrackingView } from "@/components/TrackingView";

export const dynamic = "force-dynamic";

interface StatusPageProps {
  searchParams: { ref?: string; client?: string };
}

export default function StatusPage({ searchParams }: StatusPageProps): JSX.Element {
  const initialRef = searchParams.ref || "";
  const initialClient = searchParams.client || "";

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


import React from "react";
import { DeccanLayout } from "@/components/DeccanLayout";
import { TrackingView } from "@/components/TrackingView";

export const dynamic = "force-dynamic";

interface TrackPageProps {
  searchParams: Promise<{ ref?: string; client?: string }>;
}

export default async function TrackPage({ searchParams }: TrackPageProps): Promise<JSX.Element> {
  const query = await searchParams;
  const initialRef = query.ref || "";
  const initialClient = query.client || "";

  return (
    <DeccanLayout activePath="/track">
      <div className="space-y-6 portal-tracking-page">
        <div>
          <h2 className="text-2xl font-black text-emerald-950">Track E-Waste Consignment</h2>
          <p className="text-sm text-emerald-800 font-medium mt-1">
            Verify real-time booking status, pickup dispatch, weighing and certification records.
          </p>
        </div>

        <TrackingView recyclerId="deccan" initialReference={initialRef} initialClientRequestId={initialClient} />
      </div>
    </DeccanLayout>
  );
}


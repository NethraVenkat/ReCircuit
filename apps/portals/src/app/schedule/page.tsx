import React from "react";
import { PaperPlusLayout } from "@/components/PaperPlusLayout";
import { BookingForm } from "@/components/BookingForm";

export const dynamic = "force-dynamic";

export default function SchedulePage(): JSX.Element {
  return (
    <PaperPlusLayout activePath="/schedule">
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-3xl font-black text-emerald-950">Schedule doorstep paper pickup</h2>
          <p className="text-sm text-emerald-800 font-semibold mt-1">
            Fill your Hyderabad address, select your scrap paper weight, and solve the security verification.
          </p>
        </div>

        <BookingForm recyclerId="paperplus" />
      </div>
    </PaperPlusLayout>
  );
}


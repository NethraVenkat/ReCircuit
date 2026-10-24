import React from "react";
import { DeccanLayout } from "@/components/DeccanLayout";
import { BookingForm } from "@/components/BookingForm";

export const dynamic = "force-dynamic";

export default function BookPickupPage(): JSX.Element {
  return (
    <DeccanLayout activePath="/book-pickup">
      <div className="space-y-6 portal-form-page">
        <div>
          <h2 className="text-2xl font-black text-emerald-950">Book an e-waste pickup</h2>
          <p className="text-sm text-emerald-800 font-medium mt-1">
            Fill in your collection address and electronic items below.
          </p>
        </div>

        <BookingForm recyclerId="deccan" />
      </div>
    </DeccanLayout>
  );
}


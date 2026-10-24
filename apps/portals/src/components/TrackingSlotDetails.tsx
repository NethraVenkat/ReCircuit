import React from "react";
import type { PortalBooking } from "../lib/types";
import { trackingSlots } from "../lib/tracking-slots";

export function TrackingSlotDetails({ booking }: { booking: Pick<PortalBooking, "preferredSlot" | "events"> }): JSX.Element {
  const slots = trackingSlots(booking);
  return <>
    <div>
      <span className="font-bold text-slate-500 block">Requested slot</span>
      <span data-testid="tracking-requested-slot" className="font-semibold text-slate-800 text-sm font-sans">{slots.requestedSlot || "Not recorded"}</span>
    </div>
    <div>
      <span className="font-bold text-slate-500 block">Assigned slot</span>
      <span data-testid="tracking-assigned-slot" className="font-semibold text-slate-800 text-sm font-sans">{slots.assignedSlot || "Not assigned"}</span>
    </div>
  </>;
}

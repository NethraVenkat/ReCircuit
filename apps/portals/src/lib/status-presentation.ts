import type { PortalBooking } from "./types";
import { trackingSlots } from "./tracking-slots";
import { confirmedSlotWindow } from "./geospatial/windows";
export function bookingStatusLabel(booking: PortalBooking): string {
  if (booking.status === "SCHEDULED") {
    const slot = trackingSlots(booking).assignedSlot;
    return slot && confirmedSlotWindow(slot, slot.slice(0, 10)) ? "Scheduled pickup" : "Scheduling details needed";
  }
  return ({ RECEIVED: "Request received", CONFIRMED: "Awaiting scheduling", PICKED_UP: "Collection recorded", WEIGHED: "Weight recorded", CANCELLED: "Cancelled" } as Record<string, string>)[booking.status] || "Status review needed";
}

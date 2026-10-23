import type { BookingEvent, PortalBooking } from "./types";

interface Assignment {
  type: "dispatcher_slot_assignment";
  message: string;
  assignedSlot: string;
  requestedSlot: string | null;
}

function assignment(event: BookingEvent): Assignment | null {
  if (event.status !== "SCHEDULED" || event.eventType !== "STATUS_UPDATED_SCHEDULED") return null;
  try {
    const value = JSON.parse(event.detail) as Partial<Assignment> | null;
    if (value?.type === "dispatcher_slot_assignment" && typeof value.message === "string" &&
        typeof value.assignedSlot === "string" && value.assignedSlot.trim() &&
        (value.requestedSlot === null || typeof value.requestedSlot === "string")) return value as Assignment;
  } catch { /* Older dispatcher events contain a human-readable scheduling message. */ }
  const legacy = /^Pickup scheduled for slot: (.+) \(SIMULATED DOWNSTREAM EVENT\)$/.exec(event.detail);
  // Old scheduling overwrote preferred_slot. Its original preference cannot be recovered.
  return legacy ? { type: "dispatcher_slot_assignment", message: event.detail, assignedSlot: legacy[1]!, requestedSlot: null } : null;
}

export function trackingSlots(booking: Pick<PortalBooking, "preferredSlot" | "events">): { requestedSlot: string | null; assignedSlot: string | null } {
  const assignments = booking.events.map(event => ({ event, value: assignment(event) }))
    .filter(entry => entry.value !== null)
    .sort((a, b) => a.event.createdAt.localeCompare(b.event.createdAt));
  const latest = assignments.at(-1)?.value;
  return latest ? { requestedSlot: latest.requestedSlot, assignedSlot: latest.assignedSlot } : { requestedSlot: booking.preferredSlot, assignedSlot: null };
}

/** Persist explicit dispatcher evidence in the existing atomic status/event RPC. */
export function dispatcherSlotDetail(booking: Pick<PortalBooking, "preferredSlot" | "events">, message: string, slot: string): string {
  return JSON.stringify({ type: "dispatcher_slot_assignment", message, assignedSlot: slot.trim(), requestedSlot: trackingSlots(booking).requestedSlot } satisfies Assignment);
}

export function trackingEventMessage(event: BookingEvent): string {
  return assignment(event)?.message || event.detail;
}

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { BookingEvent, PortalBooking } from "../lib/types";
import { dispatcherSlotDetail, trackingEventMessage, trackingSlots } from "../lib/tracking-slots";
import { TrackingSlotDetails } from "../components/TrackingSlotDetails";
import { FileRepository } from "../lib/repository/file-repository";
const mocks = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (): { rpc: typeof mocks.rpc } => ({ rpc: mocks.rpc }) }));
import { SupabaseRepository } from "../lib/repository/supabase-repository";

const input = { recyclerId: "deccan" as const, clientRequestId: "synthetic-slot-test", fullName: "Synthetic slot test", phone: "9000000000", addressLine: "Fictional fixture only", locality: "Madhapur", pincode: "500081", preferredSlot: "Customer morning preference", items: [{ name: "Laptop", quantity: 1, weightKg: 2.5 }] };
function booking(events: BookingEvent[] = [], status: PortalBooking["status"] = "RECEIVED"): PortalBooking {
  return { ...input, id: "fixture", bookingReference: "DEC-00001", status, events, createdAt: "2026-10-23T12:00:00Z", updatedAt: "2026-10-23T12:00:00Z" };
}
function event(detail: string): BookingEvent {
  return { id: "dispatch", eventType: "STATUS_UPDATED_SCHEDULED", status: "SCHEDULED", detail, isSimulated: true, createdAt: "2026-10-23T13:00:00Z" };
}
it("renders received preference separately, with no inferred assignment", () => {
  const markup = renderToStaticMarkup(createElement(TrackingSlotDetails, { booking: booking() }));
  expect(markup).toContain("Requested slot"); expect(markup).toContain(input.preferredSlot);
  expect(markup).toContain("Assigned slot"); expect(markup).toContain("Not assigned");
  expect(markup).not.toContain("Assigned / Preferred");
  expect(trackingSlots(booking())).toEqual({ requestedSlot: input.preferredSlot, assignedSlot: null });
});
it.each(["CONFIRMED", "SCHEDULED"] as const)("does not infer assignment from %s alone", status => {
  expect(trackingSlots(booking([], status)).assignedSlot).toBeNull();
});
it("renders a genuine dispatcher assignment alongside the original preference", () => {
  const detail = dispatcherSlotDetail(booking(), "Dispatcher scheduled pickup", "Dispatcher afternoon assignment");
  const scheduled = booking([event(detail)], "SCHEDULED");
  expect(trackingSlots(scheduled)).toEqual({ requestedSlot: input.preferredSlot, assignedSlot: "Dispatcher afternoon assignment" });
  const markup = renderToStaticMarkup(createElement(TrackingSlotDetails, { booking: scheduled }));
  expect(markup).toContain(input.preferredSlot); expect(markup).toContain("Dispatcher afternoon assignment");
  expect(markup).not.toContain("Not assigned");
  expect(trackingEventMessage(scheduled.events[0]!)).toBe("Dispatcher scheduled pickup");
});
it("requires an actual scheduling event rather than arbitrary text or booking receipt", () => {
  const detail = dispatcherSlotDetail(booking(), "Scheduled", "Afternoon");
  const wrongType = { ...event(detail), eventType: "BOOKING_CREATED", status: "RECEIVED" as const };
  expect(trackingSlots(booking([wrongType])).assignedSlot).toBeNull();
  expect(trackingSlots(booking([event("Customer asks for afternoon")], "SCHEDULED")).assignedSlot).toBeNull();
});
it("reads legacy explicit scheduling evidence without inventing its overwritten preference", () => {
  const legacy = booking([event("Pickup scheduled for slot: Afternoon (SIMULATED DOWNSTREAM EVENT)")], "SCHEDULED");
  legacy.preferredSlot = "Afternoon";
  expect(trackingSlots(legacy)).toEqual({ requestedSlot: null, assignedSlot: "Afternoon" });
  const detail = dispatcherSlotDetail(legacy, "Rescheduled", "Evening");
  expect(trackingSlots(booking([event(detail)], "SCHEDULED")).requestedSlot).toBeNull();
});
it("selects the latest dispatcher event even when event rows arrive unordered", () => {
  const earlier = { ...event(dispatcherSlotDetail(booking(), "First", "Morning")), createdAt: "2026-10-23T12:00:00Z" };
  const later = event(dispatcherSlotDetail(booking(), "Second", "Afternoon"));
  expect(trackingSlots(booking([later, earlier], "SCHEDULED")).assignedSlot).toBe("Afternoon");
});
it("preserves the customer's preference across persisted file-store scheduling and fresh readback", async () => {
  const dir = mkdtempSync(path.resolve(".data/submission-resume-20261023/slot-test-"));
  const repo = new FileRepository(dir);
  const created = await repo.createBooking(input);
  await repo.updateBookingStatus("deccan", created.booking.bookingReference, "SCHEDULED", "Dispatcher scheduled pickup", { slot: "Afternoon" });
  const saved = await new FileRepository(dir).getBookingByReference("deccan", created.booking.bookingReference);
  expect(saved?.preferredSlot).toBe(input.preferredSlot);
  expect(trackingSlots(saved!)).toEqual({ requestedSlot: input.preferredSlot, assignedSlot: "Afternoon" });
});
it("uses the existing atomic Supabase RPC without overwriting preferred_slot", async () => {
  mocks.rpc.mockClear();
  const repo = new SupabaseRepository("https://example.supabase.co", "unit-only");
  vi.spyOn(repo, "getBookingByReference").mockResolvedValue(booking());
  await repo.updateBookingStatus("deccan", "DEC-00001", "SCHEDULED", "Dispatcher scheduled pickup", { slot: "Afternoon", isSimulated: true });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  const args = mocks.rpc.mock.calls[0]![1] as { p_options: object; p_detail: string; p_status: string };
  expect(args.p_options).not.toHaveProperty("slot"); expect(args.p_status).toBe("SCHEDULED");
  expect(trackingSlots(booking([event(args.p_detail)], "SCHEDULED"))).toEqual({ requestedSlot: input.preferredSlot, assignedSlot: "Afternoon" });
});

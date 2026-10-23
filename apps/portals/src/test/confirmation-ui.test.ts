import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BookingConfirmation } from "../components/BookingConfirmation";
import type { PortalBooking } from "../lib/types";
const booking: PortalBooking = { id: "local-only", recyclerId: "deccan", bookingReference: "DEC-90001", clientRequestId: "local-only", fullName: "Local fixture", phone: "9000000000", addressLine: "Fictional address", locality: "Madhapur", pincode: "500081", preferredSlot: "Customer requested morning", items: [{ name: "Laptop", quantity: 1, weightKg: 2.5 }], chargedFeeInr: 180, status: "RECEIVED", createdAt: "2026-10-23T00:00:00Z", updatedAt: "2026-10-23T00:00:00Z", events: [] };
it.each(["", "DEC-NOT-FOUND"])("does not invent booking success from confirmation URL %s", reference => {
  const html = renderToStaticMarkup(createElement(BookingConfirmation, { booking: null, reference, duplicate: false, trackPath: "/track" }));
  expect(html).toContain("Booking confirmation unavailable"); expect(html).not.toContain('data-testid="booking-reference"'); expect(html).not.toContain('data-testid="confirmation-status"');
});
it("shows recorded quantity, weight, fee and preference without inventing dispatch", () => {
  const html = renderToStaticMarkup(createElement(BookingConfirmation, { booking, reference: booking.bookingReference, duplicate: true, trackPath: "/track" }));
  expect(html).toContain("Customer requested morning"); expect(html).toContain("Not assigned"); expect(html).toContain("2.5"); expect(html).toContain("₹180"); expect(html).toContain("RECEIVED"); expect(html).not.toContain("Pickup Scheduled Successfully"); expect(html).not.toContain("As Selected");
});

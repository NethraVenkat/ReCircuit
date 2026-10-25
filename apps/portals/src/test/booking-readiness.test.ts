import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { BookingForm } from "../components/BookingForm";
import { pickupFee } from "../lib/fees";
import { validateBookingSubmission, type BookingSubmissionPayload } from "../lib/validation";
it.each(["deccan", "paperplus", "quickscrap"] as const)("starts %s with no items, no quoted fee and a disabled booking action", recyclerId => {
  const html = renderToStaticMarkup(React.createElement(BookingForm, { recyclerId }));
  expect(html).toContain("No items added");
  expect(html).not.toContain('data-testid="item-row"');
  expect(html).not.toContain('data-testid="portal-computed-fee"');
  expect(html).toMatch(/data-testid="confirm-booking" disabled=""/);
  expect(html).not.toContain("Non-serviceable test");
  expect(html).not.toContain('value="500001"');
  expect(html).toContain('list="serviceable-pincodes"');
});
it("retains actual-weight fee thresholds and rejects unsupported service areas and empty items", () => {
  expect([pickupFee("deccan", 2.2), pickupFee("deccan", 5), pickupFee("paperplus", 8), pickupFee("quickscrap", 6)]).toEqual([180, 0, 0, 50]);
  const input: BookingSubmissionPayload = { client_request_id: "readiness-only", full_name: "Test Household", phone: "9999999999", address_line: "Test address", locality: "Test locality", pincode: "500001", preferred_slot: "2026-10-26 (10:00–12:00 IST)", items: [], data_wipe_ack: true };
  for (const tenant of ["deccan", "paperplus", "quickscrap"] as const) {
    const result = validateBookingSubmission(tenant, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map(error => error.field)).toEqual(expect.arrayContaining(["pincode", "items"]));
  }
});

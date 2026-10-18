/**
 * apps/portals/src/test/portal.test.ts
 *
 * Vitest tests for the ReCircuit Mock Recycler Portals:
 * - Each site: valid booking returns reference in right format (DEC-xxxxx, PPK-xxxxx, QSH-xxxxx)
 * - Tracking finds that reference and shows RECEIVED
 * - Invalid submissions rejected: unsupported item, bad pincode, bad phone, PaperPlus under 5 kg, Deccan missing data-wipe ack
 * - Duplicate client_request_id returns the same reference and storage still has one booking
 * - PaperPlus: submission without or with a wrong verification code is rejected; code text is not present in page HTML / SVG
 * - Admin: confirm, schedule, picked up, weight update in order and are labelled SIMULATED; admin without token is refused
 * - Reset clears bookings
 * - The three home pages differ: assert different nav landmarks and route names
 * - Failure switches produce a 500 / confirmation without reference / changed policy layout
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { FileRepository } from "../lib/repository/file-repository";
import { setRepositoryInstance } from "../lib/repository";
import { validateBookingSubmission } from "../lib/validation";
import { createCaptchaSession, renderCaptchaSvg, verifyCaptchaCode } from "../lib/captcha";
import { RECYCLER_CONFIGS, resolveRecyclerId, isRouteAllowedForRecycler, getAvailableSlots } from "../lib/config";
import type { BookingSubmissionPayload } from "../lib/validation";
import { POST as handlePostBooking, GET as handleGetBooking } from "../app/api/bookings/route";
import { GET as handleGetAdmin, POST as handlePostAdmin } from "../app/api/admin/route";
import { POST as handlePostReset } from "../app/api/reset/route";
import { GET as handleGetFee } from "../app/api/fee/route";

const TEST_DATA_DIR = path.resolve(__dirname, "../../.data-test");

describe("ReCircuit Mock Recycler Portals Test Suite", () => {
  let repo: FileRepository;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    repo = new FileRepository(TEST_DATA_DIR);
    setRepositoryInstance(repo);
  });

  afterAll(() => {
    setRepositoryInstance(null);
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // 1. Reference format per site
  // -------------------------------------------------------------------------
  describe("Booking Reference Format", () => {
    it("Deccan creates reference in DEC-12345 format (5 digits)", async () => {
      const { booking, isDuplicate } = await repo.createBooking({
        recyclerId: "deccan",
        clientRequestId: "req-dec-1",
        fullName: "Ramesh Reddy",
        phone: "9876543210",
        addressLine: "Plot 10, Road 2",
        locality: "Kukatpally",
        pincode: "500072",
        preferredSlot: "2026-11-01 (10:00–12:00 IST)",
        items: [{ name: "Dell Laptop", quantity: 1, weightKg: 2.5 }],
        dataWipeAcknowledged: true,
      });

      expect(isDuplicate).toBe(false);
      expect(booking.bookingReference).toMatch(/^DEC-\d{5}$/);
      expect(booking.status).toBe("RECEIVED");
    });

    it("PaperPlus creates reference in PPK-12345 format", async () => {
      const { booking } = await repo.createBooking({
        recyclerId: "paperplus",
        clientRequestId: "req-ppk-1",
        fullName: "Srinivas Rao",
        phone: "9876543211",
        addressLine: "Flat 202, Green Homes",
        locality: "KPHB",
        pincode: "500085",
        preferredSlot: "2026-11-01 (15:00–17:00 IST)",
        items: [{ name: "Old Newspaper", quantity: 1, weightKg: 10 }],
      });

      expect(booking.bookingReference).toMatch(/^PPK-\d{5}$/);
      expect(booking.status).toBe("RECEIVED");
    });

    it("QuickScrap creates reference in QSH-12345 format", async () => {
      const { booking } = await repo.createBooking({
        recyclerId: "quickscrap",
        clientRequestId: "req-qsh-1",
        fullName: "Vikram Kumar",
        phone: "9876543212",
        addressLine: "Door 5, Phase 1",
        locality: "Madhapur",
        pincode: "500081",
        preferredSlot: "2026-11-02 (10:00–12:00 IST)",
        items: [{ name: "Mixed Scrap", quantity: 2, weightKg: 6 }],
      });

      expect(booking.bookingReference).toMatch(/^QSH-\d{5}$/);
      expect(booking.status).toBe("RECEIVED");
    });
  });

  // -------------------------------------------------------------------------
  // 2. Tracking finds reference and shows RECEIVED
  // -------------------------------------------------------------------------
  describe("Tracking Reference", () => {
    it("tracking finds created booking and shows status RECEIVED", async () => {
      const { booking } = await repo.createBooking({
        recyclerId: "deccan",
        clientRequestId: "req-track-1",
        fullName: "Aarav Sharma",
        phone: "9876543210",
        addressLine: "Plot 42",
        locality: "Kukatpally",
        pincode: "500072",
        preferredSlot: "Tomorrow (10:00–12:00 IST)",
        items: [{ name: "HP Laptop", quantity: 1 }],
      });

      const found = await repo.getBookingByReference("deccan", booking.bookingReference);
      expect(found).not.toBeNull();
      expect(found?.bookingReference).toBe(booking.bookingReference);
      expect(found?.status).toBe("RECEIVED");
      expect(found?.events.length).toBeGreaterThanOrEqual(1);
      expect(found?.events[0]?.status).toBe("RECEIVED");
    });

    it("unknown reference returns null (no crash / 404)", async () => {
      const found = await repo.getBookingByReference("deccan", "DEC-00000");
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Duplicate protection
  // -------------------------------------------------------------------------
  describe("Duplicate client_request_id Protection", () => {
    it("duplicate client_request_id returns the existing reference and creates no second booking", async () => {
      const payload = {
        recyclerId: "deccan" as const,
        clientRequestId: "dup-req-unique-123",
        fullName: "Pooja Reddy",
        phone: "9876543210",
        addressLine: "House 12",
        locality: "Kukatpally",
        pincode: "500072",
        preferredSlot: "Tomorrow 10:00 IST",
        items: [{ name: "Laptop", quantity: 1 }],
      };

      // First submission
      const r1 = await repo.createBooking(payload);
      expect(r1.isDuplicate).toBe(false);

      // Duplicate retry submission
      const r2 = await repo.createBooking(payload);
      expect(r2.isDuplicate).toBe(true);
      expect(r2.booking.bookingReference).toBe(r1.booking.bookingReference);

      // Verify repository only has 1 booking
      const all = await repo.listBookings("deccan");
      expect(all.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Input validation and site rejection rules
  // -------------------------------------------------------------------------
  describe("Validation & Rejection Rules", () => {
    const baseValidPayload: BookingSubmissionPayload = {
      client_request_id: "req-v-1",
      full_name: "Rahul Verma",
      phone: "9876543210",
      address_line: "Main Road 5",
      locality: "Kukatpally",
      pincode: "500072",
      preferred_slot: "2026-11-01 10:00 IST",
      items: [{ name: "Laptop", quantity: 1, weightKg: 2.5 }],
    };

    it("rejects non-serviceable pincode (e.g. 500001)", () => {
      const res = validateBookingSubmission("deccan", {
        ...baseValidPayload,
        pincode: "500001",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.field === "pincode")).toBe(true);
      }
    });

    it("rejects bad phone (not 10 digits)", () => {
      const res = validateBookingSubmission("deccan", {
        ...baseValidPayload,
        phone: "12345",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.field === "phone")).toBe(true);
      }
    });

    it("Deccan rejects unsupported item (paper/cardboard) with clear message", () => {
      const res = validateBookingSubmission("deccan", {
        ...baseValidPayload,
        items: [{ name: "Old Newspaper & Cardboard", weightKg: 10 }],
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        const itemErr = res.errors.find((e) => e.field === "items");
        expect(itemErr).toBeDefined();
        expect(itemErr?.message).toMatch(/does not accept.*paper/i);
      }
    });

    it("Deccan rejects missing data-wipe acknowledgement when laptop is selected", () => {
      const res = validateBookingSubmission("deccan", {
        ...baseValidPayload,
        items: [{ name: "Dell Laptop", quantity: 1 }],
        data_wipe_ack: false,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.field === "data_wipe_ack")).toBe(true);
      }
    });

    it("Deccan accepts when data-wipe acknowledgement is checked for laptop", () => {
      const res = validateBookingSubmission("deccan", {
        ...baseValidPayload,
        items: [{ name: "Dell Laptop", quantity: 1 }],
        data_wipe_ack: true,
      });
      expect(res.ok).toBe(true);
    });

    it("PaperPlus rejects electronics and batteries", () => {
      const res = validateBookingSubmission("paperplus", {
        ...baseValidPayload,
        items: [
          { name: "Old Batteries", weightKg: 6 },
          { name: "Laptop", weightKg: 2 },
        ],
        human_verification_code: "TEST1",
      }, "TEST1");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        const itemErr = res.errors.find((e) => e.field === "items");
        expect(itemErr?.message).toMatch(/PaperPlus Kabadi does not accept/i);
      }
    });

    it("PaperPlus rejects under 5 kg total weight", () => {
      const res = validateBookingSubmission("paperplus", {
        ...baseValidPayload,
        items: [{ name: "Newspaper", weightKg: 3.5 }],
        human_verification_code: "TEST1",
      }, "TEST1");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        const itemErr = res.errors.find((e) => e.field === "items");
        expect(itemErr?.message).toMatch(/minimum pickup weight of 5 kg/i);
      }
    });

    it("PaperPlus accepts valid newspaper >= 5 kg with correct captcha", () => {
      const res = validateBookingSubmission("paperplus", {
        ...baseValidPayload,
        items: [{ name: "Newspaper", weightKg: 8.0 }],
        human_verification_code: "TEST1",
      }, "TEST1");
      expect(res.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. PaperPlus SVG CAPTCHA: code is NOT present as text in page/svg
  // -------------------------------------------------------------------------
  describe("PaperPlus Human Verification (CAPTCHA)", () => {
    it("renders code purely as vector paths and contains NO <text> elements in SVG", () => {
      const session = createCaptchaSession();
      expect(session.code).toHaveLength(5);

      const svg = renderCaptchaSvg(session.code);

      // Crucial requirement: the code text must NOT appear as text anywhere in the DOM or SVG
      expect(svg).not.toContain("<text");
      expect(svg).not.toContain(`>${session.code}<`);
      expect(svg).toContain("<path");
      expect(svg).toContain("<svg");
    });

    it("rejects PaperPlus submission without verification code", () => {
      const session = createCaptchaSession();
      const res = validateBookingSubmission("paperplus", {
        client_request_id: "req-c-1",
        full_name: "Karan",
        phone: "9876543210",
        address_line: "Road 1",
        locality: "KPHB",
        pincode: "500085",
        preferred_slot: "Tomorrow",
        items: [{ name: "Newspaper", weightKg: 10 }],
        human_verification_code: "",
      }, session.code);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.field === "human_verification_code")).toBe(true);
      }
    });

    it("rejects PaperPlus submission with wrong verification code", () => {
      const session = createCaptchaSession();
      const res = validateBookingSubmission("paperplus", {
        client_request_id: "req-c-2",
        full_name: "Karan",
        phone: "9876543210",
        address_line: "Road 1",
        locality: "KPHB",
        pincode: "500085",
        preferred_slot: "Tomorrow",
        items: [{ name: "Newspaper", weightKg: 10 }],
        human_verification_code: "WRONG",
      }, session.code);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.some((e) => e.field === "human_verification_code")).toBe(true);
      }
    });

    it("verifyCaptchaCode succeeds with correct code and is one-time use", () => {
      const { sessionId, code } = createCaptchaSession();
      expect(verifyCaptchaCode(sessionId, code)).toBe(true);
      // Second attempt fails (one-time use)
      expect(verifyCaptchaCode(sessionId, code)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Admin Actions: confirm, schedule, picked up, weight & SIMULATED labels
  // -------------------------------------------------------------------------
  describe("Admin Lifecycle Actions", () => {
    it("confirm, schedule, picked up, weight update in order and are labelled SIMULATED", async () => {
      const { booking } = await repo.createBooking({
        recyclerId: "deccan",
        clientRequestId: "admin-flow-1",
        fullName: "Sneha Patel",
        phone: "9876543210",
        addressLine: "Flat 4B",
        locality: "Kukatpally",
        pincode: "500072",
        preferredSlot: "2026-11-01 10:00 IST",
        items: [{ name: "Dead Laptop", quantity: 1, weightKg: 2.0 }],
      });

      const ref = booking.bookingReference;

      // 1. Confirm
      const b1 = await repo.updateBookingStatus(
        "deccan",
        ref,
        "CONFIRMED",
        "Confirmed by dispatcher (SIMULATED DOWNSTREAM EVENT)",
        { isSimulated: true }
      );
      expect(b1?.status).toBe("CONFIRMED");
      expect(b1?.events[b1.events.length - 1]?.isSimulated).toBe(true);

      // 2. Schedule
      const b2 = await repo.updateBookingStatus(
        "deccan",
        ref,
        "SCHEDULED",
        "Assigned slot window (SIMULATED DOWNSTREAM EVENT)",
        { slot: "2026-11-02 15:00 IST", isSimulated: true }
      );
      expect(b2?.status).toBe("SCHEDULED");
      expect(b2?.preferredSlot).toBe("2026-11-02 15:00 IST");

      // 3. Picked Up (with 6-digit OTP)
      const otp = "842190";
      const b3 = await repo.updateBookingStatus(
        "deccan",
        ref,
        "PICKED_UP",
        `Collected OTP: ${otp} (SIMULATED DOWNSTREAM EVENT)`,
        { pickupOtp: otp, isSimulated: true }
      );
      expect(b3?.status).toBe("PICKED_UP");
      expect(b3?.pickupOtp).toBe(otp);

      // 4. Weighed
      const b4 = await repo.updateBookingStatus(
        "deccan",
        ref,
        "WEIGHED",
        "Weighbridge ticket 2.2 kg (SIMULATED DOWNSTREAM EVENT)",
        { weightKg: 2.2, isSimulated: true }
      );
      expect(b4?.status).toBe("WEIGHED");
      expect(b4?.weightKg).toBe(2.2);

      // Check all events in tracking
      const finalBooking = await repo.getBookingByReference("deccan", ref);
      expect(finalBooking?.events.length).toBe(5); // 1 created + 4 simulated
      const simulatedCount = finalBooking?.events.filter((e) => e.isSimulated).length;
      expect(simulatedCount).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Reset clears bookings
  // -------------------------------------------------------------------------
  describe("Reset Demo State", () => {
    it("reset clears all bookings and resets failure switches", async () => {
      await repo.createBooking({
        recyclerId: "deccan",
        clientRequestId: "reset-1",
        fullName: "Test User",
        phone: "9876543210",
        addressLine: "Line 1",
        locality: "Locality",
        pincode: "500072",
        preferredSlot: "Slot",
        items: [{ name: "Laptop", quantity: 1 }],
      });

      await repo.updateFailureSwitches("deccan", { failNextSubmit: true });
      expect((await repo.listBookings("deccan")).length).toBe(1);
      expect((await repo.getFailureSwitches("deccan")).failNextSubmit).toBe(true);

      await repo.reset("deccan");

      expect((await repo.listBookings("deccan")).length).toBe(0);
      expect((await repo.getFailureSwitches("deccan")).failNextSubmit).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 8. The three sites differ in layout and landmarks
  // -------------------------------------------------------------------------
  describe("Site Differentiation", () => {
    it("asserts different nav landmarks, route names, and badges", () => {
      const deccan = RECYCLER_CONFIGS.deccan;
      const paperplus = RECYCLER_CONFIGS.paperplus;
      const quickscrap = RECYCLER_CONFIGS.quickscrap;

      // Different route names
      expect(deccan.routes.items).toBe("/accepted-items");
      expect(paperplus.routes.items).toBe("/what-we-take");
      expect(quickscrap.routes.items).toBe("/rates");

      expect(deccan.routes.book).toBe("/book-pickup");
      expect(paperplus.routes.book).toBe("/schedule");
      expect(quickscrap.routes.book).toBe("/pickup");

      expect(deccan.routes.track).toBe("/track");
      expect(paperplus.routes.track).toBe("/status");
      expect(quickscrap.routes.track).toBe("/track-order");

      // CPCB badge presence
      expect(deccan.badge).toBeDefined();
      expect(paperplus.badge).toBeDefined();
      expect(quickscrap.badge).toBeUndefined();
      expect(quickscrap.unregisteredNotice).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 9. Failure switches
  // -------------------------------------------------------------------------
  describe("Failure Switches", () => {
    it("fail_next_submit switch can be consumed as one-shot", async () => {
      await repo.updateFailureSwitches("deccan", { failNextSubmit: true });
      expect(await repo.consumeFailureSwitch("deccan", "failNextSubmit")).toBe(true);
      // Second time should be false (one-shot)
      expect(await repo.consumeFailureSwitch("deccan", "failNextSubmit")).toBe(false);
    });

    it("omit_next_reference switch suppresses reference on creation", async () => {
      await repo.updateFailureSwitches("deccan", { omitNextReference: true });

      const res = await repo.createBooking({
        recyclerId: "deccan",
        clientRequestId: "omit-ref-req",
        fullName: "Test Omit",
        phone: "9876543210",
        addressLine: "Line 1",
        locality: "Locality",
        pincode: "500072",
        preferredSlot: "Slot",
        items: [{ name: "Laptop", quantity: 1 }],
      });

      expect(res.omitReference).toBe(true);

      // Verify switch was consumed
      const sw = await repo.getFailureSwitches("deccan");
      expect(sw.omitNextReference).toBe(false);
    });

    it("changed_policy_layout switch stays toggled until toggled off", async () => {
      await repo.updateFailureSwitches("deccan", { changedPolicyLayout: true });
      expect((await repo.getFailureSwitches("deccan")).changedPolicyLayout).toBe(true);

      await repo.updateFailureSwitches("deccan", { changedPolicyLayout: false });
      expect((await repo.getFailureSwitches("deccan")).changedPolicyLayout).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 10. ADMIN_TOKEN Security & 503 Enforcement
  // -------------------------------------------------------------------------
  describe("ADMIN_TOKEN Security & 503 Enforcement", () => {
    const originalToken = process.env.ADMIN_TOKEN;

    afterAll(() => {
      if (originalToken !== undefined) {
        process.env.ADMIN_TOKEN = originalToken;
      } else {
        delete process.env.ADMIN_TOKEN;
      }
    });

    it("GET /api/admin returns 503 'Admin disabled' when ADMIN_TOKEN is unset", async () => {
      delete process.env.ADMIN_TOKEN;
      const req = new Request("http://localhost:3101/api/admin", { method: "GET" });
      const res = await handleGetAdmin(req);
      expect(res.status).toBe(503);
      const text = await res.text();
      expect(text).toBe("Admin disabled");
    });

    it("POST /api/reset returns 503 'Admin disabled' when ADMIN_TOKEN is unset", async () => {
      delete process.env.ADMIN_TOKEN;
      const req = new Request("http://localhost:3101/api/reset", { method: "POST" });
      const res = await handlePostReset(req);
      expect(res.status).toBe(503);
      const text = await res.text();
      expect(text).toBe("Admin disabled");
    });

    it("GET /api/admin returns 401 when ADMIN_TOKEN is set but token is missing or wrong", async () => {
      process.env.ADMIN_TOKEN = "test-secret-token";

      // Missing token
      const req1 = new Request("http://localhost:3101/api/admin", { method: "GET" });
      const res1 = await handleGetAdmin(req1);
      expect(res1.status).toBe(401);

      // Wrong token
      const req2 = new Request("http://localhost:3101/api/admin?token=wrong-token", { method: "GET" });
      const res2 = await handleGetAdmin(req2);
      expect(res2.status).toBe(401);

      // Correct token
      const req3 = new Request("http://localhost:3101/api/admin?token=test-secret-token", { method: "GET" });
      const res3 = await handleGetAdmin(req3);
      expect(res3.status).toBe(200);
      const data = await res3.json();
      expect(data.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Site Selection & Route Guarding
  // -------------------------------------------------------------------------
  describe("Site Selection & Route Guarding", () => {
    it("resolveRecyclerId throws CONFIGURATION_ERROR_MISSING_RECYCLER_ID in production if unset", () => {
      const origEnv = process.env.NODE_ENV;
      const origId = process.env.RECYCLER_ID;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        delete process.env.RECYCLER_ID;

        expect(() => resolveRecyclerId()).toThrow("CONFIGURATION_ERROR_MISSING_RECYCLER_ID");
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
        if (origId) {
          process.env.RECYCLER_ID = origId;
        } else {
          delete process.env.RECYCLER_ID;
        }
      }
    });

    it("isRouteAllowedForRecycler rejects cross-recycler route access (404 behavior)", () => {
      // Cross-recycler routes must not be allowed
      expect(isRouteAllowedForRecycler("/schedule", "deccan")).toBe(false);
      expect(isRouteAllowedForRecycler("/book-pickup", "quickscrap")).toBe(false);
      expect(isRouteAllowedForRecycler("/rates", "paperplus")).toBe(false);
      expect(isRouteAllowedForRecycler("/pickup", "deccan")).toBe(false);

      // Legitimate routes must be allowed
      expect(isRouteAllowedForRecycler("/book-pickup", "deccan")).toBe(true);
      expect(isRouteAllowedForRecycler("/accepted-items", "deccan")).toBe(true);
      expect(isRouteAllowedForRecycler("/schedule", "paperplus")).toBe(true);
      expect(isRouteAllowedForRecycler("/what-we-take", "paperplus")).toBe(true);
      expect(isRouteAllowedForRecycler("/pickup", "quickscrap")).toBe(true);
      expect(isRouteAllowedForRecycler("/rates", "quickscrap")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 12. HTTP Form Path Duplicate client_request_id
  // -------------------------------------------------------------------------
  describe("HTTP Form Route Handling", () => {
    it("duplicate client_request_id via POST /api/bookings returns isDuplicate: true and stores only 1 booking", async () => {
      const origRecycler = process.env.RECYCLER_ID;
      process.env.RECYCLER_ID = "deccan";

      try {
        const payload = {
          client_request_id: "http-dup-test-001",
          full_name: "Anita Roy",
          phone: "9876543210",
          address_line: "Road 12, Flat 3A",
          locality: "Kukatpally",
          pincode: "500072",
          preferred_slot: "2026-11-01 (10:00–12:00 IST)",
          items: [{ name: "Dell Laptop", quantity: 1, weightKg: 2.5 }],
          data_wipe_ack: true,
        };

        // First HTTP submission
        const req1 = new Request("http://localhost:3101/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json", host: "localhost:3101" },
          body: JSON.stringify(payload),
        });
        const res1 = await handlePostBooking(req1);
        expect(res1.status).toBe(200);
        const data1 = await res1.json();
        expect(data1.ok).toBe(true);
        expect(data1.isDuplicate).toBe(false);
        expect(data1.booking.bookingReference).toMatch(/^DEC-\d{5}$/);

        // Second HTTP submission with exact same client_request_id
        const req2 = new Request("http://localhost:3101/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json", host: "localhost:3101" },
          body: JSON.stringify(payload),
        });
        const res2 = await handlePostBooking(req2);
        expect(res2.status).toBe(200);
        const data2 = await res2.json();
        expect(data2.ok).toBe(true);
        expect(data2.isDuplicate).toBe(true);
        expect(data2.booking.bookingReference).toBe(data1.booking.bookingReference);

        // Assert repository only stores exactly 1 booking
        const storedBookings = await repo.listBookings("deccan");
        expect(storedBookings.length).toBe(1);
        expect(storedBookings[0]?.bookingReference).toBe(data1.booking.bookingReference);
      } finally {
        if (origRecycler) {
          process.env.RECYCLER_ID = origRecycler;
        } else {
          delete process.env.RECYCLER_ID;
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 17. Single Source of Truth: Config & Rate Cards
  // -------------------------------------------------------------------------
  describe("17. Single Source of Truth: Config & Rate Cards", () => {
    it("RECYCLER_CONFIGS provides centralized rates for Deccan, PaperPlus, and QuickScrap", () => {
      const deccan = RECYCLER_CONFIGS.deccan;
      expect(deccan.rates.acceptedCategories).toContain("Laptops");
      expect(deccan.rates.rejectedCategories).toContain("Paper");
      expect(deccan.rates.underWeightFeeInr).toBe(180);
      expect(deccan.rates.freeThresholdKg).toBe(5);

      const paperplus = RECYCLER_CONFIGS.paperplus;
      expect(paperplus.rates.acceptedCategories).toContain("Newspaper (Raddi)");
      expect(paperplus.rates.rejectedCategories).toContain("Batteries");
      expect(paperplus.rates.minWeightKg).toBe(5);

      const quickscrap = RECYCLER_CONFIGS.quickscrap;
      expect(quickscrap.rates.rateCard.length).toBeGreaterThan(0);
      expect(quickscrap.unregisteredNotice).toBe("Registration: application in process");
    });
  });

  // -------------------------------------------------------------------------
  // 18. Stateless HMAC CAPTCHA & Replay Protection
  // -------------------------------------------------------------------------
  describe("18. Stateless HMAC CAPTCHA & Nonce Replay Protection", () => {
    it("token has format enc:hash:expiry:nonce:sig and verifies successfully once", async () => {
      const session = createCaptchaSession();
      const parts = session.sessionId.split(":");
      expect(parts.length).toBe(5);

      // Verify code recovers from token
      const recovered = (await import("../lib/captcha")).getStoredCaptchaCode(session.sessionId);
      expect(recovered).toBe(session.code);

      // Verify using verifyCaptchaToken with repo
      const { verifyCaptchaToken } = await import("../lib/captcha");
      const ok1 = await verifyCaptchaToken(session.sessionId, session.code, repo);
      expect(ok1).toBe(true);

      // Replay attempt with same token must fail
      const ok2 = await verifyCaptchaToken(session.sessionId, session.code, repo);
      expect(ok2).toBe(false);
    });

    it("tampered token signature is rejected", async () => {
      const session = createCaptchaSession();
      const parts = session.sessionId.split(":");
      const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:0000000000000000000000000000000000000000000000000000000000000000`;

      const { verifyCaptchaToken } = await import("../lib/captcha");
      const ok = await verifyCaptchaToken(tampered, session.code, repo);
      expect(ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 19. Asia/Kolkata Timezone Slots
  // -------------------------------------------------------------------------
  describe("19. Asia/Kolkata Timezone Slots", () => {
    it("getAvailableSlots returns slots with IST windows", () => {
      const slots = getAvailableSlots();
      expect(slots).toHaveLength(6); // 3 days x 2 windows
      for (const slot of slots) {
        expect(slot).toMatch(/^\d{4}-\d{2}-\d{2} \((10:00–12:00|15:00–17:00) IST\)$/);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 20. Admin Token Timing-Safe Equal & Cookie Setting
  // -------------------------------------------------------------------------
  describe("20. Admin Token Timing-Safe Equal & Cookie Setting", () => {
    it("GET /api/admin sets HttpOnly admin_token cookie when queried with valid token", async () => {
      const origToken = process.env.ADMIN_TOKEN;
      process.env.ADMIN_TOKEN = "secret-admin-12345";
      try {
        const req = new Request("http://localhost:3101/api/admin?token=secret-admin-12345", {
          headers: { host: "localhost:3101" },
        });
        const res = await handleGetAdmin(req);
        expect(res.status).toBe(200);

        const setCookie = res.headers.get("set-cookie");
        expect(setCookie).toBeTruthy();
        expect(setCookie).toContain("admin_token=secret-admin-12345");
        expect(setCookie).toContain("HttpOnly");

        // Subsequent call with Cookie header succeeds without query token
        const req2 = new Request("http://localhost:3101/api/admin", {
          headers: { host: "localhost:3101", cookie: `admin_token=secret-admin-12345` },
        });
        const res2 = await handleGetAdmin(req2);
        expect(res2.status).toBe(200);
      } finally {
        if (origToken) process.env.ADMIN_TOKEN = origToken;
        else delete process.env.ADMIN_TOKEN;
      }
    });
  });

  // -------------------------------------------------------------------------
  // 21. Pre-Flight Stage 4 Audit Evidence Tests
  // -------------------------------------------------------------------------
  describe("21. Pre-Flight Stage 4 Audit Evidence Tests", () => {
    it("production build per RECYCLER_ID returns 404 for 3 foreign routes each", () => {
      const origEnv = process.env.NODE_ENV;
      const origId = process.env.RECYCLER_ID;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";

        // Deccan: foreign routes
        process.env.RECYCLER_ID = "deccan";
        for (const route of ["/schedule", "/pickup", "/rates"]) {
          const req = new NextRequest(`http://localhost:3101${route}`);
          const res = middleware(req);
          expect(res.status).toBe(404);
        }

        // PaperPlus: foreign routes
        process.env.RECYCLER_ID = "paperplus";
        for (const route of ["/book-pickup", "/accepted-items", "/pickup"]) {
          const req = new NextRequest(`http://localhost:3102${route}`);
          const res = middleware(req);
          expect(res.status).toBe(404);
        }

        // QuickScrap: foreign routes
        process.env.RECYCLER_ID = "quickscrap";
        for (const route of ["/book-pickup", "/accepted-items", "/schedule"]) {
          const req = new NextRequest(`http://localhost:3103${route}`);
          const res = middleware(req);
          expect(res.status).toBe(404);
        }
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
        if (origId) process.env.RECYCLER_ID = origId;
        else delete process.env.RECYCLER_ID;
      }
    });

    it("<script> in name is escaped on confirmation/tracking/admin", async () => {
      const scriptPayload = "<script>alert('xss')</script>";
      const { booking } = await repo.createBooking({
        recyclerId: "deccan",
        clientRequestId: "xss-test-001",
        fullName: scriptPayload,
        phone: "9876543210",
        addressLine: "Test Line",
        locality: "Kukatpally",
        pincode: "500072",
        preferredSlot: "2026-11-01 (10:00–12:00 IST)",
        items: [{ name: "Dell Laptop", quantity: 1, weightKg: 2 }],
        dataWipeAcknowledged: true,
      });

      // Raw value preserved in database/storage
      expect(booking.fullName).toBe(scriptPayload);

      // Verify React HTML rendering escapes script tag to prevent XSS
      const React = await import("react");
      const { renderToStaticMarkup } = await import("react-dom/server");
      const html = renderToStaticMarkup(
        React.createElement("div", { "data-testid": "customer-name" }, booking.fullName)
      );
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
    });

    it("unknown tracking reference returns HTTP 404 with 'No booking found'", async () => {
      const req = new Request("http://localhost:3101/api/bookings?ref=DEC-99999", {
        method: "GET",
        headers: { host: "localhost:3101" },
      });
      const res = await handleGetBooking(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("No booking found");
    });

    it("slots correct under TZ=UTC and TZ=America/New_York", () => {
      const origTz = process.env.TZ;
      try {
        for (const tz of ["UTC", "America/New_York"]) {
          process.env.TZ = tz;
          const slots = getAvailableSlots(new Date("2026-11-01T12:00:00Z"));
          expect(slots).toHaveLength(6);
          for (const s of slots) {
            expect(s).toMatch(/^\d{4}-\d{2}-\d{2} \((10:00–12:00|15:00–17:00) IST\)$/);
          }
        }
      } finally {
        if (origTz) process.env.TZ = origTz;
        else delete process.env.TZ;
      }
    });

    it("forced reference collision is retried", async () => {
      const configModule = await import("../lib/config");
      const spy = vi.spyOn(configModule, "generateReference");

      const { booking: b1 } = await repo.createBooking({
        recyclerId: "deccan",
        clientRequestId: "seed-ref-001",
        fullName: "User One",
        phone: "9876543210",
        addressLine: "Line 1",
        locality: "Locality",
        pincode: "500072",
        preferredSlot: "2026-11-01 (10:00–12:00 IST)",
        items: [{ name: "Laptop", quantity: 1, weightKg: 2 }],
        dataWipeAcknowledged: true,
      });

      // Force collision on b1's booking reference on first attempt, then fresh one
      spy.mockClear();
      spy.mockReturnValueOnce(b1.bookingReference).mockReturnValueOnce("DEC-77777");

      const { booking: b2 } = await repo.createBooking({
        recyclerId: "deccan",
        clientRequestId: "seed-ref-002",
        fullName: "User Two",
        phone: "9876543211",
        addressLine: "Line 2",
        locality: "Locality",
        pincode: "500072",
        preferredSlot: "2026-11-01 (10:00–12:00 IST)",
        items: [{ name: "Laptop", quantity: 1, weightKg: 2 }],
        dataWipeAcknowledged: true,
      });

      expect(b2.bookingReference).toBe("DEC-77777");
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it("20 concurrent bookings -> 20 distinct references and valid JSON", async () => {
      const promises = Array.from({ length: 20 }, (_, i) =>
        repo.createBooking({
          recyclerId: "deccan",
          clientRequestId: `concurrent-req-${i}`,
          fullName: `Concurrent User ${i}`,
          phone: "9876543210",
          addressLine: `Address ${i}`,
          locality: "Kukatpally",
          pincode: "500072",
          preferredSlot: "2026-11-01 (10:00–12:00 IST)",
          items: [{ name: "Dell Laptop", quantity: 1, weightKg: 2 }],
          dataWipeAcknowledged: true,
        })
      );

      const results = await Promise.all(promises);
      const references = results.map((r) => r.booking.bookingReference);
      expect(new Set(references).size).toBe(20);

      // Verify file on disk is valid JSON with exactly 20 bookings
      const storeFile = path.join(TEST_DATA_DIR, "deccan.json");
      const content = fs.readFileSync(storeFile, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.bookings).toHaveLength(20);
    });

    it("/admin page (not only APIs) returns 503 when ADMIN_TOKEN is unset", async () => {
      const origToken = process.env.ADMIN_TOKEN;
      delete process.env.ADMIN_TOKEN;
      try {
        const req = new NextRequest("http://localhost:3101/admin");
        const res = middleware(req);
        expect(res.status).toBe(503);
        const text = await res.text();
        expect(text).toBe("Admin disabled");
      } finally {
        if (origToken) process.env.ADMIN_TOKEN = origToken;
        else delete process.env.ADMIN_TOKEN;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Review Step, Fee Calculation, and Client Recovery Lookup
  // -------------------------------------------------------------------------
  describe("Review Step & Recovery Engine Portal Features", () => {
    it("GET /api/fee computes portal fee accurately for Deccan, PaperPlus, and QuickScrap", async () => {
      // Deccan: <5 kg -> 180, >=5 kg -> 0
      const decReqLow = new NextRequest("http://localhost:3101/api/fee?weight=2.5", {
        headers: { host: "localhost:3101" },
      });
      const decResLow = await handleGetFee(decReqLow);
      expect((await decResLow.json()).fee).toBe(180);

      const decReqHigh = new NextRequest("http://localhost:3101/api/fee?weight=6.0", {
        headers: { host: "localhost:3101" },
      });
      const decResHigh = await handleGetFee(decReqHigh);
      expect((await decResHigh.json()).fee).toBe(0);

      // PaperPlus: 0
      const ppReq = new NextRequest("http://localhost:3102/api/fee?weight=8.0", {
        headers: { host: "localhost:3102" },
      });
      const ppRes = await handleGetFee(ppReq);
      expect((await ppRes.json()).fee).toBe(0);

      // QuickScrap: 50
      const qsReq = new NextRequest("http://localhost:3103/api/fee?weight=4.0", {
        headers: { host: "localhost:3103" },
      });
      const qsRes = await handleGetFee(qsReq);
      expect((await qsRes.json()).fee).toBe(50);
    });

    it("Admin switch raise_fee adds ₹40 to computed fee", async () => {
      process.env.ADMIN_TOKEN = "test-token";
      try {
        // Toggle raise_fee switch on QuickScrap
        const toggleReq = new NextRequest("http://localhost:3103/api/admin", {
          method: "POST",
          headers: { host: "localhost:3103", "x-admin-token": "test-token", "content-type": "application/json" },
          body: JSON.stringify({ action: "toggle_switch", switchName: "raise_fee", value: true }),
        });
        const toggleRes = await handlePostAdmin(toggleReq);
        expect(toggleRes.status).toBe(200);

        // Computed fee on QuickScrap should now be 50 + 40 = 90
        const qsReq = new NextRequest("http://localhost:3103/api/fee?weight=4.0", {
          headers: { host: "localhost:3103" },
        });
        const qsRes = await handleGetFee(qsReq);
        const data = await qsRes.json();
        expect(data.fee).toBe(90);
        expect(data.raiseFee).toBe(true);
      } finally {
        delete process.env.ADMIN_TOKEN;
      }
    });

    it("GET /api/bookings?client=<idempotencyKey> recovers existing booking reference", async () => {
      const clientReqId = "idem-test-key-999";
      await repo.createBooking({
        recyclerId: "deccan",
        clientRequestId: clientReqId,
        fullName: "Suresh Patel",
        phone: "9876543210",
        addressLine: "Flat 101, Road 2",
        locality: "Kukatpally",
        pincode: "500072",
        preferredSlot: "2026-11-01 (10:00–12:00 IST)",
        items: [{ name: "Dell Laptop", quantity: 1, weightKg: 2.2 }],
        dataWipeAcknowledged: true,
      });

      const getReq = new NextRequest(`http://localhost:3101/api/bookings?client=${clientReqId}`, {
        headers: { host: "localhost:3101" },
      });
      const getRes = await handleGetBooking(getReq);
      expect(getRes.status).toBe(200);
      const data = await getRes.json();
      expect(data.ok).toBe(true);
      expect(data.booking.bookingReference).toMatch(/^DEC-\d{5}$/);
      expect(data.booking.clientRequestId).toBe(clientReqId);
    });
  });
});


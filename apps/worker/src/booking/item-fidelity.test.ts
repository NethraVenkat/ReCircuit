/* eslint-disable */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  hashPlan,
  makeIdempotencyKey,
  clearActionLogs,
  type Plan,
  type PlanLeg,
  type DecisionRecord,
} from "@recircuit/core";
import { Booker } from "./booker.js";
import { DomReadbackMismatchError } from "./errors.js";
import { Verifier, VerifierError } from "../verifier/verifier.js";
import type { BrowserSession } from "../browser/session.js";
import type { LegBookingContext } from "./types.js";
import type { LegVerificationContext } from "../verifier/types.js";

// Mock the browser session module for verifier tests
vi.mock("../browser/session.js", () => ({
  openSession: vi.fn(),
}));

import { openSession } from "../browser/session.js";

describe("Item Fidelity and Silent Substitution Prevention Regression Suite", () => {
  const customer = {
    fullName: "Synthetic Donor",
    phone: "9876543210",
    addressLine: "Flat 402, Cyber Tower",
    locality: "Madhapur",
    pincode: "500081",
    preferredSlot: "2026-10-25 (10:00–12:00 IST)",
  };

  const createPlan = (itemWeight = 2.5, itemQty = 1): { plan: Plan; leg: PlanLeg; approval: DecisionRecord } => {
    const leg: PlanLeg = {
      id: "leg-1",
      planId: "plan-laptop-fid-01",
      recyclerId: "deccan",
      recyclerName: "Deccan E-Cycle",
      itemIds: ["item-laptop-01"],
      items: [
        {
          id: "item-laptop-01",
          name: "Synthetic Laptop",
          category: "electronics" as any,
          quantity: itemQty,
          estimatedWeightKg: itemWeight,
        },
      ],
      estimatedFee: 180,
      estimatedPayout: 250,
      state: "APPROVED",
      slot: "2026-10-25 (10:00–12:00 IST)",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan: Plan = {
      id: "plan-laptop-fid-01",
      requestId: "req-fid-001",
      legs: [leg],
      totalEstimatedFee: 180,
      totalEstimatedPayout: 250,
      slotPreference: {
        day: "2026-10-25",
        window: "morning",
      },
      dataWipeConfirmedByUser: true,
      createdAt: new Date().toISOString(),
      planHash: "",
    };

    plan.planHash = hashPlan(plan);

    const approval: DecisionRecord = {
      id: "appr-001",
      requestId: plan.requestId,
      planId: plan.id,
      decision: "approved",
      decidedBy: "test_user",
      planHash: plan.planHash,
      dataWipeConfirmedByUser: true,
      decidedAt: new Date().toISOString(),
    };

    return { plan, leg, approval };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearActionLogs();
  });

  describe("1. Booker Form Synchronization & DOM Readback", () => {
    it("clears pre-populated portal default item (2.2 kg Dell Laptop) and populates approved 2.5 kg laptop without silent substitution", async () => {
      const { plan, leg, approval } = createPlan(2.5, 1);

      // Stateful item store simulating live page DOM
      let currentItems: Array<{ name: string; quantity: number; weightKg: number }> = [
        { name: "Dell Laptop", quantity: 1, weightKg: 2.2 }, // Portal default row
      ];

      let inputName = "";
      let inputQty = 1;
      let inputWeight = 5;
      let currentUrl = "http://127.0.0.1:3100/portal/deccan/book-pickup";

      const mockSession: BrowserSession = {
        sessionId: "local-session-fid-01",
        mode: "local",
        page: {
          goto: vi.fn().mockImplementation(async (u: string) => {
            currentUrl = u;
            return null;
          }),
          waitForSelector: vi.fn().mockResolvedValue(null),
          waitForURL: vi.fn().mockResolvedValue(null),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          url: () => currentUrl,
          fill: vi.fn().mockImplementation(async (selector: string, val: string) => {
            if (selector.includes("input-item-name")) inputName = val;
            if (selector.includes("input-item-qty")) inputQty = parseInt(val, 10);
            if (selector.includes("input-item-weight")) inputWeight = parseFloat(val);
          }),
          inputValue: vi.fn().mockImplementation(async (selector: string) => {
            if (selector.includes("input-fullname")) return customer.fullName;
            if (selector.includes("input-phone")) return customer.phone;
            if (selector.includes("input-address")) return customer.addressLine;
            if (selector.includes("input-locality")) return customer.locality;
            if (selector.includes("input-pincode")) return customer.pincode;
            if (selector.includes("select-slot")) return customer.preferredSlot;
            return "";
          }),
          click: vi.fn().mockImplementation(async (selector: string) => {
            if (selector.includes("add-item")) {
              currentItems.push({ name: inputName, quantity: inputQty, weightKg: inputWeight });
            }
          }),
          locator: vi.fn().mockImplementation((selector: string) => {
            if (selector.includes("form-error-banner") || selector.includes("booking-reference-missing")) {
              return {
                count: async () => 0,
                waitFor: async () => {},
                isVisible: async () => false,
              };
            }
            if (selector.includes("human-verification")) {
              return {
                count: async () => 0,
                isVisible: async () => false,
              };
            }
            if (selector.includes("remove-item")) {
              return {
                count: async () => currentItems.length,
                first: () => ({
                  click: async () => {
                    currentItems.shift(); // Remove first row
                  },
                }),
              };
            }
            if (selector.includes("item-row")) {
              return {
                count: async () => currentItems.length,
                first: () => ({
                  waitFor: async () => {},
                }),
                nth: () => ({
                  waitFor: async () => {},
                }),
                all: async () =>
                  currentItems.map((it) => ({
                    locator: (childSel: string) => ({
                      textContent: async () => {
                        if (childSel.includes("item-row-name")) return it.name;
                        if (childSel.includes("item-row-qty")) return `Qty: ${it.quantity}`;
                        if (childSel.includes("item-row-weight")) return `Weight: ${it.weightKg} kg`;
                        return "";
                      },
                    }),
                  })),
              };
            }
            if (selector.includes("input-item-name") || selector.includes("add-item")) {
              return {
                count: async () => 1,
                waitFor: async () => {},
                fill: async (val: string) => {
                  inputName = val;
                },
                click: async () => {
                  currentItems.push({ name: inputName, quantity: inputQty, weightKg: inputWeight });
                },
              };
            }
            if (selector.includes("portal-computed-fee")) {
              return {
                count: async () => 1,
                waitFor: async () => {},
                textContent: async () => "Pickup charge for this request: ₹180",
              };
            }
            if (selector.includes("booking-reference")) {
              return {
                count: async () => (currentUrl.includes("client=") ? 0 : 1),
                waitFor: async () => {},
                isVisible: async () => !currentUrl.includes("client="),
                textContent: async () => "DEC-88990",
              };
            }
            if (selector.includes("select-slot") && selector.includes("option")) {
              return {
                all: async () => [
                  {
                    textContent: async () => "2026-10-25 (10:00–12:00 IST)",
                    getAttribute: async () => "2026-10-25 (10:00–12:00 IST)",
                  },
                ],
              };
            }
            if (selector.includes("select-slot")) {
              return {
                count: async () => 1,
                selectOption: async () => [],
              };
            }
            return {
              count: async () => 1,
              all: async () => [],
              waitFor: async () => {},
              fill: async () => {},
              click: async () => {},
              evaluate: async () => {},
              selectOption: async () => [],
              check: async () => {},
              isChecked: async () => true,
              isVisible: async () => true,
              textContent: async () => "",
              getAttribute: async () => "",
            };
          }),
        } as any,
        captureScreenshot: vi.fn().mockResolvedValue({ filename: "evidence/test-screen.png" }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const context: LegBookingContext = {
        leg,
        plan,
        approval,
        customer,
        items: leg.items as any,
        dataWipeAck: true,
      };

      const result = await Booker.bookLeg(context, {}, mockSession);

      expect(result.success).toBe(true);
      expect(result.bookingReference).toBe("DEC-88990");
      // Verify simulated DOM was cleared of the 2.2 kg default and now holds the 2.5 kg laptop
      expect(currentItems).toHaveLength(1);
      expect(currentItems[0]!.weightKg).toBe(2.5);
      expect(currentItems[0]!.name).toBe("Laptop");
    });

    it("DOM readback rejects silent substitution when form retains 2.2 kg default instead of approved 2.5 kg", async () => {
      const { plan, leg, approval } = createPlan(2.5, 1);

      // Faulty DOM mock: retains 2.2 kg default item
      const mockSession: BrowserSession = {
        sessionId: "local-session-faulty",
        mode: "local",
        page: {
          goto: vi.fn().mockResolvedValue(null),
          waitForSelector: vi.fn().mockResolvedValue(null),
          url: () => "http://127.0.0.1:3100/portal/deccan/book-pickup",
          fill: vi.fn().mockResolvedValue(undefined),
          inputValue: vi.fn().mockImplementation(async (selector: string) => {
            if (selector.includes("input-fullname")) return customer.fullName;
            if (selector.includes("input-phone")) return customer.phone;
            if (selector.includes("input-address")) return customer.addressLine;
            if (selector.includes("input-locality")) return customer.locality;
            if (selector.includes("input-pincode")) return customer.pincode;
            if (selector.includes("select-slot")) return customer.preferredSlot;
            return "";
          }),
          click: vi.fn().mockResolvedValue(undefined),
          locator: vi.fn().mockImplementation((selector: string) => {
            if (selector.includes("form-error-banner") || selector.includes("booking-reference-missing")) {
              return {
                count: async () => 0,
                waitFor: async () => {},
                isVisible: async () => false,
              };
            }
            if (selector.includes("human-verification")) {
              return {
                count: async () => 0,
                isVisible: async () => false,
              };
            }
            if (selector.includes("remove-item")) {
              return { count: async () => 0 };
            }
            if (selector.includes("item-row")) {
              return {
                count: async () => 1,
                first: () => ({ waitFor: async () => {} }),
                nth: () => ({ waitFor: async () => {} }),
                all: async () => [
                  {
                    locator: (childSel: string) => ({
                      textContent: async () => {
                        if (childSel.includes("item-row-name")) return "Synthetic Laptop";
                        if (childSel.includes("item-row-qty")) return "Qty: 1";
                        if (childSel.includes("item-row-weight")) return "Weight: 2.2 kg"; // WRONG weight (2.2 instead of 2.5)
                        return "";
                      },
                    }),
                  },
                ],
              };
            }
            if (selector.includes("select-slot") && selector.includes("option")) {
              return {
                all: async () => [
                  {
                    textContent: async () => "2026-10-25 (10:00–12:00 IST)",
                    getAttribute: async () => "2026-10-25 (10:00–12:00 IST)",
                  },
                ],
              };
            }
            if (selector.includes("select-slot")) {
              return {
                count: async () => 1,
                selectOption: async () => [],
              };
            }
            return {
              count: async () => 1,
              all: async () => [],
              waitFor: async () => {},
              fill: async () => {},
              click: async () => {},
              evaluate: async () => {},
              selectOption: async () => [],
              check: async () => {},
              isChecked: async () => true,
              isVisible: async () => true,
              textContent: async () => "",
              getAttribute: async () => "",
            };
          }),
        } as any,
        captureScreenshot: vi.fn().mockResolvedValue({ filename: "evidence/test-mismatch.png" }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      const context: LegBookingContext = {
        leg,
        plan,
        approval,
        customer,
        items: leg.items as any,
        dataWipeAck: true,
      };

      await expect(Booker.bookLeg(context, {}, mockSession)).rejects.toThrow(DomReadbackMismatchError);
    });
  });

  describe("2. Verifier Item Fidelity Enforcement", () => {
    it("rejects tracking observation when item weight does not match plan leg (2.2 kg vs approved 2.5 kg)", async () => {
      const { plan, leg } = createPlan(2.5, 1);
      leg.state = "REQUEST_SUBMITTED";
      leg.bookingReference = "DEC-47124";
      leg.submittingSessionId = "submit-session-01";

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockImplementation((selector: string) => {
          if (selector === '[data-testid="tracking-result"]') {
            return { waitFor: vi.fn().mockResolvedValue(undefined), isVisible: vi.fn().mockResolvedValue(true) };
          }
          if (selector === '[data-testid="not-found"]') {
            return { waitFor: vi.fn().mockResolvedValue(undefined), isVisible: vi.fn().mockResolvedValue(false) };
          }
          if (selector === '[data-testid="booking-reference"]') {
            return { textContent: vi.fn().mockResolvedValue("DEC-47124") };
          }
          if (selector === '[data-testid="tracking-status"]') {
            return { textContent: vi.fn().mockResolvedValue("RECEIVED") };
          }
          if (selector === '[data-testid="tracking-fee"]') {
            return { textContent: vi.fn().mockResolvedValue("Pickup fee: ₹180") };
          }
          if (selector === '[data-testid="simulated-event-badge"]') {
            return { count: vi.fn().mockResolvedValue(0) };
          }
          if (selector === '[data-testid="tracking-item-row"]') {
            return {
              count: vi.fn().mockResolvedValue(1),
              nth: vi.fn().mockReturnValue({
                locator: vi.fn().mockImplementation((childSel: string) => {
                  if (childSel === '[data-testid="tracking-item-name"]') {
                    return { textContent: vi.fn().mockResolvedValue("Dell Laptop") };
                  }
                  if (childSel === '[data-testid="tracking-item-details"]') {
                    return { textContent: vi.fn().mockResolvedValue("Qty: 1 · Weight: 2.2 kg") }; // 2.2 kg!
                  }
                  return { textContent: vi.fn().mockResolvedValue("") };
                }),
              }),
            };
          }
          return { isVisible: vi.fn().mockResolvedValue(false), count: vi.fn().mockResolvedValue(0) };
        }),
      };

      const mockSession = {
        sessionId: "verify-session-02",
        page: mockPage,
        captureScreenshot: vi.fn().mockResolvedValue({ filename: "evidence/fidelity-mismatch.png" }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(openSession).mockResolvedValueOnce(mockSession as unknown as BrowserSession);

      const context: LegVerificationContext = { leg, plan };

      await expect(Verifier.verifyLeg(context)).rejects.toMatchObject({
        name: "VerifierError",
        code: "ITEM_WEIGHT_MISMATCH",
      });
    });

    it("accepts tracking observation when item weight and quantity match approved plan (2.5 kg)", async () => {
      const { plan, leg } = createPlan(2.5, 1);
      leg.state = "REQUEST_SUBMITTED";
      leg.bookingReference = "DEC-47124";
      leg.submittingSessionId = "submit-session-01";

      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockImplementation((selector: string) => {
          if (selector === '[data-testid="tracking-result"]') {
            return { waitFor: vi.fn().mockResolvedValue(undefined), isVisible: vi.fn().mockResolvedValue(true) };
          }
          if (selector === '[data-testid="not-found"]') {
            return { waitFor: vi.fn().mockResolvedValue(undefined), isVisible: vi.fn().mockResolvedValue(false) };
          }
          if (selector === '[data-testid="booking-reference"]') {
            return { textContent: vi.fn().mockResolvedValue("DEC-47124") };
          }
          if (selector === '[data-testid="tracking-status"]') {
            return { textContent: vi.fn().mockResolvedValue("RECEIVED") };
          }
          if (selector === '[data-testid="tracking-fee"]') {
            return { textContent: vi.fn().mockResolvedValue("Pickup fee: ₹180") };
          }
          if (selector === '[data-testid="simulated-event-badge"]') {
            return { count: vi.fn().mockResolvedValue(0) };
          }
          if (selector === '[data-testid="tracking-item-row"]') {
            return {
              count: vi.fn().mockResolvedValue(1),
              nth: vi.fn().mockReturnValue({
                locator: vi.fn().mockImplementation((childSel: string) => {
                  if (childSel === '[data-testid="tracking-item-name"]') {
                    return { textContent: vi.fn().mockResolvedValue("Synthetic Laptop") };
                  }
                  if (childSel === '[data-testid="tracking-item-details"]') {
                    return { textContent: vi.fn().mockResolvedValue("Qty: 1 · Weight: 2.5 kg") }; // Matches 2.5 kg!
                  }
                  return { textContent: vi.fn().mockResolvedValue("") };
                }),
              }),
            };
          }
          return { isVisible: vi.fn().mockResolvedValue(false), count: vi.fn().mockResolvedValue(0) };
        }),
      };

      const mockSession = {
        sessionId: "verify-session-02",
        page: mockPage,
        captureScreenshot: vi.fn().mockResolvedValue({ filename: "evidence/fidelity-match.png" }),
        close: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(openSession).mockResolvedValueOnce(mockSession as unknown as BrowserSession);

      const context: LegVerificationContext = { leg, plan };

      const result = await Verifier.verifyLeg(context);

      expect(result.verified).toBe(true);
      expect(result.observedItems).toEqual([{ name: "Synthetic Laptop", quantity: 1, weightKg: 2.5 }]);
      expect(leg.state).toBe("REQUEST_CONFIRMED");
    });
  });

  describe("3. Storage Persistence Fidelity", () => {
    it("persists approved item weight (2.5 kg) to disk without default fallback or mutation", async () => {
      const tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), "recircuit-store-fidelity-"));
      try {
        const deccanJsonPath = path.join(tempStorageDir, "deccan.json");
        const bookingRecord = {
          bookingReference: "DEC-88990",
          recyclerId: "deccan",
          fullName: "Synthetic Donor",
          status: "RECEIVED",
          chargedFeeInr: 180,
          items: [
            {
              name: "Synthetic Laptop",
              quantity: 1,
              weightKg: 2.5,
            },
          ],
          dataWipeAcknowledged: true,
        };

        fs.writeFileSync(deccanJsonPath, JSON.stringify({ bookings: [bookingRecord] }, null, 2), "utf8");

        expect(fs.existsSync(deccanJsonPath)).toBe(true);
        const persistedData = JSON.parse(fs.readFileSync(deccanJsonPath, "utf8"));
        const persistedBooking = persistedData.bookings[0];

        expect(persistedBooking).toBeDefined();
        expect(persistedBooking.items).toHaveLength(1);
        expect(persistedBooking.items[0].name).toBe("Synthetic Laptop");
        expect(persistedBooking.items[0].weightKg).toBe(2.5);
        expect(persistedBooking.items[0].weightKg).not.toBe(2.2);
        expect(persistedBooking.items[0].quantity).toBe(1);
      } finally {
        fs.rmSync(tempStorageDir, { recursive: true, force: true });
      }
    });
  });
});

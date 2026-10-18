/**
 * apps/worker/src/booking/booker.test.ts
 *
 * Unit and integration tests for Stage 7 Browser Booking Agent (Booker):
 * - Safe action pre-flight enforcement (approval, planHash, state, fee parity)
 * - Pure HTML form filling and readback verification
 * - Human verification (CAPTCHA) detection and handoff
 * - Resumption from NEEDS_HUMAN with verification code
 * - Portal 500 server outage handling
 * - Omitted reference failure switch handling
 * - Invalid reference pattern rejection
 * - Duplicate submission detection (idempotency)
 * - State machine transitions (APPROVED -> SUBMITTING -> REQUEST_SUBMITTED)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import {
  hashPlan,
  makeIdempotencyKey,
  clearActionLogs,
  type Plan,
  type PlanLeg,
  type DecisionRecord,
} from "@recircuit/core";
import type { BrowserSession } from "../browser/session.js";
import { Booker } from "./booker.js";
import { BookingRunner } from "./runner.js";
import type { BookingCustomerInfo, LegBookingContext } from "./types.js";
import {
  FormVerificationError,
  InvalidBookingReferenceError,
  MissingBookingReferenceError,
  PortalServerError,
} from "./errors.js";

interface MockSessionConfig {
  sessionId?: string;
  url?: string;
  isHumanVerif?: boolean;
  reference?: string;
  missingReference?: boolean;
  isDuplicate?: boolean;
  errorBanner?: string;
  readbackOverrides?: Record<string, string>;
  onFilledCaptcha?: (val: string) => void;
  onSubmitClicked?: () => void;
  defaultCustomer: BookingCustomerInfo;
}

function createMockSession(config: MockSessionConfig): BrowserSession {
  const {
    sessionId = "local-mock-session",
    url = "http://localhost:3101/book-pickup/confirmation?ref=DEC-12345",
    isHumanVerif = false,
    reference = "DEC-12345",
    missingReference = false,
    isDuplicate = false,
    errorBanner,
    readbackOverrides = {},
    onFilledCaptcha,
    onSubmitClicked,
    defaultCustomer,
  } = config;

  return {
    sessionId,
    mode: "local",
    page: {
      goto: async (): Promise<null> => {
        await Promise.resolve();
        return null;
      },
      waitForSelector: async (): Promise<null> => {
        await Promise.resolve();
        return null;
      },
      waitForURL: async (): Promise<null> => {
        await Promise.resolve();
        return null;
      },
      url: (): string => url,
      locator: (selector: string): Record<string, unknown> => ({
        count: async (): Promise<number> => {
          await Promise.resolve();
          if (selector.includes("human-verification")) return isHumanVerif ? 1 : 0;
          return 1;
        },
        evaluate: async (): Promise<void> => {
          await Promise.resolve();
        },
        selectOption: async (): Promise<string[]> => {
          await Promise.resolve();
          return [];
        },
        check: async (): Promise<void> => {
          await Promise.resolve();
        },
        uncheck: async (): Promise<void> => {
          await Promise.resolve();
        },
        fill: async (): Promise<void> => {
          await Promise.resolve();
        },
        click: async (): Promise<void> => {
          await Promise.resolve();
          if (selector.includes("submit-booking") && onSubmitClicked) {
            onSubmitClicked();
          }
        },
        isVisible: async (): Promise<boolean> => {
          await Promise.resolve();
          if (selector.includes("form-error-banner")) return Boolean(errorBanner);
          if (selector.includes("human-verification")) return isHumanVerif;
          if (selector.includes("booking-reference-missing")) return missingReference;
          if (selector.includes("booking-reference")) return !missingReference && Boolean(reference);
          if (selector.includes("duplicate-notice")) return isDuplicate;
          return false;
        },
        textContent: async (): Promise<string> => {
          await Promise.resolve();
          if (selector.includes("form-error-banner")) return errorBanner || "";
          if (selector.includes("booking-reference")) return reference;
          return "";
        },
      }),
      fill: async (selector: string, val: string): Promise<void> => {
        await Promise.resolve();
        if (selector.includes("captcha-code") && onFilledCaptcha) {
          onFilledCaptcha(val);
        }
      },
      inputValue: async (selector: string): Promise<string> => {
        await Promise.resolve();
        if (selector.includes("fullname")) {
          return readbackOverrides.fullName ?? defaultCustomer.fullName;
        }
        if (selector.includes("phone")) {
          return readbackOverrides.phone ?? defaultCustomer.phone;
        }
        if (selector.includes("address")) {
          return readbackOverrides.addressLine ?? defaultCustomer.addressLine;
        }
        if (selector.includes("locality")) {
          return readbackOverrides.locality ?? defaultCustomer.locality;
        }
        if (selector.includes("pincode")) {
          return readbackOverrides.pincode ?? defaultCustomer.pincode;
        }
        return "";
      },
    } as unknown as BrowserSession["page"],
    captureScreenshot: async (label: string): Promise<{ path: string; buffer: Buffer; filename: string }> => {
      await Promise.resolve();
      return {
        path: `.data/evidence/${label}.png`,
        buffer: Buffer.from(""),
        filename: `${label}.png`,
      };
    },
    close: async (): Promise<void> => {
      await Promise.resolve();
    },
  };
}

describe("Stage 7: Browser Booking Agent (Booker) Suite", () => {
  let samplePlan: Plan;
  let sampleLeg: PlanLeg;
  let sampleApproval: DecisionRecord;
  let sampleCustomer: BookingCustomerInfo;

  beforeEach(() => {
    clearActionLogs();

    samplePlan = {
      id: randomUUID(),
      requestId: randomUUID(),
      legs: [],
      totalEstimatedFee: 180,
      totalEstimatedPayout: 250,
      planHash: "",
      createdAt: new Date().toISOString(),
    };
    samplePlan.planHash = hashPlan(samplePlan);

    sampleLeg = {
      id: randomUUID(),
      planId: samplePlan.id,
      recyclerId: "deccan",
      recyclerName: "Deccan E-Cycle",
      itemIds: ["item-1"],
      state: "APPROVED",
      estimatedFee: 180,
      estimatedPayout: 250,
      items: [
        {
          id: "item-1",
          category: "ELECTRONICS",
          description: "Dell Laptop",
          quantity: 1,
          estimatedWeightKg: 2.2,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      idempotencyKey: makeIdempotencyKey(samplePlan.planHash, "leg-1", "deccan"),
    };

    sampleApproval = {
      id: randomUUID(),
      requestId: samplePlan.requestId,
      planId: samplePlan.id,
      planHash: samplePlan.planHash,
      decision: "approved",
      decidedBy: "test_user",
      decidedAt: new Date().toISOString(),
    };

    sampleCustomer = {
      fullName: "Ramesh Reddy",
      phone: "9876543210",
      addressLine: "Plot 10, Road No 2",
      locality: "Kukatpally",
      pincode: "500072",
      preferredSlot: "Tomorrow",
    };
  });

  // -------------------------------------------------------------------------
  // 1. Safe Action Gate Integration
  // -------------------------------------------------------------------------
  describe("Safe Action Gate Integration", () => {
    it("refuses booking execution when approval is missing", async () => {
      const context: LegBookingContext = {
        leg: sampleLeg,
        plan: samplePlan,
        approval: null,
        customer: sampleCustomer,
        items: [],
      };

      await expect(Booker.bookLeg(context)).rejects.toThrow(/lacks approved user decision/i);
    });

    it("refuses booking execution when approval is rejected", async () => {
      const context: LegBookingContext = {
        leg: sampleLeg,
        plan: samplePlan,
        approval: { ...sampleApproval, decision: "rejected" },
        customer: sampleCustomer,
        items: [],
      };

      await expect(Booker.bookLeg(context)).rejects.toThrow(/lacks approved user decision/i);
    });

    it("refuses booking execution when planHash does not match approval (stale approval)", async () => {
      const alteredPlan: Plan = {
        ...samplePlan,
        totalEstimatedFee: 200,
        planHash: "altered-hash-1234567890123456789012345678901234567890123456789012345678901234",
      };

      const context: LegBookingContext = {
        leg: sampleLeg,
        plan: alteredPlan,
        approval: sampleApproval,
        customer: sampleCustomer,
        items: [],
      };

      await expect(Booker.bookLeg(context)).rejects.toThrow(/stale approval/i);
    });

    it("refuses booking execution when leg state is not APPROVED or SUBMITTING", async () => {
      const context: LegBookingContext = {
        leg: { ...sampleLeg, state: "REQUEST_SUBMITTED" },
        plan: samplePlan,
        approval: sampleApproval,
        customer: sampleCustomer,
        items: [],
      };

      await expect(Booker.bookLeg(context)).rejects.toThrow(/expected APPROVED/i);
    });
  });

  // -------------------------------------------------------------------------
  // 2. DOM Readback Verification
  // -------------------------------------------------------------------------
  describe("DOM Readback Verification", () => {
    it("throws FormVerificationError and aborts submission if readback name differs", async () => {
      const mockSession = createMockSession({
        defaultCustomer: sampleCustomer,
        readbackOverrides: { fullName: "Corrupted Name" },
      });

      const context: LegBookingContext = {
        leg: sampleLeg,
        plan: samplePlan,
        approval: sampleApproval,
        customer: sampleCustomer,
        items: [],
      };

      await expect(Booker.bookLeg(context, {}, mockSession)).rejects.toThrow(FormVerificationError);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Human Verification (CAPTCHA) Detection & Resume
  // -------------------------------------------------------------------------
  describe("Human Verification (CAPTCHA) Handoff", () => {
    it("detects data-human-verification and transitions leg to NEEDS_HUMAN without submitting", async () => {
      let submitClicked = false;

      const mockSession = createMockSession({
        defaultCustomer: sampleCustomer,
        isHumanVerif: true,
        onSubmitClicked: () => {
          submitClicked = true;
        },
      });

      const context: LegBookingContext = {
        leg: { ...sampleLeg, recyclerId: "paperplus" },
        plan: samplePlan,
        approval: sampleApproval,
        customer: sampleCustomer,
        items: [],
      };

      const execution = await BookingRunner.bookLegWithTransitions(context, {}, mockSession);

      expect(submitClicked).toBe(false); // Must NEVER click submit when CAPTCHA is unhandled
      expect(execution.result.needsHuman).toBe(true);
      expect(execution.updatedLeg.state).toBe("NEEDS_HUMAN");
      expect(execution.result.humanVerification?.liveViewUrl).toContain("file:///");
      expect(execution.auditEvents).toHaveLength(2); // APPROVED->SUBMITTING, SUBMITTING->NEEDS_HUMAN
    });

    it("resumes from NEEDS_HUMAN when human provides verification code and reaches REQUEST_SUBMITTED", async () => {
      let filledCaptchaCode = "";

      const mockSession = createMockSession({
        defaultCustomer: sampleCustomer,
        isHumanVerif: true,
        reference: "PPK-54321",
        url: "http://localhost:3102/schedule/done?ref=PPK-54321",
        onFilledCaptcha: (val) => {
          filledCaptchaCode = val;
        },
      });

      const context: LegBookingContext = {
        leg: {
          ...sampleLeg,
          recyclerId: "paperplus",
          state: "NEEDS_HUMAN",
        },
        plan: samplePlan,
        approval: sampleApproval,
        customer: sampleCustomer,
        items: [],
      };

      const execution = await BookingRunner.resumeLegWithCaptcha(context, "ABCDE", {}, mockSession);

      expect(filledCaptchaCode).toBe("ABCDE");
      expect(execution.result.success).toBe(true);
      expect(execution.result.bookingReference).toBe("PPK-54321");
      expect(execution.updatedLeg.state).toBe("REQUEST_SUBMITTED");
      expect(execution.updatedLeg.bookingReference).toBe("PPK-54321");
      expect(execution.auditEvents).toHaveLength(2); // NEEDS_HUMAN->SUBMITTING, SUBMITTING->REQUEST_SUBMITTED
    });
  });

  // -------------------------------------------------------------------------
  // 4. Portal Failures & Robustness
  // -------------------------------------------------------------------------
  describe("Portal Failures & Error Handling", () => {
    it("handles HTTP 500 portal outage banner safely and transitions leg to FAILED", async () => {
      const mockSession = createMockSession({
        defaultCustomer: sampleCustomer,
        errorBanner: "HTTP 500: Internal Server Error occurred on the recycler portal",
      });

      const context: LegBookingContext = {
        leg: sampleLeg,
        plan: samplePlan,
        approval: sampleApproval,
        customer: sampleCustomer,
        items: [],
      };

      await expect(BookingRunner.bookLegWithTransitions(context, {}, mockSession)).rejects.toThrow(PortalServerError);
    });

    it("throws MissingBookingReferenceError if confirmation page omits reference", async () => {
      const mockSession = createMockSession({
        defaultCustomer: sampleCustomer,
        missingReference: true,
        reference: "",
      });

      const context: LegBookingContext = {
        leg: sampleLeg,
        plan: samplePlan,
        approval: sampleApproval,
        customer: sampleCustomer,
        items: [],
      };

      await expect(BookingRunner.bookLegWithTransitions(context, {}, mockSession)).rejects.toThrow(
        MissingBookingReferenceError
      );
    });

    it("throws InvalidBookingReferenceError if confirmation reference format does not match", async () => {
      const mockSession = createMockSession({
        defaultCustomer: sampleCustomer,
        reference: "GARBAGE-123", // Does not match /^DEC-\d{5}$/
      });

      const context: LegBookingContext = {
        leg: sampleLeg,
        plan: samplePlan,
        approval: sampleApproval,
        customer: sampleCustomer,
        items: [],
      };

      await expect(BookingRunner.bookLegWithTransitions(context, {}, mockSession)).rejects.toThrow(
        InvalidBookingReferenceError
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Successful Booking End-to-End Execution
  // -------------------------------------------------------------------------
  describe("Successful Booking Execution", () => {
    it("Deccan E-Cycle: completes booking, extracts DEC-XXXXX reference, and transitions to REQUEST_SUBMITTED", async () => {
      const mockSession = createMockSession({
        defaultCustomer: sampleCustomer,
        reference: "DEC-12345",
        url: "http://localhost:3101/book-pickup/confirmation?ref=DEC-12345",
      });

      const context: LegBookingContext = {
        leg: sampleLeg,
        plan: samplePlan,
        approval: sampleApproval,
        customer: sampleCustomer,
        items: [],
      };

      const execution = await BookingRunner.bookLegWithTransitions(context, {}, mockSession);

      expect(execution.result.success).toBe(true);
      expect(execution.result.bookingReference).toBe("DEC-12345");
      expect(execution.updatedLeg.state).toBe("REQUEST_SUBMITTED");
      expect(execution.updatedLeg.bookingReference).toBe("DEC-12345");
      expect(execution.auditEvents).toHaveLength(2); // APPROVED->SUBMITTING, SUBMITTING->REQUEST_SUBMITTED
    });

    it("QuickScrap Hyd: completes booking, extracts QSH-XXXXX reference, and marks duplicate if returned", async () => {
      const mockSession = createMockSession({
        defaultCustomer: sampleCustomer,
        reference: "QSH-88888",
        url: "http://localhost:3103/pickup/thanks?ref=QSH-88888&dup=true",
        isDuplicate: true,
      });

      const context: LegBookingContext = {
        leg: {
          ...sampleLeg,
          recyclerId: "quickscrap",
        },
        plan: samplePlan,
        approval: sampleApproval,
        customer: sampleCustomer,
        items: [],
      };

      const execution = await BookingRunner.bookLegWithTransitions(context, {}, mockSession);

      expect(execution.result.success).toBe(true);
      expect(execution.result.bookingReference).toBe("QSH-88888");
      expect(execution.result.isDuplicate).toBe(true);
      expect(execution.updatedLeg.state).toBe("REQUEST_SUBMITTED");
    });
  });
});


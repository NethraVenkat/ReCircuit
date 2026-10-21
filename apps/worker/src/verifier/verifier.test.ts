import { describe, it, expect, vi, beforeEach } from "vitest";
import { Verifier, VerifierError } from "./verifier.js";
import { VerificationRunner } from "./runner.js";
import type { LegVerificationContext } from "./types.js";
import type { PlanLeg, Plan } from "@recircuit/core";
import fs from "fs";

// Mock the browser session
vi.mock("../browser/session.js", () => {
  return {
    openSession: vi.fn(),
  };
});

import { openSession, type BrowserSession } from "../browser/session.js";

describe("Stage 8: Independent Verifier Unit Tests", () => {
  const mockPlan: Plan = {
    id: "plan-123",
    requestId: "req-123",
    legs: [],
    totalEstimatedFee: 180,
    totalEstimatedPayout: 0,
    planHash: "abc123hash",
    createdAt: new Date().toISOString(),
  };

  const mockLeg: PlanLeg = {
    id: "leg-1",
    planId: "plan-123",
    recyclerId: "deccan",
    recyclerName: "Deccan E-Cycle",
    itemIds: ["item-1"],
    state: "REQUEST_SUBMITTED",
    estimatedFee: 180,
    estimatedPayout: 0,
    bookingReference: "DEC-12345",
    submittingSessionId: "submitting-session-001",
    items: [{ id: "item-1", name: "Dell Laptop", quantity: 1, estimatedWeightKg: 2.2 }],
    idempotencyKey: "idemp-key-123",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws MISSING_BOOKING_REFERENCE if leg has no booking reference", async () => {
    const legWithoutRef = { ...mockLeg };
    delete legWithoutRef.bookingReference;

    const context: LegVerificationContext = {
      leg: legWithoutRef,
      plan: mockPlan,
    };

    await expect(Verifier.verifyLeg(context)).rejects.toThrow(VerifierError);
    await expect(Verifier.verifyLeg(context)).rejects.toMatchObject({
      code: "MISSING_BOOKING_REFERENCE",
    });
  });

  it("throws INVALID_REFERENCE_FORMAT if reference does not match recycler pattern", async () => {
    const context: LegVerificationContext = {
      leg: { ...mockLeg, bookingReference: "INVALID-999" },
      plan: mockPlan,
    };

    await expect(Verifier.verifyLeg(context)).rejects.toThrow(VerifierError);
    await expect(Verifier.verifyLeg(context)).rejects.toMatchObject({
      code: "INVALID_REFERENCE_FORMAT",
    });
  });

  it("enforces session independence: throws SESSION_NOT_INDEPENDENT if verifying session matches submitting session", async () => {
    const mockSession = {
      sessionId: "submitting-session-001", // SAME session ID!
      page: {},
      captureScreenshot: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(openSession).mockResolvedValue(mockSession as unknown as BrowserSession);

    const context: LegVerificationContext = {
      leg: { ...mockLeg, submittingSessionId: "submitting-session-001" },
      plan: mockPlan,
    };

    await expect(Verifier.verifyLeg(context)).rejects.toMatchObject({
      name: "VerifierError",
      code: "SESSION_NOT_INDEPENDENT",
    });
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("throws CONSIGNMENT_NOT_FOUND when tracking page renders not-found indicator", async () => {
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockImplementation((selector: string) => {
        if (selector === '[data-testid="tracking-result"]') {
          return {
            waitFor: vi.fn().mockRejectedValue(new Error("Timeout")),
            isVisible: vi.fn().mockResolvedValue(false),
          };
        }
        if (selector === '[data-testid="not-found"]') {
          return {
            waitFor: vi.fn().mockResolvedValue(undefined),
            isVisible: vi.fn().mockResolvedValue(true),
          };
        }
        return { isVisible: vi.fn().mockResolvedValue(false) };
      }),
    };

    const mockSession = {
      sessionId: "verifying-session-002", // Different session ID
      page: mockPage,
      captureScreenshot: vi.fn().mockResolvedValue({ filename: "evidence/not-found.png" }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(openSession).mockResolvedValue(mockSession as unknown as BrowserSession);

    const context: LegVerificationContext = {
      leg: { ...mockLeg },
      plan: mockPlan,
    };

    await expect(Verifier.verifyLeg(context)).rejects.toMatchObject({
      name: "VerifierError",
      code: "CONSIGNMENT_NOT_FOUND",
    });
  });

  it("successfully verifies valid booking, transitions state to REQUEST_CONFIRMED, and records audit event", async () => {
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockImplementation((selector: string) => {
        if (selector === '[data-testid="tracking-result"]') {
          return {
            waitFor: vi.fn().mockResolvedValue(undefined),
            isVisible: vi.fn().mockResolvedValue(true),
          };
        }
        if (selector === '[data-testid="not-found"]') {
          return {
            waitFor: vi.fn().mockResolvedValue(undefined),
            isVisible: vi.fn().mockResolvedValue(false),
          };
        }
        if (selector === '[data-testid="booking-reference"]') {
          return { textContent: vi.fn().mockResolvedValue("DEC-12345") };
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
              locator: vi.fn().mockImplementation((subSel: string) => {
                if (subSel === '[data-testid="tracking-item-name"]') {
                  return { textContent: vi.fn().mockResolvedValue("Laptop") };
                }
                if (subSel === '[data-testid="tracking-item-details"]') {
                  return { textContent: vi.fn().mockResolvedValue("Qty: 1 · Weight: 2.2 kg") };
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
      sessionId: "verifying-session-002", // Independent!
      page: mockPage,
      captureScreenshot: vi.fn().mockResolvedValue({ filename: "evidence/verification-DEC-12345.png" }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(openSession).mockResolvedValueOnce(mockSession as unknown as BrowserSession);

    const testLeg = { ...mockLeg };
    const context: LegVerificationContext = {
      leg: testLeg,
      plan: mockPlan,
    };

    const result = await Verifier.verifyLeg(context);

    expect(result.verified).toBe(true);
    expect(result.bookingReference).toBe("DEC-12345");
    expect(result.observedStatus).toBe("RECEIVED");
    expect(result.verifyingSessionId).toBe("verifying-session-002");
    expect(result.submittingSessionId).toBe("submitting-session-001");
    expect(result.verifyingSessionId).not.toBe(result.submittingSessionId);
    expect(result.observedItems).toEqual([{ name: "Laptop", quantity: 1, weightKg: 2.2 }]);

    // Leg state transitioned to REQUEST_CONFIRMED
    expect(testLeg.state).toBe("REQUEST_CONFIRMED");
    expect(result.auditEvent).toBeDefined();
    expect(result.auditEvent?.newState).toBe("REQUEST_CONFIRMED");
  });

  it("enforces TC4 invariant: throws TC4_UNVERIFIED_COLLECTION if tracking shows PICKED_UP without pickup confirmation", async () => {
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
          return { textContent: vi.fn().mockResolvedValue("DEC-12345") };
        }
        if (selector === '[data-testid="tracking-status"]') {
          return { textContent: vi.fn().mockResolvedValue("PICKED_UP") }; // Portal claims picked up!
        }
        if (selector === '[data-testid="tracking-fee"]') {
          return { textContent: vi.fn().mockResolvedValue("Pickup fee: ₹180") };
        }
        if (selector === '[data-testid="simulated-event-badge"]') {
          return { count: vi.fn().mockResolvedValue(1) };
        }
        if (selector === '[data-testid="tracking-item-row"]') {
          return { count: vi.fn().mockResolvedValue(0) };
        }
        return { isVisible: vi.fn().mockResolvedValue(false), count: vi.fn().mockResolvedValue(0) };
      }),
    };

    const mockSession = {
      sessionId: "verifying-session-002",
      page: mockPage,
      captureScreenshot: vi.fn().mockResolvedValue({ filename: "evidence/pickup-unverified.png" }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(openSession).mockResolvedValue(mockSession as unknown as BrowserSession);

    const testLeg = { ...mockLeg }; // Not collected!
    const context: LegVerificationContext = {
      leg: testLeg,
      plan: mockPlan,
    };

    await expect(Verifier.verifyLeg(context)).rejects.toMatchObject({
      name: "VerifierError",
      code: "TC4_UNVERIFIED_COLLECTION",
    });

    // Leg must remain REQUEST_SUBMITTED
    expect(testLeg.state).toBe("REQUEST_SUBMITTED");
  });

  it("VerificationRunner writes proof ledger file to .data/verifications/", async () => {
    const mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockImplementation((selector: string) => {
        if (selector === '[data-testid="tracking-result"]') return { waitFor: vi.fn().mockResolvedValue(undefined), isVisible: vi.fn().mockResolvedValue(true) };
        if (selector === '[data-testid="not-found"]') return { waitFor: vi.fn().mockResolvedValue(undefined), isVisible: vi.fn().mockResolvedValue(false) };
        if (selector === '[data-testid="booking-reference"]') return { textContent: vi.fn().mockResolvedValue("DEC-12345") };
        if (selector === '[data-testid="tracking-status"]') return { textContent: vi.fn().mockResolvedValue("RECEIVED") };
        if (selector === '[data-testid="tracking-fee"]') return { textContent: vi.fn().mockResolvedValue("Pickup fee: ₹180") };
        if (selector === '[data-testid="simulated-event-badge"]') return { count: vi.fn().mockResolvedValue(0) };
        if (selector === '[data-testid="tracking-item-row"]') return { count: vi.fn().mockResolvedValue(0) };
        return { isVisible: vi.fn().mockResolvedValue(false), count: vi.fn().mockResolvedValue(0) };
      }),
    };

    const mockSession = {
      sessionId: "verifying-session-003",
      page: mockPage,
      captureScreenshot: vi.fn().mockResolvedValue({ filename: "evidence/proof.png" }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(openSession).mockResolvedValueOnce(mockSession as unknown as BrowserSession);

    const testLeg = { ...mockLeg };
    const context: LegVerificationContext = { leg: testLeg, plan: mockPlan };

    const result = await VerificationRunner.verifyLegWithAudit(context);
    expect(result.verified).toBe(true);

    const savedFile = `.data/verifications/${result.bookingReference}.json`;
    expect(fs.existsSync(savedFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(savedFile, "utf-8")) as {
      bookingReference: string;
      verifyingSessionId: string;
    };
    expect(parsed.bookingReference).toBe("DEC-12345");
    expect(parsed.verifyingSessionId).toBe("verifying-session-003");
  });
});

import { it, expect, vi } from "vitest";
import { Verifier } from "./verifier.js";
import type { BrowserSession } from "../browser/session.js";
import type { Plan, PlanLeg } from "@recircuit/core";

function fixture(fee: string, status = "RECEIVED"): { session: BrowserSession; leg: PlanLeg; plan: Plan } {
  const leg: PlanLeg = { id: "fee-leg", planId: "fee-plan", recyclerId: "deccan", recyclerName: "Deccan", itemIds: [], state: "REQUEST_SUBMITTED", estimatedFee: 180, estimatedPayout: 0, bookingReference: "DEC-12345", submittingSessionId: "submit-fixture", createdAt: "2026-10-22", updatedAt: "2026-10-22" };
  const session = {
    sessionId: "independent-fixture", close: vi.fn().mockResolvedValue(undefined),
    page: { goto: vi.fn().mockResolvedValue(undefined), locator: (selector: string) => ({ waitFor: vi.fn().mockResolvedValue(undefined), isVisible: vi.fn().mockResolvedValue(selector.includes("tracking-result")), count: vi.fn().mockResolvedValue(0), textContent: vi.fn().mockResolvedValue(selector.includes("booking-reference") ? "DEC-12345" : selector.includes("tracking-status") ? status : fee) }) },
    captureScreenshot: vi.fn().mockResolvedValue({ filename: "fixture.png" }),
  } as unknown as BrowserSession;
  return { session, leg, plan: { id: "fee-plan", requestId: "fixture", legs: [leg], totalEstimatedFee: 180, totalEstimatedPayout: 0, planHash: "fixture", createdAt: "2026-10-22" } };
}
it("rejects a tracking fee that differs from approval", async () => {
  const f = fixture("Pickup fee: ₹199");
  await expect(Verifier.verifyLeg({ leg: f.leg, plan: f.plan }, {}, f.session)).rejects.toMatchObject({ code: "FEE_MISMATCH" });
  expect(f.leg.state).toBe("REQUEST_SUBMITTED");
});
it("keeps missing fee and unknown status uncertain", async () => {
  for (const [fee, status] of [["Unavailable", "RECEIVED"], ["₹180", "UNRECOGNIZED"]]) {
    const f = fixture(fee!, status);
    const result = await Verifier.verifyLeg({ leg: f.leg, plan: f.plan }, {}, f.session);
    expect(result.verified).toBe(false); expect(result.isUncertain).toBe(true); expect(f.leg.state).toBe("REQUEST_SUBMITTED");
  }
});

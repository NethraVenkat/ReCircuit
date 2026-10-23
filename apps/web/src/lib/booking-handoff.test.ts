import { beforeEach, expect, it, vi } from "vitest";
import { hashPlan, type Plan } from "@recircuit/core";
import type { RequestRecord } from "@recircuit/db";
const mock = vi.hoisted(() => ({ owned: vi.fn(), save: vi.fn(), start: vi.fn(), resume: vi.fn(), open: vi.fn(), code: vi.fn() }));
vi.mock("@recircuit/db", () => ({ getRepository: () => ({ saveRequest: mock.save }) }));
vi.mock("./household", () => ({
  owned: mock.owned, locked: async (_id: string, run: () => Promise<unknown>) => run(), sameOrigin: () => {},
  customerSchema: { parse: (value: unknown) => value },
  failure: (err: Error) => ({ body: { error: err.message }, status: err.message === "NOT_FOUND" ? 404 : err.message.startsWith("STALE") ? 409 : 503 }),
}));
vi.mock("./production-config", () => ({ assertProductionConfiguration: () => {} }));
vi.mock("@recircuit/worker", () => ({ BookingRunner: { bookLegWithTransitions: mock.start, resumeInSession: mock.resume }, openSession: mock.open, HumanVerificationService: { submitVerificationCode: mock.code }, getPortalBaseUrl: () => "https://deccan.example.test" }));
import { POST } from "../app/api/book/route";
const id = "f9f9f9f9-1111-4111-8111-111111111111";
let stored: RequestRecord;
let revision: number;
function post(extra: object = {}) { return POST(new Request("http://localhost/api/book", { method: "POST", body: JSON.stringify({ requestId: id, planHash: stored.plan!.planHash, ...extra }) })); }
beforeEach(() => {
  vi.clearAllMocks(); revision = 4;
  const plan = { id: "plan", requestId: id, totalEstimatedFee: 180, totalEstimatedPayout: 0, legs: [{ id: "leg", recyclerId: "deccan", itemIds: [], items: [], state: "NEEDS_HUMAN", estimatedFee: 180, estimatedPayout: 0 }] } as unknown as Plan;
  plan.planHash = hashPlan(plan);
  stored = { revision, request: { id, state: "APPROVED", userId: "owner" }, plan, approval: { decision: "approved", planHash: plan.planHash }, items: [], auditEvents: [], household: { customer: {}, policyMode: "live", policies: [{ recyclerId: "deccan", provenance: "live", status: "SUCCESS", freshness: "fresh", expiresAt: new Date(Date.now() + 600000).toISOString() }], humanHandoffs: { leg: { sessionId: "saved-session", screenshotRef: "storage://recircuit-evidence/test.png", expiresAt: new Date(Date.now() + 600000).toISOString() } } } } as unknown as RequestRecord;
  mock.owned.mockImplementation(() => structuredClone(stored));
  mock.save.mockImplementation((record: RequestRecord) => {
    if (record.revision !== revision) throw new Error("STALE: revision");
    record.revision = ++revision; stored = structuredClone(record);
  });
});
it("resumes a persisted handoff with a fresh session and carries updated database revisions", async () => {
  const close = vi.fn(); mock.open.mockResolvedValue({ page: { url: () => "https://deccan.example.test/book-pickup" }, close });
  mock.resume.mockImplementation(({ leg }) => ({ updatedLeg: { ...leg, state: "REQUEST_SUBMITTED", bookingReference: "DEC-TEST1" }, auditEvents: [], result: { success: true } }));
  const response = await post({ legId: "leg", humanCode: "ABCDE" });
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
  expect(mock.open).toHaveBeenCalledWith({ mode: "browserbase", resumeSessionId: "saved-session" });
  expect(mock.code).toHaveBeenCalledOnce(); expect(mock.start).not.toHaveBeenCalled();
  expect(stored.plan!.legs[0]!.state).toBe("REQUEST_SUBMITTED"); expect(stored.revision).toBe(6);
  expect(stored.household!.humanHandoffs).toEqual({}); expect(close).toHaveBeenCalledOnce();
});
it.each(["session", "policy", "approval"])("rejects stale %s before connecting or consuming human input", async kind => {
  if (kind === "session") (stored.household!.humanHandoffs as Record<string, { expiresAt: string }>).leg!.expiresAt = "invalid";
  if (kind === "policy") (stored.household!.policies as Array<{ expiresAt: string }>)[0]!.expiresAt = new Date(0).toISOString();
  if (kind === "approval") stored.plan!.totalEstimatedFee++;
  expect((await post({ legId: "leg", humanCode: "ABCDE" })).status).toBe(409);
  expect(mock.open).not.toHaveBeenCalled(); expect(mock.code).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
});
it("rejects another household before reconnecting", async () => {
  mock.owned.mockRejectedValue(new Error("NOT_FOUND"));
  expect((await post({ legId: "leg", humanCode: "ABCDE" })).status).toBe(404);
  expect(mock.open).not.toHaveBeenCalled();
});
it("persists a paused session before disconnecting and handles only one approved leg per invocation", async () => {
  stored.plan!.legs[0]!.state = "APPROVED";
  stored.plan!.legs.push({ ...stored.plan!.legs[0]!, id: "second-leg" });
  stored.plan!.planHash = hashPlan(stored.plan!);
  stored.approval = { ...stored.approval, planHash: stored.plan!.planHash } as RequestRecord["approval"];
  const disconnect = vi.fn(() => { expect((stored.household!.humanHandoffs as Record<string, { sessionId: string }>).leg!.sessionId).toBe("new-session"); });
  mock.start.mockImplementation(({ leg }) => ({ updatedLeg: { ...leg, state: "NEEDS_HUMAN" }, auditEvents: [], result: { needsHuman: true, sessionId: "new-session", humanVerification: { screenshotRef: "storage://recircuit-evidence/new.png" }, session: { mode: "browserbase", disconnect } } }));
  expect((await post()).status).toBe(200);
  expect(disconnect).toHaveBeenCalledOnce(); expect(mock.start).toHaveBeenCalledOnce();
  expect(stored.plan!.legs[1]!.state).toBe("APPROVED"); expect(stored.revision).toBe(7);
});
it("preserves uncertain submission state on connection failure and does not create a new booking", async () => {
  mock.open.mockRejectedValue(new Error("Browserbase unavailable"));
  expect((await post({ legId: "leg", humanCode: "ABCDE" })).status).toBe(503);
  expect(stored.plan!.legs[0]!.state).toBe("SUBMITTING");
  expect(mock.start).not.toHaveBeenCalled(); expect(mock.resume).not.toHaveBeenCalled();
});

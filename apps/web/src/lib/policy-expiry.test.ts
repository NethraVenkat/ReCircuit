import { beforeEach, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileRepository, getRepository, setRepository } from "@recircuit/db";
import { DECCAN_EXTRACTION, hashPlan } from "@recircuit/core";
import { clearPolicyCache } from "./policy-cache";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), read: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => ({ value: "expiry-test-owner" }) }) }));
vi.mock("@recircuit/worker", () => ({
  openSession: async () => ({ close: async () => {} }),
  readRecyclerPolicy: mocks.read,
  BookingRunner: { bookLegWithTransitions: mocks.submit },
}));
import { POST as plan } from "../app/api/plan/route";
import { POST as approve } from "../app/api/approve/route";
import { POST as book } from "../app/api/book/route";

function request(route: string, body: unknown) {
  return new Request(`http://localhost/api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(async () => {
  vi.useRealTimers();
  clearPolicyCache();
  mocks.submit.mockReset();
  mocks.submit.mockImplementation(async ({ leg }) => ({ updatedLeg: { ...leg, state: "REQUEST_SUBMITTED" }, auditEvents: [], result: {} }));
  mocks.read.mockImplementation(async (id: string) => ({ ...DECCAN_EXTRACTION, acceptedCategories: ["laptop"], rejectedCategories: [], freeThresholdKg: 5, underWeightFeeInr: 180, minWeightKg: null, requiresDataWipeAck: true, rates: [], recyclerId: id, status: id === "deccan" ? "SUCCESS" : "FAILED", feesUnknown: false, evidence: { url: "http://127.0.0.1:3101", textHash: "synthetic-live-test", screenshotPath: "", sessionId: "expiry-test", extractionPath: "generic-ai", extractedAt: new Date().toISOString() } }));
  const dir = await mkdtemp(path.join(os.tmpdir(), "recircuit-expiry-"));
  process.env.RECIRCUIT_DATA_DIR = dir;
  setRepository(new FileRepository(dir));
});

async function generate() {
  const response = await plan(request("plan", { mode: "live", items: [{ id: "12345678-1234-4123-8123-123456789012", rawText: "Laptop", category: "laptop", quantity: 1, declaredWeightKg: 2.5, weightSource: "user_declared", hazardClass: "none", confidence: 1 }] }));
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
  const body = await response.json();
  expect(body.policyMode).toBe("live");
  expect(body.plan.legs).toHaveLength(1);
  expect(body.plan.totalEstimatedFee).toBe(180);
  return { requestId: body.requestId as string, planHash: hashPlan(body.plan) };
}
async function expire(id: string) {
  const stored = (await getRepository().getRequest(id))!;
  const original = JSON.stringify(stored.plan);
  const policies = stored.household!.policies as Array<{ expiresAt?: string }>;
  policies.forEach(p => { p.expiresAt = new Date(Date.now() - 1000).toISOString(); });
  await getRepository().saveRequest(stored);
  expect(JSON.stringify((await getRepository().getRequest(id))!.plan)).toBe(original);
}
async function decide(body: { requestId: string; planHash: string }) {
  const response = await approve(request("approve", { ...body, decision: "approve", dataWipeConfirmed: true }));
  if (response.status === 200) body.planHash = hashPlan((await response.clone().json()).plan);
  return response;
}
it("rejects expired evidence before approval with unchanged plan and zero submissions", async () => {
  const body = await generate();
  await expire(body.requestId);
  const response = await decide(body);
  console.info("expired-before-approval", response.status, await response.clone().json());
  expect(response.status).toBe(409);
  const stored = (await getRepository().getRequest(body.requestId))!;
  expect(stored.request.state).toBe("AWAITING_APPROVAL");
  expect(stored.approval).toBeNull();
  expect(hashPlan(stored.plan!)).toBe(body.planHash);
  expect(mocks.submit).toHaveBeenCalledTimes(0);
});
it("rejects expired evidence after valid approval with unchanged hash and zero submissions", async () => {
  const body = await generate();
  expect((await decide(body)).status).toBe(200);
  const originalApproval = (await getRepository().getRequest(body.requestId))!.approval;
  await expire(body.requestId);
  const response = await book(request("book", body));
  console.info("expired-after-approval", response.status, await response.clone().json());
  expect(response.status).toBe(409);
  const stored = (await getRepository().getRequest(body.requestId))!;
  expect(stored.request.state).toBe("APPROVED");
  expect(stored.approval).toEqual(originalApproval);
  expect(hashPlan(stored.plan!)).toBe(body.planHash);
  expect(stored.plan!.legs[0]!.state).toBe("APPROVED");
  expect(mocks.submit).toHaveBeenCalledTimes(0);
});
it("allows fresh live evidence through approval and the booking boundary", async () => {
  const body = await generate();
  expect((await decide(body)).status).toBe(200);
  expect((await book(request("book", body))).status).toBe(200);
  expect(mocks.submit).toHaveBeenCalledTimes(1);
});

it.each(["uncertain", "failed-refresh", "missing-expiry"])("blocks %s evidence before submission", async (scenario) => {
  const body = await generate();
  expect((await decide(body)).status).toBe(200);
  const stored = (await getRepository().getRequest(body.requestId))!;
  const evidence = (stored.household!.policies as Array<Record<string, unknown>>)[0]!;
  if (scenario === "uncertain") evidence.freshness = "uncertain";
  if (scenario === "failed-refresh") { evidence.status = "FAILED"; evidence.failureReason = "Live refresh failed"; }
  if (scenario === "missing-expiry") delete evidence.expiresAt;
  await getRepository().saveRequest(stored);
  expect((await book(request("book", body))).status).toBe(409);
  expect(mocks.submit).toHaveBeenCalledTimes(0);
});




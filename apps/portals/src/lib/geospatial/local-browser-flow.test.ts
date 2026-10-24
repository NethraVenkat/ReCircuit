import { it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Plan, PlanLeg } from "@recircuit/core";
import { Verifier } from "../../../../worker/src/verifier/verifier";
import { FileRepository } from "../repository/file-repository";
import { RoutingService, RoutingStore } from "./service";
import { demoLocations, demoProvider } from "./demo";
import { verificationFromHousehold } from "./verification-bridge";

it.skipIf(!process.env.SCHEDULING_LOCAL_BROWSER_ROOT)("independently reads the actual local tracking UI before dispatch and routes only after explicit scheduling", async () => {
  const root = process.env.SCHEDULING_LOCAL_BROWSER_ROOT!;
  const manifest = JSON.parse(await fs.readFile(path.join(root, "demo-manifest.json"), "utf8")) as { kind: string; createdAt: string; serviceDate: string };
  if (manifest.kind !== "recircuit-fictional-demo-v1" || process.env.BROWSER_MODE !== "local") throw Error("ISOLATED_LOCAL_DEMO_REQUIRED");
  const repo = new FileRepository(path.join(root, "portal")), location = demoLocations[0]!;
  const created = await repo.createBooking({ recyclerId: "deccan", clientRequestId: "actual-local-browser-trace-" + randomUUID(), fullName: "Priya Mehta", phone: "0000000000", addressLine: location.name, locality: "Hyderabad public test location", pincode: "500081", preferredSlot: "Morning preferred", items: [{ name: "Laptop", category: "laptop", quantity: 1, weightKg: 2 }], chargedFeeInr: 180 });
  const b = created.booking, stamp = new Date().toISOString(), planId = randomUUID();
  const leg: PlanLeg = { id: randomUUID(), planId, recyclerId: "deccan", recyclerName: "Deccan E-Cycle", itemIds: ["local-laptop"], items: [{ id: "local-laptop", name: "Laptop", quantity: 1, estimatedWeightKg: 2 }], estimatedFee: 180, estimatedPayout: 0, state: "REQUEST_SUBMITTED", bookingReference: b.bookingReference, submittingSessionId: "local-supported-repository-submission", createdAt: stamp, updatedAt: stamp };
  const plan: Plan = { id: planId, requestId: randomUUID(), legs: [leg], totalEstimatedFee: 180, totalEstimatedPayout: 0, planHash: "local-test-plan", createdAt: stamp };
  const records: unknown[] = [], directory = path.join(root, "browser-flow-evidence");
  await fs.mkdir(directory, { recursive: true });
  const source = { list: async () => [ (await repo.getBookingByReference("deccan", b.bookingReference))! ], verification: async (_tenant: "deccan" | "paperplus" | "quickscrap", booking: typeof b) => verificationFromHousehold("deccan", booking, records) };
  const service = new RoutingService(source, new RoutingStore(path.join(directory, "planning")), demoProvider(manifest.createdAt));
  expect((await service.preview("deccan", manifest.serviceDate)).conversions).toEqual([]);
  try {
    const result = await Verifier.verifyLeg({ leg, plan }, { portalBaseUrl: "http://127.0.0.1:3260", timeoutMs: 60000, headless: true });
    expect(result.verified).toBe(true); expect(result.observedStatus).toBe("RECEIVED");
    expect(result.verifyingSessionId).not.toBe(result.submittingSessionId);
    records.push({ request: { id: plan.requestId, state: "APPROVED" }, plan, household: { customer: b, verifications: { [leg.id]: { ...result, independent: true, isUncertain: false, checkedAt: new Date().toISOString(), explanation: "Actual independent local Chromium observation of a fictional booking; no external provider or production booking" } } } });
    expect((await service.preview("deccan", manifest.serviceDate)).conversions).toEqual([]);
    await repo.updateBookingStatus("deccan", b.bookingReference, "SCHEDULED", "Simulated dispatcher assignment following actual local browser verification", { slot: manifest.serviceDate + " (10:00-17:00 IST)", isSimulated: true });
    expect((await service.preview("deccan", manifest.serviceDate)).conversions[0]).toMatchObject({ eligible: false });
    const depot = { id: "local-demo-depot", coordinate: { lat: location.lat, lon: location.lon } };
    await service.vehicles("deccan", [{ id: "local-fictional-van", tenant: "deccan", version: "v1", provenance: "Fictional local browser trace", start: depot, end: depot, capacityKg: 100, initialLoadKg: 0, materials: ["laptop"], operatingWindow: { start: 36000, end: 61200 } }]);
    await service.review("deccan", { bookingId: b.id, coordinate: depot.coordinate, serviceSeconds: 300, assumptionVersion: "local-fictional-five-minutes" }, "Local test dispatcher");
    const proposal = await service.generate("deccan", manifest.serviceDate, randomUUID());
    expect(proposal.independentValidation.valid).toBe(true); expect(proposal.optimization.solution.served).toBe(1);
    await fs.writeFile(path.join(directory, "trace-" + b.id + ".json"), JSON.stringify({ provenance: "Actual local browser verification; fictional booking created by supported FileRepository, simulated dispatcher and matrix", bookingReference: b.bookingReference, result, proposalId: proposal.id, validation: proposal.independentValidation }, null, 2), { flag: "wx" });
  } finally { await repo.updateBookingStatus("deccan", b.bookingReference, "CANCELLED", "Local browser trace finished; excluded from active planning", { isSimulated: true }); }
}, 120000);

import { it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FileRepository } from "../repository/file-repository";
import { RoutingStore, RoutingService } from "./service";
import { demoLocations, demoProvider, type DemoManifest } from "./demo";
import { verificationFromHousehold } from "./verification-bridge";
import { pickupFee } from "../fees";

it.skipIf(!process.env.RECIRCUIT_DEMO_SEED_ROOT)("seeds an isolated fictional workspace through supported repositories and services", async () => {
  const root = process.env.RECIRCUIT_DEMO_SEED_ROOT!;
  if (!path.isAbsolute(root) || process.env.NODE_ENV === "production") throw Error("ISOLATED_LOCAL_DEMO_REQUIRED");
  const manifestPath = path.join(root, "demo-manifest.json");
  let manifest: DemoManifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as DemoManifest;
    if (manifest.kind !== "recircuit-fictional-demo-v1") throw Error("EXISTING_USER_STORAGE_REFUSED");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await fs.mkdir(root, { recursive: true });
    if ((await fs.readdir(root)).length) throw Error("EXISTING_USER_STORAGE_REFUSED");
    const now = new Date();
    manifest = { kind: "recircuit-fictional-demo-v1", createdAt: now.toISOString(), serviceDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now), tenants: ["deccan", "paperplus", "quickscrap"] };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: "wx" });
  }
  await fs.mkdir(path.join(root, "household"), { recursive: true });
  const repo = new FileRepository(path.join(root, "portal")), store = new RoutingStore(path.join(root, "planning"));
  const nextDate = new Date(Date.parse(manifest.serviceDate + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const names = ["Mira Rao", "Arjun Shah", "Leela Menon", "Dev Kapoor", "Tara Nair", "Rohan Das", "Anika Sen", "Kabir Iyer", "Sana Ali", "Neel Joshi", "Asha Verma", "Ishaan Roy"];
  for (const tenant of manifest.tenants) {
    const evidenceFiles = await fs.readdir(path.join(root, "household"));
    const records: unknown[] = await Promise.all(evidenceFiles.filter(n => n.startsWith(tenant + "-")).map(n => fs.readFile(path.join(root, "household", n), "utf8").then(JSON.parse)));
    const source = { list: () => repo.listBookings(tenant), verification: async (_tenant: typeof tenant, b: Awaited<ReturnType<typeof repo.listBookings>>[number]) => verificationFromHousehold(tenant, b, records, true) };
    const service = new RoutingService(source, store, demoProvider(manifest.createdAt));
    for (let i = 0; i < names.length; i++) {
      const location = demoLocations[i % demoLocations.length]!;
      const material = tenant === "paperplus" ? (i === 10 ? "laptop" : "paper") : (i === 10 ? "paper" : "laptop");
      const weightKg = i === 9 ? 400 : tenant === "paperplus" ? 8 : 2;
      const fee = pickupFee(tenant, weightKg);
      const result = await repo.createBooking({ recyclerId: tenant, clientRequestId: `demo-v1-${tenant}-${i}`, fullName: names[i]!, phone: "0000000000", addressLine: location.name, locality: "Hyderabad public test location", pincode: "500081", preferredSlot: "Morning preferred — subject to dispatcher confirmation", items: [{ name: material === "paper" ? "Paper bundle" : "Laptop", category: material, quantity: 1, weightKg }], chargedFeeInr: fee, dataWipeAcknowledged: true });
      const b = result.booking;
      if (result.isDuplicate) continue;
      if (i === 0) continue; // Request only.
      await repo.updateBookingStatus(tenant, b.bookingReference, "CONFIRMED", "Simulated receipt confirmation", { isSimulated: true });
      const record = { request: { id: `demo-request-${tenant}-${i}`, state: "APPROVED" }, plan: { legs: [{ id: "leg", recyclerId: tenant, bookingReference: b.bookingReference, state: "REQUEST_CONFIRMED" }] }, household: { customer: b, verifications: { leg: { verified: true, independent: true, isSimulated: true, isUncertain: false, bookingReference: b.bookingReference, observedItems: b.items, observedFeeText: "INR " + fee, checkedAt: new Date().toISOString(), explanation: "Simulated independent browser observation in isolated demo only" } } } };
      await fs.writeFile(path.join(root, "household", `${tenant}-${i}.json`), JSON.stringify(record), { flag: "wx" }); records.push(record);
      expect(verificationFromHousehold(tenant, b, [record])).toBeNull();
      if (i === 1) continue; // Verified but awaiting scheduling.
      const window = i === 11 ? "(00:00-00:01 IST)" : "(10:00-17:00 IST)";
      await repo.updateBookingStatus(tenant, b.bookingReference, "SCHEDULED", "Simulated dispatcher service window", { slot: `${manifest.serviceDate} ${window}`, isSimulated: true });
      if (i === 3) continue; // Scheduled, coordinate and duration review missing.
      await service.review(tenant, { bookingId: b.id, coordinate: { lat: location.lat, lon: location.lon }, serviceSeconds: 300, assumptionVersion: "fictional-five-minute-service-v1" }, "Demo dispatcher");
      if (i === 4) await repo.updateBookingStatus(tenant, b.bookingReference, "SCHEDULED", "Simulated reschedule; original preference retained", { slot: `${nextDate} (10:00-17:00 IST)`, isSimulated: true });
      if (i === 5) await repo.updateBookingStatus(tenant, b.bookingReference, "CANCELLED", "Simulated cancellation", { isSimulated: true });
      if (i === 6) await repo.updateBookingStatus(tenant, b.bookingReference, "PICKED_UP", "Simulated completed collection", { isSimulated: true });
    }
    const versions = await service.history(tenant);
    if (!versions.length) {
      const depot = demoLocations[0]!;
      const vehicle = { id: "demo-van-" + tenant, tenant, version: "demo-v1", provenance: "Fictional vehicle — demo only", start: { id: "demo-depot", coordinate: { lat: depot.lat, lon: depot.lon } }, end: { id: "demo-depot", coordinate: { lat: depot.lat, lon: depot.lon } }, capacityKg: 100, initialLoadKg: 0, materials: [tenant === "paperplus" ? "paper" : "laptop"], operatingWindow: { start: 36000, end: 61200 } };
      await service.vehicles(tenant, [vehicle]);
      await service.generate(tenant, manifest.serviceDate, randomUUID());
      await service.vehicles(tenant, [{ ...vehicle, capacityKg: 120 }]);
      const latest = await service.generate(tenant, manifest.serviceDate, randomUUID());
      expect(latest.independentValidation.valid).toBe(true);
      expect(latest.optimization.solution.served).toBeGreaterThanOrEqual(3);
    }
    expect((await service.history(tenant)).length).toBeGreaterThanOrEqual(2);
  }
  console.log("Demo workspace ready:", root, "service date", manifest.serviceDate, "(fictional; simulated evidence and costs)");
}, 60000);

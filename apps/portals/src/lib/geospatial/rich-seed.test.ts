import { it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FileRepository } from "../repository/file-repository";
import { pickupFee } from "../fees";
import { validateBookingSubmission } from "../validation";
import { RoutingStore, RoutingService } from "./service";
import { demoLocations, demoProvider, type DemoManifest } from "./demo";
import { verificationFromHousehold } from "./verification-bridge";
import { sampleNames, sampleScenarios, sampleItem, sampleFleetMaterials } from "./rich-sample";

it.skipIf(!process.env.RECIRCUIT_RICH_SEED_ROOT)("creates and reconciles the isolated expanded workspace without rewriting prior records", async () => {
  const root = process.env.RECIRCUIT_RICH_SEED_ROOT!;
  if (!path.isAbsolute(root) || process.env.NODE_ENV === "production") throw Error("ISOLATED_LOCAL_WORKSPACE_REQUIRED");
  const manifestPath = path.join(root, "demo-manifest.json");
  let manifest: DemoManifest & { scenarioVersion: string };
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as typeof manifest;
    if (manifest.kind !== "recircuit-fictional-demo-v1" || manifest.scenarioVersion !== "rich-v2") throw Error("EXISTING_DATASET_REFUSED");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await fs.mkdir(root, { recursive: true });
    if ((await fs.readdir(root)).length) throw Error("EXISTING_DATASET_REFUSED");
    const now = new Date();
    manifest = { kind: "recircuit-fictional-demo-v1", scenarioVersion: "rich-v2", createdAt: now.toISOString(), serviceDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now), tenants: ["deccan", "paperplus", "quickscrap"] };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: "wx" });
  }
  await fs.mkdir(path.join(root, "household"), { recursive: true });
  const repo = new FileRepository(path.join(root, "portal")), store = new RoutingStore(path.join(root, "planning"));
  const nextDate = new Date(Date.parse(manifest.serviceDate + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const counts: Record<string, unknown> = {};
  for (const tenant of manifest.tenants) {
    const records: unknown[] = await Promise.all((await fs.readdir(path.join(root, "household"))).filter(n => n.startsWith(tenant + "-")).map(n => fs.readFile(path.join(root, "household", n), "utf8").then(JSON.parse)));
    const source = { list: () => repo.listBookings(tenant), verification: async (_tenant: typeof tenant, b: Awaited<ReturnType<typeof repo.listBookings>>[number]) => verificationFromHousehold(tenant, b, records, true) };
    const service = new RoutingService(source, store, demoProvider(manifest.createdAt));
    for (let i = 2; i < sampleNames.length; i++) {
      const item = sampleItem(tenant, i), location = demoLocations[i % demoLocations.length]!;
      const data = { recyclerId: tenant, clientRequestId: `rich-v2-${tenant}-${i}`, fullName: sampleNames[i]!, phone: "0000000000", addressLine: location.name, locality: "Hyderabad public collection point", pincode: "500081", preferredSlot: i % 2 ? "Afternoon preferred" : "Morning preferred", items: [item], chargedFeeInr: pickupFee(tenant, item.weightKg!), dataWipeAcknowledged: true, provenance: { kind: "sample" as const, isSimulated: true as const, scenario: sampleScenarios[i]!, datasetVersion: "rich-v2" } };
      expect(validateBookingSubmission(tenant, { client_request_id: data.clientRequestId, full_name: data.fullName, phone: data.phone, address_line: data.addressLine, locality: data.locality, pincode: data.pincode, preferred_slot: data.preferredSlot, items: data.items, data_wipe_ack: true, human_verification_code: "LOCAL" }, "LOCAL")).toEqual({ ok: true });
      const { booking: b, isDuplicate } = await repo.createBooking(data);
      if (isDuplicate) continue;
      if (i === 2) continue;
      await repo.updateBookingStatus(tenant, b.bookingReference, "CONFIRMED", "Sample receipt confirmation", { isSimulated: true });
      if (i === 3) continue;
      const record = { request: { id: `rich-${tenant}-${i}`, state: "APPROVED" }, plan: { legs: [{ id: "leg", recyclerId: tenant, bookingReference: b.bookingReference, state: "REQUEST_CONFIRMED" }] }, household: { customer: b, provenance: data.provenance, verifications: { leg: { verified: true, independent: true, isSimulated: true, isUncertain: false, bookingReference: b.bookingReference, observedItems: b.items, observedFeeText: "INR " + b.chargedFeeInr, checkedAt: new Date().toISOString(), explanation: "Simulated observation for an isolated sample scenario; not a real verification event" } } } };
      await fs.writeFile(path.join(root, "household", `${tenant}-${i}.json`), JSON.stringify(record), { flag: "wx" }); records.push(record);
      expect(verificationFromHousehold(tenant, b, [record])).toBeNull();
      if (i === 4) continue;
      await repo.updateBookingStatus(tenant, b.bookingReference, "SCHEDULED", "Sample dispatcher window", { slot: `${manifest.serviceDate} ${i === 15 ? "(00:00-00:01 IST)" : "(10:00-17:00 IST)"}`, isSimulated: true });
      if (i === 8) continue;
      await service.review(tenant, { bookingId: b.id, coordinate: { lat: location.lat, lon: location.lon }, serviceSeconds: 300 + (i % 3) * 60, assumptionVersion: "sample-service-assumption-v2" }, "Operations reviewer");
      if (i === 5) await repo.updateBookingStatus(tenant, b.bookingReference, "SCHEDULED", "Sample reschedule; original preference retained", { slot: `${nextDate} (10:00-17:00 IST)`, isSimulated: true });
      if (i === 6) await repo.updateBookingStatus(tenant, b.bookingReference, "CANCELLED", "Sample cancellation", { isSimulated: true });
      if (i === 7) { await repo.updateBookingStatus(tenant, b.bookingReference, "PICKED_UP", "Sample collection scenario", { isSimulated: true }); await repo.updateBookingStatus(tenant, b.bookingReference, "WEIGHED", "Sample completion scenario", { weightKg: item.weightKg, isSimulated: true }); }
    }
    if (!(await service.history(tenant)).length) {
      const vehicles = ["Cedar van", "Willow van"].map((id, i) => { const start = demoLocations[i === 0 ? 0 : 3]!, end = demoLocations[i === 0 ? 1 : 2]!; return { id, tenant, version: "sample-v2", provenance: "Sample vehicle and public-location depot; capacity and hours are explicit planning assumptions", start: { id: start.name, coordinate: { lat: start.lat, lon: start.lon } }, end: { id: end.name, coordinate: { lat: end.lat, lon: end.lon } }, capacityKg: 60, initialLoadKg: 0, materials: sampleFleetMaterials(tenant), operatingWindow: { start: 36000, end: 61200 } }; });
      await service.vehicles(tenant, vehicles);
      await service.generate(tenant, manifest.serviceDate, randomUUID());
      await service.vehicles(tenant, vehicles.map(v => ({ ...v, capacityKg: 65 })));
      const p = await service.generate(tenant, manifest.serviceDate, randomUUID());
      expect(p.independentValidation.valid).toBe(true); expect(p.optimization.solution.served).toBeGreaterThanOrEqual(6);
      expect(p.optimization.solution.routes.length).toBe(2);
      expect(p.optimization.solution.unassigned).toHaveLength(3);
    }
    const bookings = await repo.listBookings(tenant), preview = await service.preview(tenant, manifest.serviceDate), catalog = await service.catalog(tenant);
    expect(bookings).toHaveLength(16); expect(preview.conversions).toHaveLength(10); expect(preview.conversions.filter(c => c.eligible)).toHaveLength(9);
    for (const b of bookings) { expect(b.chargedFeeInr).toBe(pickupFee(tenant, b.items.reduce((sum, row) => sum + row.weightKg!, 0))); expect(b.provenance?.isSimulated).toBe(true); }
    expect(catalog).toHaveLength(2); expect(catalog[0]!.current).toBe(false);
    const saved = await service.read(tenant, catalog[1]!.id), excluded = saved.optimization.solution.unassigned;
    const idAt = (index: number) => bookings.find(b => b.clientRequestId === `rich-v2-${tenant}-${index}`)!.id;
    expect(excluded.map(row => row.pickupId).sort()).toEqual([idAt(14), idAt(15), idAt(17)].sort());
    expect(excluded.find(row => row.pickupId === idAt(14))?.reason).toBe("PICKUP_LOAD_EXCEEDS_AVAILABLE_CAPACITY");
    expect(excluded.find(row => row.pickupId === idAt(17))?.reason).toBe("NO_COMPATIBLE_VEHICLE_MATERIAL");
    const early = saved.input.pickups.find(p => p.id === idAt(15))!;
    expect(saved.input.vehicles.every(v => early.confirmedWindow!.end < v.operatingWindow.start)).toBe(true);
    expect(saved.input.matrix.billableElements).toBe(0); expect(saved.input.matrix.approximation).toContain("Simulated");
    // The second proposal remains current only until its original matrix expiry or a real source change.
    expect(catalog[1]!.current).toBe(Date.parse(manifest.createdAt) + 86400000 > Date.now());
    counts[tenant] = { bookings: bookings.length, lifecycle: Object.fromEntries([...new Set(bookings.map(b => b.status))].map(status => [status, bookings.filter(b => b.status === status).length])), selectedDate: preview.conversions.length, readyForCalculation: preview.conversions.filter(c => c.eligible).length, proposals: catalog };
  }
  // Immutable creation report; reruns validate without changing timestamps or history.
  try { await fs.writeFile(path.join(root, "seed-report.json"), JSON.stringify({ scenarioVersion: "rich-v2", serviceDate: manifest.serviceDate, counts }, null, 2), { flag: "wx" }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
}, 60000);

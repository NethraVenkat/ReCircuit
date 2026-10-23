import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { RoutingStore, RoutingService } from "./service";
import { syntheticBooking, syntheticInput, syntheticPreparation } from "./fixtures";
import { bookingToPickup, Verification } from "./contracts";
import type { MatrixProvider } from "./providers";

afterEach(() => vi.restoreAllMocks());
async function scenario() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "recircuit-post-audit-"));
  const booking = syntheticBooking("synthetic-stop-000"), input = syntheticInput(1);
  const provider: MatrixProvider & { configurationId: string } = { configurationId: "audit-provider-v1", matrix: async request => ({ ...input.matrix, nodes: request.nodes }) };
  const store = new RoutingStore(directory);
  const source = { list: async () => [structuredClone(booking)], verification: async () => Verification.parse(syntheticPreparation(booking).verification) };
  const service = new RoutingService(source, store, provider);
  await service.vehicles("deccan", input.vehicles);
  await service.review("deccan", { bookingId: booking.id, coordinate: input.pickups[0]!.coordinate, serviceSeconds: 60, assumptionVersion: "audit-60s" }, "audit-operator");
  return { directory, store, service, booking, provider };
}

it("invalidates old proposals when the matrix provider configuration changes", async () => {
  const s = await scenario(), saved = await s.service.generate("deccan", "2026-10-24", randomUUID());
  expect(saved.current).toBe(true);
  s.provider.configurationId = "audit-provider-v2";
  expect((await s.service.read("deccan", saved.id)).current).toBe(false);
});

it("does not publish partially written history and permits a safe retry", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "recircuit-partial-audit-")), store = new RoutingStore(directory);
  const original = fs.writeFile.bind(fs);
  vi.spyOn(fs, "writeFile").mockImplementationOnce(async (...args: Parameters<typeof fs.writeFile>) => {
    await original(args[0], "{partial");
    throw Error("SIMULATED_DISK_FAILURE");
  });
  await expect(store.append("deccan", "settings", { tenant: "deccan", version: 1 })).rejects.toThrow("SIMULATED_DISK_FAILURE");
  expect(await store.history("deccan", "settings")).toEqual([]);
  await store.append("deccan", "settings", { tenant: "deccan", version: 1 });
  expect(await store.history("deccan", "settings")).toEqual([{ tenant: "deccan", version: 1 }]);
  await expect(store.append("deccan", "settings", { tenant: "deccan", version: 1 })).rejects.toThrow();
});

it("rejects a stored proposal whose inner tenant differs from its owning tenant", async () => {
  const s = await scenario(), saved = await s.service.generate("deccan", "2026-10-24", randomUUID());
  const filename = path.join(s.directory, "paperplus/proposals/00000001.json");
  await fs.mkdir(path.dirname(filename), { recursive: true });
  // Simulate damaged/imported local evidence, never a production record.
  const { current: _current, status: _status, ...record } = saved;
  void _current; void _status;
  await fs.writeFile(filename, JSON.stringify({ ...record, tenant: "paperplus" }));
  const otherTenant = new RoutingService({ list: async () => [], verification: async () => null }, s.store, s.provider);
  await expect(otherTenant.read("paperplus", saved.id)).rejects.toThrow("STORED_PROPOSAL_INVALID");
});

it("excludes overflowing aggregate row weight rather than crashing conversion", () => {
  const booking = syntheticBooking();
  booking.items = [0, 1].map(i => ({ name: "Synthetic battery " + i, quantity: 1, weightKg: Number.MAX_VALUE, category: "battery_household" }));
  const result = bookingToPickup(booking, syntheticPreparation(booking));
  expect(result.eligible).toBe(false);
  expect(!result.eligible && result.reasons).toContain("LOAD_OR_MATERIAL_UNKNOWN");
});
it("retains reviewed coordinate provenance in immutable proposals and rejects altered snapshot links", async () => {
  const s = await scenario(), saved = await s.service.generate("deccan", "2026-10-24", randomUUID());
  expect(saved.preparationSnapshot?.coordinates[0]?.geocode.version).toBe(saved.input.pickups[0]!.coordinateVersion);
  expect(saved.preparationSnapshot?.coordinates[0]?.geocode.reviewedBy).toBe("audit-operator");
  const file = path.join(s.directory, "deccan/proposals/00000001.json"), record = JSON.parse(await fs.readFile(file, "utf8"));
  record.preparationSnapshot.coordinates[0].geocode.coordinate.lat = 5; await fs.writeFile(file, JSON.stringify(record));
  await expect(s.service.read("deccan", saved.id)).rejects.toThrow("STORED_PREPARATION_INVALID");
});

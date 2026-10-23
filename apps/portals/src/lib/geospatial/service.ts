import { z } from "zod";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PortalBooking, RecyclerId } from "../types";
import { Coordinate, Geocode, RouteProposalRecord, ServiceDate, Vehicle, Verification, addressFingerprint, bookingFingerprint, bookingToPickup, fingerprint, type PlanningInput } from "./contracts";
import { optimize, type Optimization } from "./optimizer";
import { compare, validateProposal } from "./validator";
import type { MatrixProvider, Node, RouteGeometry } from "./providers";
import { trackingSlots } from "../tracking-slots";
import { confirmedSlotWindow } from "./windows";

export interface BookingSource { list(tenant: RecyclerId): Promise<PortalBooking[]>; verification(tenant: RecyclerId, booking: PortalBooking): Promise<z.infer<typeof Verification> | null> }
const Settings = z.object({ tenant: z.enum(["deccan", "paperplus", "quickscrap"]), version: z.number().int().positive(), createdAt: z.string().datetime(), vehicles: z.array(Vehicle).max(8), reviews: z.record(z.object({ geocode: Geocode, serviceSeconds: z.number().positive().max(86400), assumptionVersion: z.string().min(1), confirmedWindow: z.object({ start: z.number().nonnegative(), end: z.number().nonnegative() }).nullable(), confirmedWindowEvidenceId: z.string().nullable() }).strict()) }).strict();
export type WorkspaceSettings = z.infer<typeof Settings>;
export interface SavedProposal { id: string; tenant: RecyclerId; version: number; createdAt: string; correlationId: string; requestKey: string; sourceFingerprint: string; input: PlanningInput; optimization: Optimization; independentValidation: { valid: boolean; errors: string[] }; baselineValidation: { valid: boolean; errors: string[] }; comparison: ReturnType<typeof compare>; planningOnly: true; geometry?: Array<RouteGeometry & { vehicleId: string; matrixMismatch: boolean }>; geometryError?: string }

/** Separate immutable local proposal/configuration storage. No booking write dependency. */
export class RoutingStore {
  constructor(private readonly root: string) { if (!path.isAbsolute(root)) throw Error("ROUTING_STORAGE_REQUIRES_ABSOLUTE_PATH"); }
  private directory(tenant: RecyclerId, kind: "settings" | "proposals") { if (!["deccan", "paperplus", "quickscrap"].includes(tenant)) throw Error("TENANT_INVALID"); return path.join(this.root, tenant, kind); }
  async history<T>(tenant: RecyclerId, kind: "settings" | "proposals"): Promise<T[]> {
    const directory = this.directory(tenant, kind);
    let names: string[]; try { names = await fs.readdir(directory); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw Error("ROUTING_STORAGE_UNAVAILABLE"); }
    const values = await Promise.all(names.filter(n => /^\d{8}\.json$/.test(n)).sort().map(async n => JSON.parse(await fs.readFile(path.join(directory, n), "utf8")) as T));
    return values;
  }
  async append(tenant: RecyclerId, kind: "settings" | "proposals", value: { tenant: RecyclerId; version: number }): Promise<void> {
    if (value.tenant !== tenant) throw Error("TENANT_MISMATCH");
    const directory = this.directory(tenant, kind); await fs.mkdir(directory, { recursive: true });
    // wx makes a duplicate generation/version fail rather than overwrite history, even across processes.
    await fs.writeFile(path.join(directory, String(value.version).padStart(8, "0") + ".json"), JSON.stringify(value), { flag: "wx", mode: 0o600 });
  }
  async settings(tenant: RecyclerId): Promise<WorkspaceSettings> {
    const all = await this.history<WorkspaceSettings>(tenant, "settings"), latest = all.at(-1);
    if (!latest) return { tenant, version: 1, createdAt: new Date(0).toISOString(), vehicles: [], reviews: {} };
    const parsed = Settings.parse(latest); if (parsed.tenant !== tenant) throw Error("TENANT_MISMATCH"); return parsed;
  }
}
const tenantLocks = new Set<string>();
async function exclusive<T>(tenant: string, run: () => Promise<T>): Promise<T> { if (tenantLocks.has(tenant)) throw Error("ROUTING_BUSY"); tenantLocks.add(tenant); try { return await run(); } finally { tenantLocks.delete(tenant); } }
export class RoutingService {
  constructor(private readonly source: BookingSource, private readonly store: RoutingStore, private readonly provider: MatrixProvider, private readonly now: () => Date = () => new Date()) {}
  private async sources(tenant: RecyclerId) {
    const bookings = await this.source.list(tenant);
    if (bookings.length > 500 || bookings.some(b => b.recyclerId !== tenant) || new Set(bookings.map(b => b.id)).size !== bookings.length) throw Error("SOURCE_IDENTITY_OR_LIMIT");
    const settings = await this.store.settings(tenant);
    const verification = await Promise.all(bookings.map(b => this.source.verification(tenant, b)));
    return { bookings, settings, verification, sourceFingerprint: fingerprint({ tenant, bookings: bookings.map(b => bookingFingerprint(b)).sort(), settings, verification }) };
  }
  async preview(tenant: RecyclerId, serviceDate: string) {
    ServiceDate.parse(serviceDate); const source = await this.sources(tenant);
    const conversions = source.bookings.map((b, i) => {
      const review = source.settings.reviews[b.id];
      const assigned = trackingSlots(b).assignedSlot, confirmed = confirmedSlotWindow(assigned, serviceDate);
      return bookingToPickup(b, { tenant, serviceDate, timezone: "Asia/Kolkata", verification: source.verification[i], geocode: review?.geocode ?? null, serviceSeconds: review?.serviceSeconds ?? null, assumptionVersion: review?.assumptionVersion ?? "not-recorded", confirmedWindow: confirmed, confirmedWindowEvidenceId: confirmed ? fingerprint(b.events) : null });
    });
    // Address access occurs only after API authorization; never return names/phone numbers.
    return { tenant, serviceDate, timezone: "Asia/Kolkata", sourceFingerprint: source.sourceFingerprint, settings: source.settings, conversions, addresses: source.bookings.map(b => ({ id: b.id, reference: b.bookingReference, address: [b.addressLine, b.locality, b.pincode].join(", ") })) };
  }
  async review(tenant: RecyclerId, raw: unknown, reviewer: string) {
    const body = z.object({ bookingId: z.string().min(1).max(160), coordinate: Coordinate, serviceSeconds: z.number().positive().max(86400), assumptionVersion: z.string().min(1).max(160) }).strict().parse(raw);
    return exclusive(tenant, async () => {
      const source = await this.sources(tenant), booking = source.bookings.find(b => b.id === body.bookingId); if (!booking) throw Error("BOOKING_NOT_FOUND");
      const versions = await this.store.history(tenant, "settings"), prior = source.settings.reviews[booking.id];
      const settings: WorkspaceSettings = { ...source.settings, version: versions.length + 1, createdAt: this.now().toISOString(), reviews: { ...source.settings.reviews, [booking.id]: { geocode: { state: "resolved", tenant, addressFingerprint: addressFingerprint(booking), version: randomUUID(), provider: "manual-reviewed", retrievedAt: this.now().toISOString(), coordinate: body.coordinate, reviewedBy: reviewer, precision: null }, serviceSeconds: body.serviceSeconds, assumptionVersion: body.assumptionVersion, confirmedWindow: prior?.confirmedWindow ?? null, confirmedWindowEvidenceId: prior?.confirmedWindowEvidenceId ?? null } } };
      await this.store.append(tenant, "settings", Settings.parse(settings)); return { version: settings.version };
    });
  }
  async vehicles(tenant: RecyclerId, raw: unknown) {
    const vehicles = z.array(Vehicle).max(8).parse(raw); if (vehicles.some(v => v.tenant !== tenant) || new Set(vehicles.map(v => v.id)).size !== vehicles.length) throw Error("TENANT_OR_VEHICLE_ID");
    return exclusive(tenant, async () => { const prior = await this.store.settings(tenant), versions = await this.store.history(tenant, "settings"); const next = Settings.parse({ ...prior, version: versions.length + 1, createdAt: this.now().toISOString(), vehicles }); await this.store.append(tenant, "settings", next); return { version: next.version }; });
  }
  async generate(tenant: RecyclerId, serviceDate: string, requestKey: string) {
    ServiceDate.parse(serviceDate); z.string().uuid().parse(requestKey);
    return exclusive(tenant, async () => {
      const correlationId = randomUUID();
      const source = await this.sources(tenant), preview = await this.preview(tenant, serviceDate);
      if (source.sourceFingerprint !== preview.sourceFingerprint) throw Error("SOURCE_CHANGED");
      const history = await this.store.history<SavedProposal>(tenant, "proposals"), existing = history.find(p => p.requestKey === requestKey);
      if (existing) { if (existing.sourceFingerprint !== source.sourceFingerprint || existing.input.serviceDate !== serviceDate) throw Error("IDEMPOTENCY_CONFLICT"); return this.read(tenant, existing.id); }
      const pickups = preview.conversions.flatMap(c => c.eligible ? [c.pickup] : []);
      if (!pickups.length) throw Error("NO_ELIGIBLE_PICKUPS"); if (!source.settings.vehicles.length) throw Error("VEHICLES_REQUIRED");
      const nodes: Node[] = [];
      for (const n of [...source.settings.vehicles.flatMap(v => [v.start, v.end]), ...pickups.map(p => ({ id: p.id, coordinate: p.coordinate }))]) {
        const existing = nodes.find(v => v.id === n.id); if (existing && fingerprint(existing.coordinate) !== fingerprint(n.coordinate)) throw Error("NODE_ID_COLLISION"); if (!existing) nodes.push(n);
      }
      const matrix = await this.provider.matrix({ tenant, nodes, departureAssumption: "static road profile; no traffic; " + serviceDate });
      if (Date.parse(matrix.expiresAt) <= this.now().getTime()) throw Error("MATRIX_EXPIRED");
      const input: PlanningInput = { tenant, serviceDate, timezone: "Asia/Kolkata", pickups, vehicles: source.settings.vehicles, matrix };
      const optimization = optimize(input), independentValidation = validateProposal(input, optimization.solution), baselineValidation = validateProposal(input, optimization.baseline);
      if (!independentValidation.valid || !baselineValidation.valid) throw Error("INDEPENDENT_VALIDATION_FAILED");
      const geometry: NonNullable<SavedProposal["geometry"]> = []; let geometryError: string | undefined;
      if (this.provider.geometry) for (const route of optimization.solution.routes) {
        try { const vehicle = input.vehicles.find(v => v.id === route.vehicleId)!;
          const coordinates = [vehicle.start.coordinate, ...route.pickupIds.map(id => input.pickups.find(p => p.id === id)!.coordinate), vehicle.end.coordinate];
          const road = await this.provider.geometry(coordinates);
          geometry.push({ ...road, vehicleId: route.vehicleId, matrixMismatch: Math.abs(road.metres - route.metres) > Math.max(1, route.metres * 0.05) || Math.abs(road.seconds - route.travelSeconds) > Math.max(1, route.travelSeconds * 0.05) });
        } catch { geometryError = "ROAD_GEOMETRY_UNAVAILABLE_USE_ORDERED_LIST"; }
      }
      if ((await this.sources(tenant)).sourceFingerprint !== source.sourceFingerprint) throw Error("SOURCE_CHANGED_DURING_GENERATION");
      const saved: SavedProposal = { id: randomUUID(), tenant, version: history.length + 1, createdAt: this.now().toISOString(), correlationId, requestKey, sourceFingerprint: source.sourceFingerprint, input, optimization, independentValidation, baselineValidation, comparison: compare(optimization.solution, optimization.baseline), planningOnly: true, ...(geometry.length ? { geometry } : {}), ...(geometryError ? { geometryError } : {}) };
      RouteProposalRecord.parse(saved); await this.store.append(tenant, "proposals", saved); return this.read(tenant, saved.id);
    });
  }
  async read(tenant: RecyclerId, id: string) {
    z.string().uuid().parse(id); const all = await this.store.history<SavedProposal>(tenant, "proposals"), proposal = all.find(p => p.id === id && p.tenant === tenant); if (!proposal) throw Error("PROPOSAL_NOT_FOUND");
    RouteProposalRecord.parse(proposal);
    const validation = validateProposal(proposal.input, proposal.optimization.solution);
    const baselineValidation = validateProposal(proposal.input, proposal.optimization.baseline);
    if (!validation.valid || !baselineValidation.valid || proposal.optimization.inputFingerprint !== fingerprint(proposal.input)) throw Error("STORED_PROPOSAL_INVALID");
    const current = await this.sources(tenant);
    return { ...proposal, comparison: compare(proposal.optimization.solution, proposal.optimization.baseline), current: current.sourceFingerprint === proposal.sourceFingerprint && Date.parse(proposal.input.matrix.expiresAt) > this.now().getTime(), status: "PROPOSAL_ONLY_NOT_DISPATCH" as const };
  }
  async history(tenant: RecyclerId) { return (await this.store.history<SavedProposal>(tenant, "proposals")).filter(p => p.tenant === tenant).map(p => ({ id: p.id, version: p.version, createdAt: p.createdAt, serviceDate: p.input.serviceDate, correlationId: p.correlationId })); }
}

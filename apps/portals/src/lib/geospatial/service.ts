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
import { DisabledGeocoder, GeocodeAttempt, type GeocodingProvider } from "./geocoding";
import { geometryFollowsOrder } from "./geometry";

export interface BookingSource { list(tenant: RecyclerId): Promise<PortalBooking[]>; verification(tenant: RecyclerId, booking: PortalBooking): Promise<z.infer<typeof Verification> | null> }
export const Settings = z.object({ tenant: z.enum(["deccan", "paperplus", "quickscrap"]), version: z.number().int().positive(), createdAt: z.string().datetime(), vehicles: z.array(Vehicle).max(8), reviews: z.record(z.object({ geocode: Geocode, serviceSeconds: z.number().positive().max(86400), assumptionVersion: z.string().min(1), confirmedWindow: z.object({ start: z.number().nonnegative(), end: z.number().nonnegative() }).nullable(), confirmedWindowEvidenceId: z.string().nullable() }).strict()), geocoding: z.record(GeocodeAttempt).default({}) }).strict().superRefine((settings, context) => {
  if (settings.vehicles.some(v => v.tenant !== settings.tenant) || Object.values(settings.reviews).some(r => r.geocode.tenant !== settings.tenant) || Object.entries(settings.geocoding).some(([id, result]) => result.tenant !== settings.tenant || result.bookingId !== id)) context.addIssue({ code: "custom", message: "Nested settings ownership mismatch" });
});
export type WorkspaceSettings = z.infer<typeof Settings>;
export interface SavedProposal { id: string; tenant: RecyclerId; version: number; createdAt: string; correlationId: string; requestKey: string; sourceFingerprint: string; input: PlanningInput; optimization: Optimization; independentValidation: { valid: boolean; errors: string[] }; baselineValidation: { valid: boolean; errors: string[] }; comparison: ReturnType<typeof compare>; planningOnly: true; geometry?: Array<RouteGeometry & { vehicleId: string; matrixMismatch: boolean }>; geometryError?: string }
export interface SavedProposal { preparationSnapshot?: { settingsVersion: number; geocoderConfiguration: string; coordinates: Array<{ bookingId: string; geocode: z.infer<typeof Geocode> }> } }
export interface RoutingPersistence {
  history<T>(tenant: RecyclerId, kind: "settings" | "proposals"): Promise<T[]>;
  append(tenant: RecyclerId, kind: "settings" | "proposals", value: { tenant: RecyclerId; version: number }): Promise<void>;
  settings(tenant: RecyclerId): Promise<WorkspaceSettings>;
  withLock<T>(tenant: RecyclerId, run: () => Promise<T>): Promise<T>;
}

/** Separate immutable local proposal/configuration storage. No booking write dependency. */
export class RoutingStore {
  withLock<T>(tenant: RecyclerId, run: () => Promise<T>): Promise<T> { return exclusive(tenant, run); }
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
    if (!Number.isInteger(value.version) || value.version < 1 || value.version > 99999999) throw Error("ROUTING_VERSION_INVALID");
    const destination = path.join(directory, String(value.version).padStart(8, "0") + ".json");
    const temporary = path.join(directory, ".pending-" + randomUUID());
    try {
      // A partial write is never visible as committed history. Linking a fully
      // flushed file publishes atomically and fails if this version exists.
      await fs.writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
      const handle = await fs.open(temporary, "r+");
      try { await handle.sync(); } finally { await handle.close(); }
      await fs.link(temporary, destination);
    } finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  async settings(tenant: RecyclerId): Promise<WorkspaceSettings> {
    const all = await this.history<WorkspaceSettings>(tenant, "settings"), latest = all.at(-1);
    if (!latest) return { tenant, version: 1, createdAt: new Date(0).toISOString(), vehicles: [], reviews: {}, geocoding: {} };
    const parsed = Settings.parse(latest); if (parsed.tenant !== tenant) throw Error("TENANT_MISMATCH"); return parsed;
  }
}
const tenantLocks = new Set<string>();
async function exclusive<T>(tenant: string, run: () => Promise<T>): Promise<T> { if (tenantLocks.has(tenant)) throw Error("ROUTING_BUSY"); tenantLocks.add(tenant); try { return await run(); } finally { tenantLocks.delete(tenant); } }
export class RoutingService {
  constructor(private readonly source: BookingSource, private readonly store: RoutingPersistence, private readonly provider: MatrixProvider, private readonly now: () => Date = () => new Date(), private readonly geocoder: GeocodingProvider = new DisabledGeocoder()) { if (!provider.configurationId?.trim() || !geocoder.configurationId?.trim()) throw Error("PROVIDER_CONFIGURATION_ID_REQUIRED"); }
  private async sources(tenant: RecyclerId) {
    const bookings = await this.source.list(tenant);
    if (bookings.length > 500 || bookings.some(b => b.recyclerId !== tenant) || new Set(bookings.map(b => b.id)).size !== bookings.length) throw Error("SOURCE_IDENTITY_OR_LIMIT");
    const settings = await this.store.settings(tenant);
    const verification = await Promise.all(bookings.map(b => this.source.verification(tenant, b)));
    return { bookings, settings, verification, sourceFingerprint: fingerprint({ tenant, providerConfiguration: this.provider.configurationId, geocoderConfiguration: this.geocoder.configurationId, bookings: bookings.map(b => bookingFingerprint(b)).sort(), settings, verification }) };
  }
  async preview(tenant: RecyclerId, serviceDate: string) {
    ServiceDate.parse(serviceDate); const source = await this.sources(tenant);
    const conversions = source.bookings.map((b, i) => {
      const review = source.settings.reviews[b.id];
      const geocode = review?.geocode.sourceResultId && review.geocode.providerConfiguration !== this.geocoder.configurationId ? null : review?.geocode ?? null;
      const assigned = trackingSlots(b).assignedSlot, confirmed = confirmedSlotWindow(assigned, serviceDate);
      return bookingToPickup(b, { tenant, serviceDate, timezone: "Asia/Kolkata", verification: source.verification[i], geocode, serviceSeconds: review?.serviceSeconds ?? null, assumptionVersion: review?.assumptionVersion ?? "not-recorded", confirmedWindow: confirmed, confirmedWindowEvidenceId: confirmed ? fingerprint(b.events) : null });
    });
    // Address access occurs only after API authorization; never return names/phone numbers.
    return { tenant, serviceDate, timezone: "Asia/Kolkata", sourceFingerprint: source.sourceFingerprint, settings: source.settings, conversions, addresses: source.bookings.map(b => ({ id: b.id, reference: b.bookingReference, address: [b.addressLine, b.locality, b.pincode].join(", ") })) };
  }
  async review(tenant: RecyclerId, raw: unknown, reviewer: string) {
    const body = z.object({ bookingId: z.string().min(1).max(160), coordinate: Coordinate, serviceSeconds: z.number().positive().max(86400), assumptionVersion: z.string().min(1).max(160), candidateResultId: z.string().uuid().optional(), candidateId: z.string().min(1).max(160).optional(), correctionReason: z.string().min(1).max(500).optional() }).strict().parse(raw);
    return this.store.withLock(tenant, async () => {
      const source = await this.sources(tenant), booking = source.bookings.find(b => b.id === body.bookingId); if (!booking) throw Error("BOOKING_NOT_FOUND");
      const attempt = source.settings.geocoding[booking.id], selected = attempt?.candidates.find(c => c.id === body.candidateId);
      if (body.candidateResultId || body.candidateId) {
        if (!attempt || !selected || attempt.id !== body.candidateResultId || attempt.tenant !== tenant || attempt.bookingId !== booking.id || attempt.addressFingerprint !== addressFingerprint(booking) || attempt.providerConfiguration !== this.geocoder.configurationId || Date.parse(attempt.expiresAt) <= this.now().getTime()) throw Error("GEOCODE_REVIEW_STALE_OR_INVALID");
        if (fingerprint(selected.coordinate) !== fingerprint(body.coordinate) && !body.correctionReason) throw Error("COORDINATE_CORRECTION_REASON_REQUIRED");
      }
      const versions = await this.store.history(tenant, "settings"), prior = source.settings.reviews[booking.id];
      const settings: WorkspaceSettings = { ...source.settings, version: versions.length + 1, createdAt: this.now().toISOString(), reviews: { ...source.settings.reviews, [booking.id]: { geocode: { state: "resolved", tenant, addressFingerprint: addressFingerprint(booking), version: randomUUID(), provider: "manual-reviewed", retrievedAt: this.now().toISOString(), coordinate: body.coordinate, reviewedBy: reviewer, precision: null }, serviceSeconds: body.serviceSeconds, assumptionVersion: body.assumptionVersion, confirmedWindow: prior?.confirmedWindow ?? null, confirmedWindowEvidenceId: prior?.confirmedWindowEvidenceId ?? null } } };
      if (selected && body.candidateResultId) settings.reviews[booking.id]!.geocode = { ...settings.reviews[booking.id]!.geocode, provider: attempt!.provider, retrievedAt: attempt!.retrievedAt, precision: selected.precision, reviewedAt: this.now().toISOString(), sourceResultId: attempt!.id, sourceCandidateId: selected.id, providerConfiguration: this.geocoder.configurationId, ...(body.correctionReason ? { correctionReason: body.correctionReason } : {}) };
      await this.store.append(tenant, "settings", Settings.parse(settings)); return { version: settings.version };
    });
  }
  async geocode(tenant: RecyclerId, raw: unknown) {
    const body = z.object({ bookingId: z.string().min(1).max(160) }).strict().parse(raw);
    return this.store.withLock(tenant, async () => {
      const source = await this.sources(tenant), booking = source.bookings.find(b => b.id === body.bookingId);
      if (!booking) throw Error("BOOKING_NOT_FOUND");
      const result = await this.geocoder.resolve({ tenant, address: [booking.addressLine, booking.locality, booking.pincode].filter(Boolean).join(", "), addressFingerprint: addressFingerprint(booking) });
      if ((await this.sources(tenant)).sourceFingerprint !== source.sourceFingerprint) throw Error("SOURCE_CHANGED_DURING_GEOCODING");
      const now = this.now(), attempt = GeocodeAttempt.parse({ ...result, id: randomUUID(), tenant, bookingId: booking.id, addressFingerprint: addressFingerprint(booking), providerConfiguration: this.geocoder.configurationId, retrievedAt: result.retrievedAt ?? now.toISOString(), expiresAt: result.expiresAt ?? new Date(now.getTime() + 300000).toISOString() });
      if (Date.parse(attempt.expiresAt) <= now.getTime()) throw Error("GEOCODING_RESULT_EXPIRED");
      const versions = await this.store.history(tenant, "settings"), next = Settings.parse({ ...source.settings, version: versions.length + 1, createdAt: now.toISOString(), geocoding: { ...source.settings.geocoding, [booking.id]: attempt } });
      const prior = next.reviews[booking.id];
      if (prior) prior.geocode = { state: attempt.state, tenant, addressFingerprint: attempt.addressFingerprint, version: randomUUID(), provider: attempt.provider, retrievedAt: attempt.retrievedAt, coordinate: null, reviewedBy: null, precision: null };
      await this.store.append(tenant, "settings", next); return attempt;
    });
  }
  async vehicles(tenant: RecyclerId, raw: unknown) {
    const vehicles = z.array(Vehicle).max(8).parse(raw).map(v => ({ ...v, version: randomUUID() })); if (vehicles.some(v => v.tenant !== tenant) || new Set(vehicles.map(v => v.id)).size !== vehicles.length) throw Error("TENANT_OR_VEHICLE_ID");
    return this.store.withLock(tenant, async () => { const prior = await this.store.settings(tenant), versions = await this.store.history(tenant, "settings"); const next = Settings.parse({ ...prior, version: versions.length + 1, createdAt: this.now().toISOString(), vehicles }); await this.store.append(tenant, "settings", next); return { version: next.version }; });
  }
  async generate(tenant: RecyclerId, serviceDate: string, requestKey: string) {
    ServiceDate.parse(serviceDate); z.string().uuid().parse(requestKey);
    return this.store.withLock(tenant, async () => {
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
          if (!geometryFollowsOrder(road.geometry.coordinates, coordinates)) throw Error("ROAD_GEOMETRY_ORDER_MISMATCH");
          geometry.push({ ...road, vehicleId: route.vehicleId, matrixMismatch: Math.abs(road.metres - route.metres) > Math.max(1, route.metres * 0.05) || Math.abs(road.seconds - route.travelSeconds) > Math.max(1, route.travelSeconds * 0.05) });
        } catch { geometryError = "ROAD_GEOMETRY_UNAVAILABLE_USE_ORDERED_LIST"; }
      }
      if ((await this.sources(tenant)).sourceFingerprint !== source.sourceFingerprint) throw Error("SOURCE_CHANGED_DURING_GENERATION");
      const saved: SavedProposal = { id: randomUUID(), tenant, version: history.length + 1, createdAt: this.now().toISOString(), correlationId, requestKey, sourceFingerprint: source.sourceFingerprint, input, optimization, independentValidation, baselineValidation, comparison: compare(optimization.solution, optimization.baseline), planningOnly: true, ...(geometry.length ? { geometry } : {}), ...(geometryError ? { geometryError } : {}) };
      saved.preparationSnapshot = { settingsVersion: source.settings.version, geocoderConfiguration: this.geocoder.configurationId, coordinates: pickups.map(p => ({ bookingId: p.id, geocode: source.settings.reviews[p.id]!.geocode })) };
      RouteProposalRecord.parse(saved); await this.store.append(tenant, "proposals", saved); return this.read(tenant, saved.id);
    });
  }
  async read(tenant: RecyclerId, id: string) {
    z.string().uuid().parse(id); const all = await this.store.history<SavedProposal>(tenant, "proposals"), proposal = all.find(p => p.id === id && p.tenant === tenant); if (!proposal) throw Error("PROPOSAL_NOT_FOUND");
    RouteProposalRecord.parse(proposal);
    if (proposal.input.tenant !== tenant) throw Error("STORED_PROPOSAL_INVALID");
    if (proposal.preparationSnapshot) {
      const coordinates = proposal.preparationSnapshot.coordinates;
      if (coordinates.length !== proposal.input.pickups.length || new Set(coordinates.map(c => c.bookingId)).size !== coordinates.length || proposal.input.pickups.some(p => { const g = coordinates.find(c => c.bookingId === p.id)?.geocode; return !g || g.tenant !== tenant || g.state !== "resolved" || g.version !== p.coordinateVersion || g.addressFingerprint !== p.addressFingerprint || fingerprint(g.coordinate) !== fingerprint(p.coordinate); })) throw Error("STORED_PREPARATION_INVALID");
    }
    const validation = validateProposal(proposal.input, proposal.optimization.solution);
    const baselineValidation = validateProposal(proposal.input, proposal.optimization.baseline);
    if (!validation.valid || !baselineValidation.valid || proposal.optimization.inputFingerprint !== fingerprint(proposal.input)) throw Error("STORED_PROPOSAL_INVALID");
    const current = await this.sources(tenant);
    return { ...proposal, comparison: compare(proposal.optimization.solution, proposal.optimization.baseline), current: current.sourceFingerprint === proposal.sourceFingerprint && Date.parse(proposal.input.matrix.expiresAt) > this.now().getTime(), status: "PROPOSAL_ONLY_NOT_DISPATCH" as const };
  }
  async history(tenant: RecyclerId) { return (await this.store.history<SavedProposal>(tenant, "proposals")).filter(p => p.tenant === tenant).map(p => ({ id: p.id, version: p.version, createdAt: p.createdAt, serviceDate: p.input.serviceDate, correlationId: p.correlationId })); }
}

import { z } from "zod";
import { createHash } from "node:crypto";
import type { PortalBooking, RecyclerId } from "../types";
import { trackingSlots } from "../tracking-slots";

export const Tenant = z.enum(["deccan", "paperplus", "quickscrap"]);
export const Id = z.string().min(1).max(160);
export const Nonnegative = z.number().finite().nonnegative();
export const Coordinate = z.object({ lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180) }).strict();
export const Window = z.object({ start: Nonnegative, end: Nonnegative }).strict().refine(w => w.end >= w.start, "End precedes start");
export const ServiceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "Invalid calendar date");
export const Geocode = z.object({
  state: z.enum(["resolved", "ambiguous", "failed", "unavailable", "review-required"]),
  tenant: Tenant, addressFingerprint: Id, version: Id, provider: Id, retrievedAt: z.string().datetime(),
  coordinate: Coordinate.nullable(), reviewedBy: Id.nullable(), precision: z.string().nullable(),
}).strict().superRefine((g, ctx) => { if (g.state === "resolved" && (!g.coordinate || !g.reviewedBy)) ctx.addIssue({ code: "custom", message: "Resolved coordinates require explicit review provenance" }); });
export const Verification = z.object({ tenant: Tenant, bookingId: Id, bookingFingerprint: Id, independent: z.literal(true), verified: z.literal(true), checkedAt: z.string().datetime(), evidenceId: Id }).strict();
export const Preparation = z.object({
  tenant: Tenant, serviceDate: ServiceDate, timezone: z.literal("Asia/Kolkata"),
  verification: Verification.nullable(), geocode: Geocode.nullable(),
  serviceSeconds: z.number().finite().positive().max(86400).nullable(), assumptionVersion: Id,
  confirmedWindow: Window.nullable(), confirmedWindowEvidenceId: Id.nullable(),
}).strict().refine(p => p.confirmedWindow === null || p.confirmedWindowEvidenceId !== null, "Confirmed windows need dispatcher evidence");
export const Pickup = z.object({
  id: Id, reference: Id, tenant: Tenant, bookingFingerprint: Id, serviceDate: ServiceDate,
  timezone: z.literal("Asia/Kolkata"), addressFingerprint: Id, coordinate: Coordinate,
  coordinateVersion: Id, materials: z.array(Id).min(1).max(30), loadKg: Nonnegative,
  serviceSeconds: z.number().finite().positive(), assumptionVersion: Id,
  requestedWindow: z.string().nullable(), confirmedWindow: Window.nullable(),
  verificationEvidenceId: Id,
}).strict();
export type RoutingPickup = z.infer<typeof Pickup>;
export const Vehicle = z.object({
  id: Id, tenant: Tenant, version: Id, provenance: Id,
  start: z.object({ id: Id, coordinate: Coordinate }).strict(),
  end: z.object({ id: Id, coordinate: Coordinate }).strict(),
  capacityKg: z.number().finite().positive(), initialLoadKg: Nonnegative,
  materials: z.array(Id).min(1), operatingWindow: Window,
}).strict().refine(v => v.initialLoadKg <= v.capacityKg, "Initial load exceeds capacity");
export type RoutingVehicle = z.infer<typeof Vehicle>;
export const Edge = z.union([z.object({ state: z.literal("ok"), metres: Nonnegative, seconds: Nonnegative }).strict(), z.object({ state: z.enum(["unreachable", "error"]) }).strict()]);
export const Matrix = z.object({
  tenant: Tenant, version: Id, provider: Id, profile: Id,
  retrievedAt: z.string().datetime(), expiresAt: z.string().datetime(), departureAssumption: Id,
  nodes: z.array(z.object({ id: Id, coordinate: Coordinate }).strict()).min(1).max(64),
  edges: z.array(z.array(Edge)), approximation: z.string().nullable(), billableElements: z.number().int().nonnegative(),
}).strict().superRefine((m, ctx) => {
  const n = m.nodes.length;
  if (new Set(m.nodes.map(v => v.id)).size !== n || m.edges.length !== n || m.edges.some(r => r.length !== n)) ctx.addIssue({ code: "custom", message: "Matrix node identities/dimensions disagree" });
  if (Date.parse(m.expiresAt) <= Date.parse(m.retrievedAt)) ctx.addIssue({ code: "custom", message: "Invalid matrix freshness interval" });
});
export type MatrixSnapshot = z.infer<typeof Matrix>;
export const RouteCalculation = z.object({ routes: z.array(z.object({ vehicleId: Id, pickupIds: z.array(Id).max(50), stops: z.array(z.object({ pickupId: Id, arrival: Nonnegative, serviceStart: Nonnegative, departure: Nonnegative, loadKg: Nonnegative }).strict()).max(50), metres: Nonnegative, travelSeconds: Nonnegative, serviceSeconds: Nonnegative, waitingSeconds: Nonnegative, totalSeconds: Nonnegative, endTime: Nonnegative }).strict()).max(8), unassigned: z.array(z.object({ pickupId: Id, reason: Id }).strict()).max(50), metres: Nonnegative, served: z.number().int().min(0).max(50) }).strict();
const ReplayResult = z.object({ valid: z.boolean(), errors: z.array(z.string()) }).strict();
export const RouteProposalRecord = z.object({
  id: z.string().uuid(), tenant: Tenant, version: z.number().int().positive(), createdAt: z.string().datetime(), correlationId: z.string().uuid(), requestKey: z.string().uuid(), sourceFingerprint: Id,
  input: z.object({ tenant: Tenant, serviceDate: ServiceDate, timezone: z.literal("Asia/Kolkata"), pickups: z.array(Pickup).max(50), vehicles: z.array(Vehicle).max(8), matrix: Matrix }).strict(),
  optimization: z.object({ inputFingerprint: Id, algorithm: Id, status: z.enum(["proven-optimum", "heuristic-feasible", "no-feasible-solution-found"]), solution: RouteCalculation, baseline: RouteCalculation, evaluations: z.number().int().nonnegative().max(20000), evaluationLimit: z.number().int().positive().max(20000), objective: z.string().min(1).max(1024) }).strict(),
  independentValidation: ReplayResult, baselineValidation: ReplayResult,
  comparison: z.object({ comparable: z.boolean(), deltaMetres: z.number().finite().nullable(), reductionPercent: z.number().finite().nullable(), reason: z.string() }).strict(), planningOnly: z.literal(true),
  geometry: z.array(z.object({ provider: Id, geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)])).min(2) }).strict(), metres: Nonnegative, seconds: Nonnegative, attribution: z.string(), vehicleId: Id, matrixMismatch: z.boolean() }).strict()).max(8).optional(), geometryError: Id.optional(),
}).strict();

/** Sorted-key canonicalization; fingerprints are change detectors, never authorization. */
export function fingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function bookingFingerprint(b: PortalBooking): string {
  return fingerprint({ id: b.id, tenant: b.recyclerId, reference: b.bookingReference, address: addressFingerprint(b), items: b.items, state: b.status, updatedAt: b.updatedAt, slots: trackingSlots(b), fee: b.chargedFeeInr });
}
export function addressFingerprint(b: PortalBooking): string { return fingerprint([b.recyclerId, b.addressLine, b.locality, b.pincode]); }
export type Conversion = { eligible: true; pickup: RoutingPickup } | { eligible: false; id: string; reasons: string[] };
/** Pure conversion: item weight is TOTAL ROW kilograms; never multiply by quantity. */
export function bookingToPickup(b: PortalBooking, rawContext: unknown): Conversion {
  const shape = z.object({ id: Id, recyclerId: Tenant, bookingReference: Id, addressLine: z.string(), locality: z.string(), pincode: z.string(), preferredSlot: z.string(), updatedAt: z.string(), status: z.string(), items: z.array(z.object({ name: z.string(), quantity: z.number().optional(), weightKg: z.number().optional(), category: z.string().optional() })), events: z.array(z.object({ status: z.string(), eventType: z.string(), detail: z.string(), createdAt: z.string() })) }).safeParse(b);
  if (!shape.success) return { eligible: false, id: typeof b?.id === "string" ? b.id : "unknown", reasons: ["INVALID_BOOKING"] };
  const parsed = Preparation.safeParse(rawContext);
  if (!parsed.success) return { eligible: false, id: b.id, reasons: ["INVALID_PREPARATION"] };
  const p = parsed.data, reasons: string[] = [], version = bookingFingerprint(b), address = addressFingerprint(b);
  if (b.recyclerId !== p.tenant) reasons.push("TENANT_MISMATCH");
  if (!["RECEIVED", "CONFIRMED", "SCHEDULED"].includes(b.status)) reasons.push("LIFECYCLE_EXCLUDED");
  if (!b.id || !b.bookingReference || !b.addressLine?.trim() || !b.pincode?.trim()) reasons.push("IDENTITY_OR_ADDRESS_MISSING");
  if (!p.verification || p.verification.tenant !== p.tenant || p.verification.bookingId !== b.id || p.verification.bookingFingerprint !== version) reasons.push("INDEPENDENT_VERIFICATION_REQUIRED");
  if (!b.items.length || b.items.some(i => !Number.isFinite(i.weightKg) || i.weightKg! <= 0 || !Number.isInteger(i.quantity) || i.quantity! <= 0 || !i.category?.trim())) reasons.push("LOAD_OR_MATERIAL_UNKNOWN");
  if (!p.geocode || p.geocode.tenant !== p.tenant || p.geocode.state !== "resolved" || p.geocode.addressFingerprint !== address || !p.geocode.coordinate) reasons.push("COORDINATE_REVIEW_REQUIRED");
  if (p.serviceSeconds === null) reasons.push("SERVICE_DURATION_UNKNOWN");
  if (trackingSlots(b).assignedSlot !== null && p.confirmedWindow === null) reasons.push("CONFIRMED_WINDOW_NOT_INTERPRETED");
  if (reasons.length) return { eligible: false, id: b.id, reasons };
  const pickup = Pickup.parse({ id: b.id, reference: b.bookingReference, tenant: p.tenant, bookingFingerprint: version, serviceDate: p.serviceDate, timezone: p.timezone, addressFingerprint: address, coordinate: p.geocode!.coordinate, coordinateVersion: p.geocode!.version, materials: [...new Set(b.items.map(i => i.category!))].sort(), loadKg: b.items.reduce((n, i) => n + i.weightKg!, 0), serviceSeconds: p.serviceSeconds, assumptionVersion: p.assumptionVersion, requestedWindow: trackingSlots(b).requestedSlot, confirmedWindow: p.confirmedWindow, verificationEvidenceId: p.verification!.evidenceId });
  return { eligible: true, pickup };
}
export interface PlanningInput { tenant: RecyclerId; serviceDate: string; timezone: "Asia/Kolkata"; pickups: RoutingPickup[]; vehicles: RoutingVehicle[]; matrix: MatrixSnapshot }
export function validateInput(input: PlanningInput): PlanningInput {
  Tenant.parse(input.tenant); ServiceDate.parse(input.serviceDate);
  if (input.timezone !== "Asia/Kolkata" || input.pickups.length > 50 || input.vehicles.length > 8) throw Error("INPUT_LIMIT_OR_TIMEZONE");
  const pickups = input.pickups.map(p => Pickup.parse(p)), vehicles = input.vehicles.map(v => Vehicle.parse(v)), matrix = Matrix.parse(input.matrix);
  if (new Set(pickups.map(p => p.id)).size !== pickups.length || new Set(vehicles.map(v => v.id)).size !== vehicles.length) throw Error("DUPLICATE_ID");
  if (matrix.tenant !== input.tenant || pickups.some(p => p.tenant !== input.tenant || p.serviceDate !== input.serviceDate) || vehicles.some(v => v.tenant !== input.tenant)) throw Error("TENANT_OR_DATE_MISMATCH");
  const expected = [...pickups.map(p => ({ id: p.id, coordinate: p.coordinate })), ...vehicles.flatMap(v => [v.start, v.end])];
  if (pickups.some(p => vehicles.some(v => v.start.id === p.id || v.end.id === p.id))) throw Error("PICKUP_DEPOT_ID_COLLISION");
  for (const node of expected) { const found = matrix.nodes.find(n => n.id === node.id); if (!found || fingerprint(found.coordinate) !== fingerprint(node.coordinate)) throw Error("MATRIX_NODE_MISMATCH"); }
  return { ...input, pickups, vehicles, matrix };
}

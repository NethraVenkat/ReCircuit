import { z } from "zod";
import type { PortalBooking, RecyclerId } from "../types";
import { bookingFingerprint, fingerprint, type Verification } from "./contracts";

const ObservedItem = z.object({ name: z.string(), quantity: z.number().int().positive(), weightKg: z.number().finite().positive() });
const Evidence = z.object({ verified: z.literal(true), independent: z.literal(true), isUncertain: z.literal(false).optional(), bookingReference: z.string(), observedItems: z.array(ObservedItem), observedFeeText: z.string(), checkedAt: z.string().datetime() });
const Record = z.object({ request: z.object({ id: z.string(), state: z.literal("APPROVED") }), plan: z.object({ legs: z.array(z.object({ id: z.string(), recyclerId: z.string(), bookingReference: z.string().optional(), state: z.string() })) }), household: z.object({ customer: z.object({ addressLine: z.string(), locality: z.string(), pincode: z.string() }), verifications: z.record(z.unknown()) }) });
type Attestation = z.infer<typeof Verification>;
const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
/** Read-only bridge from existing household independent-verification evidence, never operator assertions. */
export function verificationFromHousehold(tenant: RecyclerId, booking: PortalBooking, records: unknown[]): Attestation | null {
  if (booking.recyclerId !== tenant) return null;
  const candidates: Attestation[] = [];
  for (const raw of records) {
    const record = Record.safeParse(raw); if (!record.success) continue;
    const r = record.data, address = r.household.customer;
    if (normalize(address.addressLine) !== normalize(booking.addressLine) || normalize(address.locality) !== normalize(booking.locality) || address.pincode !== booking.pincode) continue;
    for (const leg of r.plan.legs) {
      if (leg.recyclerId !== tenant || leg.bookingReference !== booking.bookingReference || leg.state !== "REQUEST_CONFIRMED") continue;
      const parsed = Evidence.safeParse(r.household.verifications[leg.id]); if (!parsed.success) continue;
      const v = parsed.data;
      if (v.bookingReference !== booking.bookingReference || !Number.isFinite(Date.parse(booking.updatedAt)) || Date.parse(v.checkedAt) < Date.parse(booking.updatedAt)) continue;
      const fee = /(?:₹|INR)\s*(\d+(?:\.\d+)?)/.exec(v.observedFeeText);
      if (!fee || Number(fee[1]) !== booking.chargedFeeInr) continue;
      const observed = v.observedItems.map(i => [normalize(i.name), i.quantity, i.weightKg]).sort(), expected = booking.items.map(i => [normalize(i.name), i.quantity, i.weightKg]).sort();
      if (JSON.stringify(observed) !== JSON.stringify(expected)) continue;
      candidates.push({ tenant, bookingId: booking.id, bookingFingerprint: bookingFingerprint(booking), independent: true, verified: true, checkedAt: v.checkedAt, evidenceId: fingerprint({ requestId: r.request.id, legId: leg.id, checkedAt: v.checkedAt, observed }) });
    }
  }
  // Ambiguous duplicate attestations are not silently selected.
  return candidates.length === 1 ? candidates[0]! : null;
}

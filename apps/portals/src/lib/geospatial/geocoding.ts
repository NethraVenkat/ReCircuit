import { z } from "zod";
import { Coordinate, Id, Tenant } from "./contracts";
export const GeocodeCandidate = z.object({ id: Id, coordinate: Coordinate, label: z.string().min(1).max(500), precision: Id, confidence: z.number().finite().min(0).max(1).nullable() }).strict();
export const GeocodeAttempt = z.object({ id: z.string().uuid(), tenant: Tenant, bookingId: Id, addressFingerprint: Id, provider: Id, providerConfiguration: Id, retrievedAt: z.string().datetime(), expiresAt: z.string().datetime(), state: z.enum(["review-required", "ambiguous", "failed", "unavailable"]), candidates: z.array(GeocodeCandidate).max(5) }).strict().refine(a => Date.parse(a.expiresAt) > Date.parse(a.retrievedAt), "Invalid geocode freshness").refine(a => new Set(a.candidates.map(c => c.id)).size === a.candidates.length && (a.state === "ambiguous" ? a.candidates.length >= 2 : a.state === "review-required" ? a.candidates.length === 1 : a.candidates.length === 0), "Geocoding state and candidates disagree");
export type GeocodeAttemptRecord = z.infer<typeof GeocodeAttempt>;
export interface GeocodingProvider {
  readonly configurationId: string;
  resolve(query: { tenant: z.infer<typeof Tenant>; address: string; addressFingerprint: string }): Promise<{ provider: string; state: GeocodeAttemptRecord["state"]; candidates: z.infer<typeof GeocodeCandidate>[]; retrievedAt?: string; expiresAt?: string }>;
}
export class DisabledGeocoder implements GeocodingProvider {
  readonly configurationId = "geocoding-disabled-v1";
  async resolve(): ReturnType<GeocodingProvider["resolve"]> { throw Error("GEOCODING_DISABLED"); }
}

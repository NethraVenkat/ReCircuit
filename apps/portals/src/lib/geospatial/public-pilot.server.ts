import { fingerprint } from "./contracts";
import { HeiGitProvider } from "./heigit.server";
import { HeiGitGeocoder } from "./geocoding.server";
import type { GeocodingProvider } from "./geocoding";
import type { MatrixRequest } from "./providers";
import type { RoutingPersistence } from "./service";

/** Closed public pilot registry, never a general customer-address permission. */
export const PUBLIC_LANDMARK = { bookingId: "public-heigit-heidelberg-castle", tenant: "deccan" as const, addressLine: "Heidelberg Castle", locality: "Heidelberg", pincode: "69117" };
export const PUBLIC_LANDMARK_ADDRESS = [PUBLIC_LANDMARK.addressLine, PUBLIC_LANDMARK.locality, PUBLIC_LANDMARK.pincode].join(", ");
// Official venue name: https://www.schloss-heidelberg.de/besuchsinformation/anfahrt/
// Keep the original address/fingerprint in stored evidence; search only this fixed public alias.
export const PUBLIC_LANDMARK_QUERY = "Schloss Heidelberg";
const addressHash = fingerprint([PUBLIC_LANDMARK.tenant, PUBLIC_LANDMARK.addressLine, PUBLIC_LANDMARK.locality, PUBLIC_LANDMARK.pincode]);
export const PUBLIC_DOCUMENTATION_COORDINATES = [{ lon: 8.66044, lat: 49.41571 }, { lon: 8.67842, lat: 49.40664 }];
const same = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => a.lat === b.lat && a.lon === b.lon;

export class RegisteredPublicGeocoder extends HeiGitGeocoder {
  constructor(key: string | undefined, enabled: boolean, transport: typeof fetch = fetch) { super(key, enabled, [PUBLIC_LANDMARK_QUERY], transport, 1); }
  override get configurationId(): string { return fingerprint({ base: super.configurationId, registry: "named-public-landmark-v3", address: PUBLIC_LANDMARK_ADDRESS, query: PUBLIC_LANDMARK_QUERY }); }
  override async resolve(query: Parameters<GeocodingProvider["resolve"]>[0]): ReturnType<GeocodingProvider["resolve"]> {
    if (query.tenant !== PUBLIC_LANDMARK.tenant || query.address !== PUBLIC_LANDMARK_ADDRESS || query.addressFingerprint !== addressHash) throw Error("GEOCODING_REGISTERED_PUBLIC_LOCATION_ONLY");
    return super.resolve({ ...query, address: PUBLIC_LANDMARK_QUERY });
  }
}

/** Matrix/geometry may use a named landmark only after its stored candidate was
 * explicitly reviewed without coordinate substitution. Proof is reloaded from
 * the selected persistence backend, so process restarts do not invent authority.
 */
export class PublicOnlyHeiGitProvider extends HeiGitProvider {
  constructor(key: string | undefined, enabled: boolean, private readonly store: Pick<RoutingPersistence, "settings">, private readonly geocoderConfiguration: string, transport: typeof fetch = fetch) { super(key, enabled, transport, 2); }
  override get configurationId(): string { return fingerprint({ base: super.configurationId, registry: "reviewed-public-candidate-v2", geocoderConfiguration: this.geocoderConfiguration }); }
  private async reviewedCoordinate(): Promise<{ lat: number; lon: number } | null> {
    const settings = await this.store.settings(PUBLIC_LANDMARK.tenant), attempt = settings.geocoding[PUBLIC_LANDMARK.bookingId], g = settings.reviews[PUBLIC_LANDMARK.bookingId]?.geocode;
    const selected = attempt?.candidates.find(c => c.id === g?.sourceCandidateId);
    if (settings.tenant !== PUBLIC_LANDMARK.tenant || !attempt || !g || !selected || g.state !== "resolved" || !g.coordinate || !g.reviewedBy || !g.reviewedAt || Date.parse(g.reviewedAt) < Date.parse(attempt.retrievedAt) || g.provider !== "heigit-pelias" || attempt.provider !== g.provider || attempt.tenant !== PUBLIC_LANDMARK.tenant || attempt.bookingId !== PUBLIC_LANDMARK.bookingId || g.tenant !== attempt.tenant || attempt.addressFingerprint !== addressHash || g.addressFingerprint !== addressHash || g.sourceResultId !== attempt.id || attempt.providerConfiguration !== this.geocoderConfiguration || g.providerConfiguration !== this.geocoderConfiguration || g.retrievedAt !== attempt.retrievedAt || Date.parse(attempt.expiresAt) <= Date.now() || !same(g.coordinate, selected.coordinate)) return null;
    return selected.coordinate;
  }
  override async matrix(request: MatrixRequest) {
    const reviewed = await this.reviewedCoordinate();
    if (request.nodes.some(n => !(n.id.startsWith("public-ors-docs-") && PUBLIC_DOCUMENTATION_COORDINATES.some(c => same(c, n.coordinate))) && !(request.tenant === PUBLIC_LANDMARK.tenant && n.id === PUBLIC_LANDMARK.bookingId && reviewed && same(reviewed, n.coordinate)))) throw Error("HEIGIT_PUBLIC_TEST_COORDINATES_ONLY");
    return super.matrix(request);
  }
  override async geometry(nodes: Array<{ lat: number; lon: number }>) {
    const reviewed = await this.reviewedCoordinate();
    if (nodes.some(n => !PUBLIC_DOCUMENTATION_COORDINATES.some(c => same(c, n)) && !(reviewed && same(reviewed, n)))) throw Error("HEIGIT_PUBLIC_TEST_COORDINATES_ONLY");
    return super.geometry(nodes);
  }
}

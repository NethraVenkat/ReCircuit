import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getRepository } from "../repository";
import { RoutingService, RoutingStore } from "./service";
import { verificationFromHousehold } from "./verification-bridge";
import { syntheticBooking, syntheticInput } from "./fixtures";
import { fingerprint, type MatrixSnapshot } from "./contracts";
import type { MatrixProvider, MatrixRequest } from "./providers";
import { PublicOnlyHeiGitProvider, RegisteredPublicGeocoder } from "./public-pilot.server";
import { DisabledGeocoder, type GeocodingProvider } from "./geocoding";
import { SupabaseRoutingStore } from "./shared-store.server";
import { demoProvider, type DemoManifest } from "./demo";

class RegisteredScenarioProvider implements MatrixProvider {
  readonly configurationId = "registered-synthetic-four-stop-v1";
  async matrix(request: MatrixRequest): Promise<MatrixSnapshot> {
    const known = syntheticInput(4).matrix;
    if (request.tenant !== "deccan" || request.nodes.some(node => !known.nodes.some(n => n.id === node.id && fingerprint(n.coordinate) === fingerprint(node.coordinate)))) throw Error("SYNTHETIC_SCENARIO_NOT_REGISTERED");
    const indices = request.nodes.map(n => known.nodes.findIndex(k => k.id === n.id));
    return { ...known, nodes: request.nodes, edges: indices.map(i => indices.map(j => known.edges[i]![j]!)), departureAssumption: request.departureAssumption, version: fingerprint(request), approximation: "SYNTHETIC fictional graph; schematic connectors are not driving directions" };
  }
}
let service: RoutingService | undefined;
class RegisteredScenarioGeocoder implements GeocodingProvider {
  readonly configurationId = "synthetic-geocode-four-stop-v1";
  async resolve(query: Parameters<GeocodingProvider["resolve"]>[0]): ReturnType<GeocodingProvider["resolve"]> {
    const pickup = syntheticInput(4).pickups.find(p => { const b = syntheticBooking(p.id); return query.tenant === "deccan" && query.address === [b.addressLine, b.locality, b.pincode].join(", "); });
    if (!pickup) return { provider: "synthetic-registered-geocoder", state: "unavailable", candidates: [] };
    const candidate = { id: "synthetic-candidate-" + pickup.id, coordinate: pickup.coordinate, label: "SYNTHETIC grid " + pickup.id, precision: "synthetic-fixture", confidence: null };
    const candidates = pickup.id.endsWith("000") ? [candidate, { ...candidate, id: candidate.id + "-alternative", coordinate: { ...candidate.coordinate, lat: 0.001 }, label: "SYNTHETIC alternative; requires operator review" }] : [candidate];
    return { provider: "synthetic-registered-geocoder", state: candidates.length > 1 ? "ambiguous" : "review-required", candidates };
  }
}
export function routingService(): RoutingService {
  // Deployment needs an independently reviewed shared store/coordination mechanism; never silently write ephemeral production files.
  if (process.env.NODE_ENV === "production" || process.env.RECIRCUIT_PERSISTENCE !== "local") throw Error("ROUTING_LOCAL_PREVIEW_ONLY");
  if (service) return service;
  const directory = process.env.ROUTING_DATA_DIR, records = process.env.ROUTING_HOUSEHOLD_EVIDENCE_DIR;
  if (!directory || !path.isAbsolute(directory) || !records || !path.isAbsolute(records)) throw Error("ROUTING_STORAGE_CONFIGURATION_REQUIRED");
  const demo = process.env.RECIRCUIT_DEMO_MODE === "true";
  let manifest: DemoManifest | undefined;
  if (demo) {
    const root = process.env.RECIRCUIT_DEMO_ROOT;
    if (!root || !path.isAbsolute(root) || directory !== path.join(root, "planning") || records !== path.join(root, "household") || process.env.STORAGE_DIR !== path.join(root, "portal")) throw Error("DEMO_STORAGE_SEPARATION_REQUIRED");
    manifest = JSON.parse(readFileSync(path.join(root, "demo-manifest.json"), "utf8")) as DemoManifest;
    if (manifest.kind !== "recircuit-fictional-demo-v1" || !Number.isFinite(Date.parse(manifest.createdAt))) throw Error("DEMO_MANIFEST_REQUIRED");
    if (process.env.ROUTING_EXTERNAL_PUBLIC_ENABLED === "true" || process.env.ROUTING_MATRIX_PROVIDER === "heigit-public" || process.env.ROUTING_GEOCODER_PROVIDER === "heigit-public") throw Error("DEMO_EXTERNAL_PROVIDERS_DISABLED");
  }
  if (!["synthetic", "heigit-public"].includes(process.env.ROUTING_MATRIX_PROVIDER || "synthetic") || !["disabled", "synthetic", "heigit-public"].includes(process.env.ROUTING_GEOCODER_PROVIDER || "disabled")) throw Error("ROUTING_PROVIDER_CONFIGURATION_REQUIRED");
  const geocoder = process.env.ROUTING_GEOCODER_PROVIDER === "synthetic" ? new RegisteredScenarioGeocoder() : process.env.ROUTING_GEOCODER_PROVIDER === "heigit-public" ? new RegisteredPublicGeocoder(process.env.HEIGIT_API_KEY, process.env.ROUTING_EXTERNAL_PUBLIC_ENABLED === "true" && process.env.ROUTING_FREE_QUOTA_CONFIRMED === "true") : new DisabledGeocoder();
  let store: import("./service").RoutingPersistence = new RoutingStore(directory);
  if (process.env.ROUTING_STORE_BACKEND === "supabase-local-test") {
    const url = new URL(process.env.SUPABASE_URL || "https://invalid.example");
    if (process.env.ROUTING_SHARED_TEST_MODE !== "true" || url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.origin !== process.env.SUPABASE_URL) throw Error("ROUTING_SHARED_LOCAL_TEST_CONFIGURATION_REQUIRED");
    store = new SupabaseRoutingStore();
  } else if (process.env.ROUTING_STORE_BACKEND && process.env.ROUTING_STORE_BACKEND !== "local") throw Error("ROUTING_STORAGE_CONFIGURATION_REQUIRED");
  const provider: MatrixProvider = manifest ? demoProvider(manifest.createdAt) : process.env.ROUTING_MATRIX_PROVIDER === "heigit-public" ? new PublicOnlyHeiGitProvider(process.env.HEIGIT_API_KEY, process.env.ROUTING_EXTERNAL_PUBLIC_ENABLED === "true" && process.env.ROUTING_FREE_QUOTA_CONFIRMED === "true", store, geocoder.configurationId) : new RegisteredScenarioProvider();
  service = new RoutingService({ list: tenant => getRepository().listBookings(tenant), verification: async (tenant, booking) => {
    const names = await fs.readdir(records);
    if (names.length > 500) throw Error("EVIDENCE_LIMIT");
    const values = await Promise.all(names.filter(n => /^[a-zA-Z0-9_-]+\.json$/.test(n)).map(async n => JSON.parse(await fs.readFile(path.join(records, n), "utf8")) as unknown));
    return verificationFromHousehold(tenant, booking, values, demo);
  } }, store, provider, () => new Date(), geocoder);
  return service;
}

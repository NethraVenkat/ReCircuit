import fs from "node:fs/promises";
import path from "node:path";
import { getRepository } from "../repository";
import { RoutingService, RoutingStore } from "./service";
import { verificationFromHousehold } from "./verification-bridge";
import { syntheticInput } from "./fixtures";
import { fingerprint, type MatrixSnapshot } from "./contracts";
import type { MatrixProvider, MatrixRequest } from "./providers";
import { HeiGitProvider } from "./heigit.server";

class PublicOnlyHeiGitProvider extends HeiGitProvider {
  async matrix(request: MatrixRequest) {
    const publicCoordinates = [{ lon: 8.66044, lat: 49.41571 }, { lon: 8.67842, lat: 49.40664 }];
    if (request.nodes.some(n => !n.id.startsWith("public-ors-docs-") || !publicCoordinates.some(c => c.lat === n.coordinate.lat && c.lon === n.coordinate.lon))) throw Error("HEIGIT_PUBLIC_TEST_COORDINATES_ONLY");
    return super.matrix(request);
  }
  async geometry(nodes: Array<{ lat: number; lon: number }>) {
    if (nodes.some(n => ![{ lon: 8.66044, lat: 49.41571 }, { lon: 8.67842, lat: 49.40664 }].some(c => c.lat === n.lat && c.lon === n.lon))) throw Error("HEIGIT_PUBLIC_TEST_COORDINATES_ONLY");
    return super.geometry(nodes);
  }
}

class RegisteredScenarioProvider implements MatrixProvider {
  async matrix(request: MatrixRequest): Promise<MatrixSnapshot> {
    const known = syntheticInput(4).matrix;
    if (request.tenant !== "deccan" || request.nodes.some(node => !known.nodes.some(n => n.id === node.id && fingerprint(n.coordinate) === fingerprint(node.coordinate)))) throw Error("SYNTHETIC_SCENARIO_NOT_REGISTERED");
    const indices = request.nodes.map(n => known.nodes.findIndex(k => k.id === n.id));
    return { ...known, nodes: request.nodes, edges: indices.map(i => indices.map(j => known.edges[i]![j]!)), departureAssumption: request.departureAssumption, version: fingerprint(request), approximation: "SYNTHETIC fictional graph; schematic connectors are not driving directions" };
  }
}
let service: RoutingService | undefined;
export function routingService(): RoutingService {
  // Deployment needs an independently reviewed shared store/coordination mechanism; never silently write ephemeral production files.
  if (process.env.NODE_ENV === "production" || process.env.RECIRCUIT_PERSISTENCE !== "local") throw Error("ROUTING_LOCAL_PREVIEW_ONLY");
  if (service) return service;
  const directory = process.env.ROUTING_DATA_DIR, records = process.env.ROUTING_HOUSEHOLD_EVIDENCE_DIR;
  if (!directory || !path.isAbsolute(directory) || !records || !path.isAbsolute(records)) throw Error("ROUTING_STORAGE_CONFIGURATION_REQUIRED");
  const provider: MatrixProvider = process.env.ROUTING_MATRIX_PROVIDER === "heigit-public" ? new PublicOnlyHeiGitProvider(process.env.HEIGIT_API_KEY, process.env.ROUTING_EXTERNAL_PUBLIC_ENABLED === "true", fetch, 2) : new RegisteredScenarioProvider();
  service = new RoutingService({ list: tenant => getRepository().listBookings(tenant), verification: async (tenant, booking) => {
    const names = await fs.readdir(records);
    if (names.length > 500) throw Error("EVIDENCE_LIMIT");
    const values = await Promise.all(names.filter(n => /^[a-zA-Z0-9_-]+\.json$/.test(n)).map(async n => JSON.parse(await fs.readFile(path.join(records, n), "utf8")) as unknown));
    return verificationFromHousehold(tenant, booking, values);
  } }, new RoutingStore(directory), provider);
  return service;
}

import type { MatrixProvider } from "./providers";
import type { RecyclerId } from "../types";
import { fingerprint } from "./contracts";
/** Fixed public test locations; fictional collections, never customer coordinates. */
export const demoLocations = [
  { name: "KBR Park public entrance", lat: 17.4186, lon: 78.4246 },
  { name: "Durgam Cheruvu public park", lat: 17.4314, lon: 78.3889 },
  { name: "Shilparamam public entrance", lat: 17.4527, lon: 78.3783 },
  { name: "Botanical Garden public entrance", lat: 17.4565, lon: 78.3572 },
];
export function demoProvider(createdAt: string): MatrixProvider {
  return { configurationId: "fictional-public-location-demo-v1", matrix: async request => {
    if (request.nodes.some(n => !demoLocations.some(p => p.lat === n.coordinate.lat && p.lon === n.coordinate.lon))) throw Error("DEMO_LOCATION_NOT_REGISTERED");
    return { tenant: request.tenant, version: fingerprint(request), provider: "Simulated public-location costs", profile: "fixture", retrievedAt: createdAt, expiresAt: new Date(Date.parse(createdAt) + 86400000).toISOString(), departureAssumption: request.departureAssumption, nodes: request.nodes, edges: request.nodes.map(a => request.nodes.map(b => {
      const metres = Math.round(Math.hypot((a.coordinate.lat - b.coordinate.lat) * 111000, (a.coordinate.lon - b.coordinate.lon) * 106000) * 1.4);
      return { state: "ok" as const, metres, seconds: Math.round(metres / 7) };
    })), approximation: "Simulated fixture costs; not measured roads or driving directions", billableElements: 0 };
  } };
}
export interface DemoManifest { kind: "recircuit-fictional-demo-v1"; createdAt: string; serviceDate: string; tenants: RecyclerId[] }

/** Server-only: never import from a client component. Credentials only go in Authorization. */
import { z } from "zod";
import { Coordinate, Matrix, fingerprint, type MatrixSnapshot } from "./contracts";
import type { MatrixProvider, MatrixRequest } from "./providers";
const NumericMatrix = z.array(z.array(z.number().finite().nonnegative().nullable()));
const ResponseMatrix = z.object({ distances: NumericMatrix, durations: NumericMatrix });
export class HeiGitProvider implements MatrixProvider {
  get configurationId() { return fingerprint({ adapter: "heigit-ors-v1", origin: "https://api.heigit.org/openrouteservice/v2/", profile: "driving-car", enabled: this.enabled, keyConfigured: !!this.key?.trim() }); }
  private calls = 0;
  private readonly pending = new Map<string, Promise<MatrixSnapshot>>();
  private readonly cache = new Map<string, MatrixSnapshot>();
  readonly accounting = { httpAttempts: 0, elementsRequested: 0, geometryRequests: 0, quotaRemaining: null as number | null, origin: "https://api.heigit.org" };
  constructor(private readonly key: string | undefined, private readonly enabled: boolean, private readonly transport: typeof fetch = fetch, private readonly requestBudget = 4) { if (!Number.isInteger(requestBudget) || requestBudget < 1 || requestBudget > 4) throw Error("HEIGIT_REQUEST_BUDGET_INVALID"); }
  private async post(endpoint: "matrix/driving-car" | "directions/driving-car/geojson", body: unknown, matrixElements = 0): Promise<unknown> {
    if (!this.enabled || !this.key?.trim()) throw Error("HEIGIT_DISABLED_OR_KEY_MISSING");
    if (++this.calls > this.requestBudget) throw Error("HEIGIT_LOCAL_FREE_REQUEST_BUDGET_EXHAUSTED");
    this.accounting.httpAttempts++;
    this.accounting.elementsRequested += matrixElements;
    if (endpoint === "directions/driving-car/geojson") this.accounting.geometryRequests++;
    // Automatic retries are intentionally disabled for the initial tightly budgeted hosted adapter.
    const response = await this.transport("https://api.heigit.org/openrouteservice/v2/" + endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000), headers: { Authorization: this.key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const remaining = response.headers.get("x-ratelimit-remaining"); if (remaining && /^\d+$/.test(remaining)) this.accounting.quotaRemaining = Number(remaining);
    if (response.status === 429) throw Error("HEIGIT_RATE_LIMITED_RETRY_LATER");
    if (!response.ok) throw Error(`HEIGIT_HTTP_${response.status}`);
    const text = await response.text(); if (text.length > 2000000) throw Error("HEIGIT_RESPONSE_LIMIT");
    return JSON.parse(text) as unknown;
  }
  async matrix(input: MatrixRequest): Promise<MatrixSnapshot> {
    if (!this.enabled || !this.key?.trim()) throw Error("HEIGIT_DISABLED_OR_KEY_MISSING");
    // At most 10×10 elements per explicit generation; no silent free-quota batching amplification.
    if (!input.nodes.length || input.nodes.length > 10 || new Set(input.nodes.map(n => n.id)).size !== input.nodes.length) throw Error("HEIGIT_FREE_MATRIX_NODE_LIMIT_10");
    input.nodes.forEach(n => Coordinate.parse(n.coordinate));
    const id = fingerprint({ ...input, provider: "heigit-ors", profile: "driving-car" }), cached = this.cache.get(id);
    if (cached && Date.parse(cached.expiresAt) > Date.now()) return structuredClone(cached);
    const prior = this.pending.get(id); if (prior) return structuredClone(await prior);
    const operation = this.acquire(input, id); this.pending.set(id, operation);
    try { return structuredClone(await operation); } finally { this.pending.delete(id); }
  }
  private async acquire(input: MatrixRequest, id: string): Promise<MatrixSnapshot> {
    const n = input.nodes.length;
    const raw = ResponseMatrix.parse(await this.post("matrix/driving-car", { locations: input.nodes.map(n => [n.coordinate.lon, n.coordinate.lat]), metrics: ["distance", "duration"], units: "m", resolve_locations: false }, n * n));
    if (raw.distances.length !== n || raw.durations.length !== n || raw.distances.some(r => r.length !== n) || raw.durations.some(r => r.length !== n)) throw Error("HEIGIT_PARTIAL_MATRIX");
    const edges: MatrixSnapshot["edges"] = raw.distances.map((row, i) => row.map((distance, j) => {
      const duration = raw.durations[i]![j]; if (distance === null && duration === null) return { state: "unreachable" };
      if (distance === null || duration === null || duration === undefined) throw Error("HEIGIT_MIXED_ERROR_EDGE");
      return { state: "ok", metres: distance, seconds: duration };
    }));
    const now = Date.now();
    const snapshot = Matrix.parse({ tenant: input.tenant, version: id, provider: "heigit-openrouteservice", profile: "driving-car", nodes: input.nodes, edges, retrievedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString(), departureAssumption: input.departureAssumption, approximation: "Static driving-car road profile; no traffic; coordinates may snap to road network", billableElements: n * n });
    // In-memory only: do not infer permission for persistent third-party geocoding/tile storage.
    if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value!); this.cache.set(id, snapshot); return snapshot;
  }
  async geometry(nodes: Array<{ lat: number; lon: number }>) {
    if (nodes.length < 2 || nodes.length > 10) throw Error("GEOMETRY_NODE_LIMIT"); nodes.forEach(n => Coordinate.parse(n));
    const raw = z.object({ features: z.array(z.object({ geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)])).min(2) }), properties: z.object({ summary: z.object({ distance: z.number().finite().nonnegative(), duration: z.number().finite().nonnegative() }) }) })).min(1) }).parse(await this.post("directions/driving-car/geojson", { coordinates: nodes.map(n => [n.lon, n.lat]), instructions: false }));
    return { provider: "heigit-openrouteservice", geometry: raw.features[0]!.geometry, metres: raw.features[0]!.properties.summary.distance, seconds: raw.features[0]!.properties.summary.duration, attribution: "© openrouteservice.org by HeiGIT | © OpenStreetMap contributors" };
  }
}

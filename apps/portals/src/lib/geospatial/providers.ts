import { Coordinate, Matrix, fingerprint, type MatrixSnapshot } from "./contracts";
import type { RecyclerId } from "../types";
export interface Node { id: string; coordinate: { lat: number; lon: number } }
export interface MatrixRequest { tenant: RecyclerId; nodes: Node[]; departureAssumption: string }
export interface RouteGeometry { provider: string; geometry: { type: "LineString"; coordinates: [number, number][] }; metres: number; seconds: number; attribution: string }
export interface MatrixProvider { matrix(input: MatrixRequest): Promise<MatrixSnapshot>; geometry?(coordinates: Node["coordinate"][]): Promise<RouteGeometry> }
export interface GeocodeQuery { tenant: RecyclerId; address: string; addressFingerprint: string }
export type GeocodeCandidates = { state: "review-required" | "ambiguous" | "failed" | "unavailable"; candidates: Array<{ coordinate: Node["coordinate"]; precision: string | null }>; provider: string };

/** Synthetic lookup is closed-world: it cannot resolve an arbitrary customer address. */
export class SyntheticGeocoder {
  constructor(private readonly fixtures: Readonly<Record<string, Node["coordinate"]>>) {}
  async resolve(query: GeocodeQuery): Promise<GeocodeCandidates> {
    const coordinate = this.fixtures[query.tenant + ":" + query.address];
    return { state: coordinate ? "review-required" : "unavailable", candidates: coordinate ? [{ coordinate: Coordinate.parse(coordinate), precision: "explicit synthetic fixture" }] : [], provider: "synthetic-exact-match-v1" };
  }
}
export class SyntheticMatrixProvider implements MatrixProvider {
  constructor(private readonly fixtures: Readonly<Record<string, MatrixSnapshot>>) {}
  async matrix(input: MatrixRequest): Promise<MatrixSnapshot> {
    const fixture = this.fixtures[fingerprint(input)];
    if (!fixture) throw Error("SYNTHETIC_FIXTURE_NOT_REGISTERED");
    return Matrix.parse(structuredClone(fixture));
  }
}
interface ProviderConfig { origin: string; allowedOrigins: string[]; enabled: boolean; profile: "driving"; ttlSeconds: number }
type Transport = typeof fetch;
/** Caller payloads cannot select an origin/profile. No public-demo or public Nominatim defaults. */
export class PrivateRoadProvider implements MatrixProvider {
  private readonly origin: string;
  private readonly inflight = new Map<string, Promise<MatrixSnapshot>>();
  private readonly cache = new Map<string, MatrixSnapshot>();
  private tail: Promise<unknown> = Promise.resolve();
  readonly accounting = { httpAttempts: 0, elementsRequested: 0, elementAttempts: 0 };
  constructor(private readonly config: ProviderConfig, private readonly transport: Transport = fetch, private readonly now: () => number = Date.now) {
    const url = new URL(config.origin);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !config.allowedOrigins.includes(url.origin) || ["router.project-osrm.org", "nominatim.openstreetmap.org"].includes(url.hostname) || config.ttlSeconds <= 0 || config.ttlSeconds > 3600) throw Error("PROVIDER_CONFIGURATION_REJECTED");
    this.origin = url.origin;
  }
  private async request(path: string, elements = 0): Promise<unknown> {
    if (!this.config.enabled) throw Error("PROVIDER_DISABLED");
    // One provider request in flight per configured instance, with a fixed bounded retry budget.
    const run = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        this.accounting.httpAttempts++;
        this.accounting.elementAttempts += elements;
        const response = await this.transport(this.origin + path, { signal: AbortSignal.timeout(5000), redirect: "error", headers: { "User-Agent": "ReCircuit-PrivateRouting/1.0" } });
        if ((response.status === 429 || response.status === 503) && attempt === 0) {
          const retry = response.headers.get("retry-after");
          const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.max(0, (Date.parse(retry) - this.now()) / 1000) : 1;
          if (!Number.isFinite(seconds) || seconds > 2) throw Error("PROVIDER_RATE_LIMIT_RETRY_DEFERRED");
          await new Promise(resolve => setTimeout(resolve, seconds * 1000)); continue;
        }
        if (!response.ok) throw Error(`PROVIDER_HTTP_${response.status}`);
        const text = await response.text(); if (text.length > 2000000) throw Error("PROVIDER_RESPONSE_LIMIT");
        return JSON.parse(text) as unknown;
      }
      throw Error("PROVIDER_RETRY_EXHAUSTED");
    };
    const operation = this.tail.then(run, run); this.tail = operation.catch(() => undefined); return operation;
  }
  async matrix(input: MatrixRequest): Promise<MatrixSnapshot> {
    if (!this.config.enabled) throw Error("PROVIDER_DISABLED");
    if (!input.nodes.length || input.nodes.length > 64 || new Set(input.nodes.map(n => n.id)).size !== input.nodes.length) throw Error("MATRIX_REQUEST_LIMIT");
    input.nodes.forEach(n => Coordinate.parse(n.coordinate));
    const key = fingerprint({ ...input, origin: this.origin, profile: this.config.profile });
    const cached = this.cache.get(key); if (cached && Date.parse(cached.expiresAt) > this.now()) return structuredClone(cached);
    if (this.inflight.has(key)) return structuredClone(await this.inflight.get(key)!);
    const operation = this.acquire(input, key); this.inflight.set(key, operation);
    try { return structuredClone(await operation); } finally { this.inflight.delete(key); }
  }
  private async acquire(input: MatrixRequest, key: string): Promise<MatrixSnapshot> {
    const n = input.nodes.length, edges: MatrixSnapshot["edges"] = Array.from({ length: n }, () => Array.from({ length: n }, () => ({ state: "error" as const })));
    const coordinates = input.nodes.map(n => `${n.coordinate.lon},${n.coordinate.lat}`).join(";");
    for (let a = 0; a < n; a += 16) for (let b = 0; b < n; b += 16) {
      const sources = Array.from({ length: Math.min(16, n - a) }, (_, i) => a + i), destinations = Array.from({ length: Math.min(16, n - b) }, (_, i) => b + i);
      this.accounting.elementsRequested += sources.length * destinations.length;
      const raw = await this.request(`/table/v1/${this.config.profile}/${coordinates}?annotations=distance,duration&sources=${sources.join(";")}&destinations=${destinations.join(";")}`, sources.length * destinations.length) as { code?: string; distances?: unknown[][]; durations?: unknown[][]; fallback_speed_cells?: unknown[] };
      if (raw.code !== "Ok" || raw.fallback_speed_cells?.length || raw.distances?.length !== sources.length || raw.durations?.length !== sources.length) throw Error("MATRIX_PARTIAL_OR_FALLBACK");
      for (const [i, row] of sources.entries()) {
        if (raw.distances[i]?.length !== destinations.length || raw.durations[i]?.length !== destinations.length) throw Error("MATRIX_PARTIAL");
        for (const [j, col] of destinations.entries()) {
          const metres = raw.distances[i]![j], seconds = raw.durations[i]![j];
          if (metres === null && seconds === null) edges[row]![col] = { state: "unreachable" };
          else if (typeof metres === "number" && Number.isFinite(metres) && metres >= 0 && typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) edges[row]![col] = { state: "ok", metres, seconds };
          else throw Error("MATRIX_INVALID_UNITS");
        }
      }
    }
    const now = this.now();
    const result = Matrix.parse({ tenant: input.tenant, version: key, provider: "private-osrm", profile: this.config.profile, retrievedAt: new Date(now).toISOString(), expiresAt: new Date(now + this.config.ttlSeconds * 1000).toISOString(), departureAssumption: input.departureAssumption, nodes: input.nodes, edges, approximation: "Static road profile; no live traffic or service-time prediction", billableElements: n * n });
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!); this.cache.set(key, result); return result;
  }
}

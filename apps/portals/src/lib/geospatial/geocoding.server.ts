import { z } from "zod";
import { fingerprint } from "./contracts";
import { GeocodeCandidate, type GeocodingProvider } from "./geocoding";

const Response = z.object({ type: z.literal("FeatureCollection"), features: z.array(z.object({ geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]) }), properties: z.object({ label: z.string().min(1).max(500), layer: z.string().min(1).max(160), confidence: z.number().finite().min(0).max(1).optional() }) })).max(5) });
/** Server-only public-location pilot. No customer address can leave through this adapter. */
export class HeiGitGeocoder implements GeocodingProvider {
  readonly accounting = { httpAttempts: 0 };
  private readonly cache = new Map<string, { expires: number; result: Awaited<ReturnType<GeocodingProvider["resolve"]>> }>();
  private readonly pending = new Map<string, ReturnType<GeocodingProvider["resolve"]>>();
  private tail: Promise<unknown> = Promise.resolve();
  get configurationId() { return fingerprint({ adapter: "heigit-pelias-public-v1", enabled: this.enabled, keyConfigured: !!this.key?.trim(), publicLocations: this.publicLocations }); }
  constructor(private readonly key: string | undefined, private readonly enabled: boolean, private readonly publicLocations: readonly string[], private readonly transport: typeof fetch = fetch, private readonly budget = 2, private readonly now: () => number = Date.now) { if (!Number.isInteger(budget) || budget < 1 || budget > 4) throw Error("GEOCODING_BUDGET_INVALID"); }
  async resolve(query: Parameters<GeocodingProvider["resolve"]>[0]) {
    if (!this.enabled || !this.key?.trim()) throw Error("GEOCODING_DISABLED_OR_KEY_MISSING");
    if (!this.publicLocations.includes(query.address)) throw Error("GEOCODING_PUBLIC_LOCATIONS_ONLY");
    const cacheKey = fingerprint({ ...query, configuration: this.configurationId }), cached = this.cache.get(cacheKey);
    if (cached && cached.expires > this.now()) return structuredClone(cached.result);
    const pending = this.pending.get(cacheKey); if (pending) return structuredClone(await pending);
    const operation = this.tail.then(async () => {
      if (this.accounting.httpAttempts >= this.budget) throw Error("GEOCODING_REQUEST_BUDGET_EXHAUSTED");
      this.accounting.httpAttempts++;
      // No key in query strings, no automatic retries and no provider body in errors/logs.
      let response: globalThis.Response;
      try { response = await this.transport("https://api.heigit.org/pelias/v1/search?size=5&text=" + encodeURIComponent(query.address), { headers: { Authorization: this.key! }, redirect: "error", signal: AbortSignal.timeout(8000), cache: "no-store" }); }
      catch { throw Error("GEOCODING_NETWORK_OR_TIMEOUT"); }
      if (!response.ok) throw Error(response.status === 429 ? "GEOCODING_RATE_LIMITED_RETRY_LATER" : `GEOCODING_HTTP_${response.status}`);
      const reader = response.body?.getReader(); if (!reader) throw Error("GEOCODING_RESPONSE_INVALID");
      let size = 0, text = ""; const decoder = new TextDecoder();
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) { size += chunk.value.length; if (size > 262144) { await reader.cancel(); throw Error("GEOCODING_RESPONSE_LIMIT"); } text += decoder.decode(chunk.value, { stream: true }); }
      let raw: z.infer<typeof Response>;
      try { raw = Response.parse(JSON.parse(text + decoder.decode())); } catch { throw Error("GEOCODING_RESPONSE_INVALID"); }
      const candidates = raw.features.map((feature, index) => GeocodeCandidate.parse({ id: fingerprint({ cacheKey, index, feature }), coordinate: { lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] }, label: feature.properties.label, precision: feature.properties.layer, confidence: feature.properties.confidence ?? null }));
      const retrieved = this.now(), expires = retrieved + 300000;
      const result = { provider: "heigit-pelias", state: candidates.length > 1 ? "ambiguous" as const : candidates.length ? "review-required" as const : "failed" as const, candidates, retrievedAt: new Date(retrieved).toISOString(), expiresAt: new Date(expires).toISOString() };
      if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value!); this.cache.set(cacheKey, { expires, result }); return result;
    });
    this.tail = operation.catch(() => undefined); this.pending.set(cacheKey, operation);
    try { return structuredClone(await operation); } finally { this.pending.delete(cacheKey); }
  }
}

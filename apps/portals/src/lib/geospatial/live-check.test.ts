import { it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { HeiGitProvider } from "./heigit.server";

it.skipIf(process.env.ROUTING_LIVE_PUBLIC_TEST !== "authorized")("minimal authorized public-coordinate provider probes", async () => {
  const results: Record<string, unknown> = { publicCoordinatesOnly: true, startedAt: new Date().toISOString(), credentialsRecorded: false };
  const provider = new HeiGitProvider(process.env.HEIGIT_API_KEY, true, fetch, 2);
  try {
    const nodes = [{ id: "public-ors-docs-1", coordinate: { lon: 8.66044, lat: 49.41571 } }, { id: "public-ors-docs-2", coordinate: { lon: 8.67842, lat: 49.40664 } }];
    const matrix = await provider.matrix({ tenant: "deccan", nodes, departureAssumption: "Public ORS documentation example; static driving-car" });
    results.matrix = matrix; const geometry = await provider.geometry(nodes.map(n => n.coordinate));
    results.geometry = { ...geometry, geometry: { type: geometry.geometry.type, pointCount: geometry.geometry.coordinates.length } };
    const edge = matrix.edges[0]![1]; results.matrixGeometryDistanceDeltaMetres = edge?.state === "ok" ? geometry.metres - edge.metres : null;
    results.heigit = "VERIFIED_LIVE_PUBLIC_SAMPLE";
  } catch { results.heigit = "FAILED_OR_UNAVAILABLE_NO_SUCCESS_CLAIM"; }
  results.heigitAccounting = provider.accounting;
  if (process.env.MAPTILER_API_KEY && process.env.ROUTING_MAPTILER_PROBE !== "skip") {
    try {
      const url = new URL("https://api.maptiler.com/maps/streets-v2/style.json"); url.searchParams.set("key", process.env.MAPTILER_API_KEY);
      const response = await fetch(url, { headers: { Origin: "https://not-permitted.recircuit.invalid" }, redirect: "error", signal: AbortSignal.timeout(8000) });
      results.maptilerNegativeOriginStatus = response.status;
      results.maptilerBrowserExposure = response.status === 403 ? "NEGATIVE_ORIGIN_REJECTED_PERMITTED_ORIGIN_STILL_REQUIRED" : "DISABLED_RESTRICTIONS_NOT_VERIFIED";
      // Never persist style JSON: its source URLs contain the browser credential.
    } catch { results.maptilerBrowserExposure = "DISABLED_PROBE_UNAVAILABLE"; }
  }
  results.finishedAt = new Date().toISOString();
  const directory = process.env.ROUTING_LIVE_EVIDENCE_DIR; if (!directory || !path.isAbsolute(directory)) throw Error("Evidence directory required");
  const file = path.join(directory, "live-public-" + Date.now() + ".json"); fs.writeFileSync(file, JSON.stringify(results, null, 2), { flag: "wx" });
  expect(results.heigit).toBe("VERIFIED_LIVE_PUBLIC_SAMPLE");
}, 30000);

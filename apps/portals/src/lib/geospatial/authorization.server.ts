import { timingSafeEqual } from "node:crypto";
import { Tenant } from "./contracts";
export function authorizeRouting(request: Request) {
  if (process.env.ROUTING_ENABLED !== "true") throw Error("ROUTING_DISABLED");
  const expected = process.env.ADMIN_TOKEN?.trim(), supplied = request.headers.get("x-admin-token")?.trim();
  if (!expected || !supplied) throw Error("ROUTING_UNAUTHORIZED");
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Error("ROUTING_UNAUTHORIZED");
  const tenant = Tenant.parse(process.env.RECYCLER_ID);
  if (request.method !== "GET") {
    const origin = request.headers.get("origin"), allowed = (process.env.ROUTING_ALLOWED_ORIGINS || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3200,http://127.0.0.1:3200")).split(",");
    // Next's internal request URL may use localhost while the browser uses 127.0.0.1.
    // Check the actual Host plus a fixed server origin allowlist, never forwarded headers.
    if (!origin || !allowed.includes(origin) || new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host)) throw Error("ROUTING_ORIGIN_REJECTED");
  }
  return { tenant, reviewer: "authorized-tenant-operator" };
}
export function permittedMapOrigin(origin: string): boolean {
  const allowed = (process.env.MAPTILER_ALLOWED_ORIGINS || "").split(",").filter(Boolean);
  // Origin values are exact URL origins. Wildcards, paths and opaque origins are prohibited.
  return allowed.some(value => { try { const url = new URL(value); return url.origin === value && !url.username && !url.password && value === origin && ["http:", "https:"].includes(url.protocol); } catch { return false; } });
}
export function browserMapConfiguration(origin: string): { enabled: boolean; key?: string; reason?: string } {
  if (process.env.MAPTILER_ORIGIN_RESTRICTIONS_VERIFIED !== "true" || !permittedMapOrigin(origin) || !process.env.MAPTILER_API_KEY) return { enabled: false, reason: "Provider origin restrictions not verified; schematic map remains usable" };
  // This is an intentional public browser credential, released only after origin restriction review.
  // HEIGIT_API_KEY has no browser-facing path and must never receive a NEXT_PUBLIC_ alias.
  return { enabled: true, key: process.env.MAPTILER_API_KEY };
}

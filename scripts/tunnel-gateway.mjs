/**
 * scripts/tunnel-gateway.mjs
 *
 * Secure Multi-Tenant Reverse Proxy & Tunnel Gateway for ReCircuit.
 *
 * Architecture & Guarantees:
 * 1. Loopback Binding: Bound strictly to 127.0.0.1 (never 0.0.0.0).
 * 2. Fixed Upstreams: Forwards exclusively to:
 *    - Deccan E-Cycle:   127.0.0.1:3101
 *    - PaperPlus Kabadi: 127.0.0.1:3102
 *    - QuickScrap Hyd:   127.0.0.1:3103
 * 3. Method Allowlist: Permitted methods: GET, POST, HEAD, OPTIONS.
 *    Any other method is rejected with 405 Method Not Allowed.
 * 4. Strict Route Blocking with Normalization:
 *    Decodes and normalizes URI path (resolving '.', '..', duplicate slashes, trailing slashes).
 *    Blocks /admin, /api/admin, /api/reset (and all variations/subpaths) with 403 Forbidden.
 * 5. Public Route Allowlist:
 *    Only explicit portal pages, shared public APIs, and Next.js assets are forwarded.
 * 6. Deterministic Recycler Tenant Identity (No Authoritative Referer):
 *    Tenant identity is resolved hierarchically through durable, validated mechanisms:
 *    - Path Prefix: /portal/deccan, /portal/paperplus, /portal/quickscrap (or /deccan/*, etc.)
 *    - Distinct Canonical Routes: (/book-pickup, /schedule, /pickup, /what-we-take, /rates, etc.)
 *    - Reference Prefixes: (DEC-*, PPK-*, QSH-*)
 *    - Subdomain / Host Match: (deccan.*, paperplus.*, quickscrap.*)
 *    - Durable Tenant Cookie: recircuit_tenant=deccan|paperplus|quickscrap
 *    - Explicit Header: x-recycler-id: deccan|paperplus|quickscrap
 *    - Landing Query Parameter: ?portal=deccan|paperplus|quickscrap
 *    When a tenant is resolved, the gateway sets 'Set-Cookie: recircuit_tenant=<tenant>; Path=/; SameSite=Lax; HttpOnly'
 *    so all subsequent shared /api/*, /_next/*, redirects, reloads, and form actions inherit that tenant identity.
 * 7. Fail Closed:
 *    Any ambiguous request (e.g. naked / or naked /api/fee without tenant cookie/header/path)
 *    fails closed with HTTP 400 / 421. Zero silent fallback to Deccan.
 */

import http from "http";
import path from "path";
import { URL } from "url";

const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || "3100", 10);
const GATEWAY_HOST = "127.0.0.1"; // Bound strictly to loopback

const UPSTREAMS = {
  deccan: { host: "127.0.0.1", port: 3101, name: "Deccan E-Cycle" },
  paperplus: { host: "127.0.0.1", port: 3102, name: "PaperPlus Kabadi" },
  quickscrap: { host: "127.0.0.1", port: 3103, name: "QuickScrap Hyd" },
};

const ALLOWED_METHODS = new Set(["GET", "POST", "HEAD", "OPTIONS"]);

// Canonical routes belonging to each recycler
const CANONICAL_ROUTES = {
  deccan: [
    "/accepted-items",
    "/pickup-charges",
    "/book-pickup",
    "/book-pickup/confirmation",
    "/track",
  ],
  paperplus: [
    "/what-we-take",
    "/schedule",
    "/schedule/done",
    "/status",
  ],
  quickscrap: [
    "/rates",
    "/pickup",
    "/pickup/thanks",
    "/track-order",
  ],
};

const SHARED_PUBLIC_APIS = new Set([
  "/api/bookings",
  "/api/fee",
  "/api/captcha",
  "/api/health",
]);

/**
 * Normalizes request path:
 * - Decodes percent-encoded characters
 * - Normalizes slashes and resolves relative segments
 * - Strips trailing slash (except root)
 */
export function normalizePath(rawPath) {
  try {
    const decoded = decodeURIComponent(rawPath);
    // Remove query string if present
    const clean = decoded.split("?")[0].replace(/\\/g, "/");
    // Resolve path navigation
    const normalized = path.posix.normalize(clean);
    // Strip trailing slash unless root
    if (normalized.length > 1 && normalized.endsWith("/")) {
      return normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return rawPath.split("?")[0];
  }
}

/**
 * Checks if normalized path attempts to reach admin, reset, or failure switch routes.
 */
export function isBlockedRoute(normPath) {
  const lower = normPath.toLowerCase();
  return (
    lower === "/admin" ||
    lower.startsWith("/admin/") ||
    lower === "/api/admin" ||
    lower.startsWith("/api/admin/") ||
    lower === "/api/reset" ||
    lower.startsWith("/api/reset/")
  );
}

/**
 * Parse cookies from request header
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx !== -1) {
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

/**
 * Resolves tenant identity deterministically.
 * Returns { recyclerId, rewritePath, setCookie } or null if ambiguous.
 */
export function resolveTenant(req, normPath, parsedUrl) {
  const headers = req.headers || {};
  const queryPortal = parsedUrl.searchParams.get("portal")?.toLowerCase();
  const queryRef = parsedUrl.searchParams.get("ref")?.toUpperCase() || "";
  const headerRecycler = headers["x-recycler-id"]?.toLowerCase();
  const host = (headers["host"] || "").toLowerCase();
  const cookies = parseCookies(headers["cookie"]);
  const cookieTenant = cookies["recircuit_tenant"]?.toLowerCase();

  // 1. Explicit path prefix: /portal/:tenant or /portal/:tenant/*
  const portalPrefixMatch = normPath.match(/^\/portal\/(deccan|paperplus|quickscrap)(\/.*)?$/i);
  if (portalPrefixMatch) {
    const tenant = portalPrefixMatch[1].toLowerCase();
    const subpath = portalPrefixMatch[2] || "/";
    return {
      recyclerId: tenant,
      rewritePath: subpath + (parsedUrl.search || ""),
      setCookie: tenant,
      source: "path-prefix",
    };
  }

  // Path prefix /:tenant/*
  const directPrefixMatch = normPath.match(/^\/(deccan|paperplus|quickscrap)(\/.*)?$/i);
  if (directPrefixMatch) {
    const tenant = directPrefixMatch[1].toLowerCase();
    const subpath = directPrefixMatch[2] || "/";
    return {
      recyclerId: tenant,
      rewritePath: subpath + (parsedUrl.search || ""),
      setCookie: tenant,
      source: "path-prefix",
    };
  }

  // 2. Canonical distinct routes
  for (const [tenant, routes] of Object.entries(CANONICAL_ROUTES)) {
    for (const r of routes) {
      if (normPath === r || normPath.startsWith(`${r}/`)) {
        return {
          recyclerId: tenant,
          rewritePath: req.url,
          setCookie: tenant,
          source: "canonical-route",
        };
      }
    }
  }

  // 3. Tracking reference prefix in URL params
  if (queryRef.startsWith("DEC-")) {
    return { recyclerId: "deccan", rewritePath: req.url, setCookie: "deccan", source: "ref-prefix" };
  }
  if (queryRef.startsWith("PPK-")) {
    return { recyclerId: "paperplus", rewritePath: req.url, setCookie: "paperplus", source: "ref-prefix" };
  }
  if (queryRef.startsWith("QSH-")) {
    return { recyclerId: "quickscrap", rewritePath: req.url, setCookie: "quickscrap", source: "ref-prefix" };
  }

  // 4. Host header subdomain match (e.g. deccan.example.com)
  if (host.includes("deccan.") || host.startsWith("deccan-")) {
    return { recyclerId: "deccan", rewritePath: req.url, setCookie: "deccan", source: "host-header" };
  }
  if (host.includes("paperplus.") || host.startsWith("paperplus-")) {
    return { recyclerId: "paperplus", rewritePath: req.url, setCookie: "paperplus", source: "host-header" };
  }
  if (host.includes("quickscrap.") || host.startsWith("quickscrap-")) {
    return { recyclerId: "quickscrap", rewritePath: req.url, setCookie: "quickscrap", source: "host-header" };
  }

  // 5. Explicit HTTP header x-recycler-id
  if (headerRecycler && UPSTREAMS[headerRecycler]) {
    return { recyclerId: headerRecycler, rewritePath: req.url, setCookie: headerRecycler, source: "header" };
  }

  // 6. Explicit landing query param ?portal=:tenant
  if (queryPortal && UPSTREAMS[queryPortal]) {
    return { recyclerId: queryPortal, rewritePath: req.url, setCookie: queryPortal, source: "query-param" };
  }

  // 7. Durable Session Cookie recircuit_tenant
  if (cookieTenant && UPSTREAMS[cookieTenant]) {
    return { recyclerId: cookieTenant, rewritePath: req.url, setCookie: null, source: "cookie" };
  }

  // 8. Fail Closed: Cannot determine tenant unambiguously
  return null;
}

/**
 * Checks if the request path is in the public route allowlist.
 */
export function isAllowedPublicRoute(normPath) {
  if (normPath === "/" || normPath.startsWith("/portal/")) return true;
  if (normPath.startsWith("/_next/") || normPath === "/favicon.ico") return true;

  if (SHARED_PUBLIC_APIS.has(normPath)) return true;

  for (const routes of Object.values(CANONICAL_ROUTES)) {
    for (const r of routes) {
      if (normPath === r || normPath.startsWith(`${r}/`)) return true;
    }
  }

  // Prefixed versions (/deccan/..., etc.)
  for (const tenant of Object.keys(UPSTREAMS)) {
    if (normPath === `/${tenant}` || normPath.startsWith(`/${tenant}/`)) return true;
  }

  return false;
}

export function createGatewayServer() {
  const server = http.createServer((clientReq, clientRes) => {
    // 1. Method Allowlist Enforcement
    const method = (clientReq.method || "GET").toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      clientRes.writeHead(405, { "Content-Type": "application/json" });
      clientRes.end(JSON.stringify({ error: "Method Not Allowed", method, status: 405 }));
      return;
    }

    const parsedUrl = new URL(clientReq.url, `http://${clientReq.headers.host || "127.0.0.1"}`);
    const normPath = normalizePath(parsedUrl.pathname);

    // 2. Strict Security Block: Reject Admin / Reset Routes Across All Methods
    if (isBlockedRoute(normPath)) {
      console.warn(`[SECURITY BLOCK] Blocked administrative request: ${method} ${clientReq.url}`);
      clientRes.writeHead(403, { "Content-Type": "application/json" });
      clientRes.end(
        JSON.stringify({
          error: "Forbidden",
          message: "Access to administrative and reset endpoints is strictly prohibited over public tunnels.",
          status: 403,
        })
      );
      return;
    }

    // 3. Public Route Allowlist Enforcement
    if (!isAllowedPublicRoute(normPath)) {
      clientRes.writeHead(404, { "Content-Type": "application/json" });
      clientRes.end(
        JSON.stringify({
          error: "Not Found",
          message: `The requested route is not in the public gateway allowlist: ${normPath}`,
          status: 404,
        })
      );
      return;
    }

    // 4. Deterministic Recycler Routing Resolution
    const routing = resolveTenant(clientReq, normPath, parsedUrl);

    // If ambiguous, FAIL CLOSED
    if (!routing) {
      clientRes.writeHead(400, { "Content-Type": "application/json" });
      clientRes.end(
        JSON.stringify({
          error: "AmbiguousTenantRouting",
          message:
            "Tenant identity cannot be determined. Request must specify tenant via path prefix (/portal/<tenant>), distinct route, recircuit_tenant cookie, or x-recycler-id header.",
          status: 400,
        })
      );
      return;
    }

    const { recyclerId, rewritePath, setCookie } = routing;
    const target = UPSTREAMS[recyclerId];

    console.log(`[GATEWAY] ${clientReq.method} ${clientReq.url} -> ${recyclerId}:${target.port} (source: ${routing.source})`);

    // Forwarding Headers
    const headers = { ...clientReq.headers };
    headers["host"] = `127.0.0.1:${target.port}`;
    headers["x-forwarded-for"] = clientReq.socket.remoteAddress || "127.0.0.1";
    headers["x-forwarded-proto"] = clientReq.headers["x-forwarded-proto"] || "http";
    headers["x-gateway-tenant"] = recyclerId;

    // Attach recircuit_tenant cookie if not already in Cookie header
    if (!headers["cookie"] || !headers["cookie"].includes("recircuit_tenant=")) {
      headers["cookie"] = headers["cookie"]
        ? `${headers["cookie"]}; recircuit_tenant=${recyclerId}`
        : `recircuit_tenant=${recyclerId}`;
    }

    const proxyReq = http.request(
      {
        host: target.host,
        port: target.port,
        path: rewritePath,
        method: clientReq.method,
        headers,
      },
      (proxyRes) => {
        const resHeaders = { ...proxyRes.headers };

        // Attach Set-Cookie if tenant was resolved or changed
        if (setCookie) {
          const cookieStr = `recircuit_tenant=${setCookie}; Path=/; SameSite=Lax; HttpOnly`;
          const existingSetCookie = resHeaders["set-cookie"];
          if (!existingSetCookie) {
            resHeaders["set-cookie"] = [cookieStr];
          } else if (Array.isArray(existingSetCookie)) {
            resHeaders["set-cookie"] = [...existingSetCookie, cookieStr];
          } else {
            resHeaders["set-cookie"] = [existingSetCookie, cookieStr];
          }
        }

        clientRes.writeHead(proxyRes.statusCode || 200, resHeaders);
        proxyRes.pipe(clientRes);
      }
    );

    proxyReq.on("error", (err) => {
      console.error(`[GATEWAY ERROR] Failed to connect to ${target.name} (port ${target.port}):`, err.message);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { "Content-Type": "application/json" });
        clientRes.end(
          JSON.stringify({
            error: "Bad Gateway",
            message: `Mock portal upstream for ${recyclerId} on port ${target.port} is unreachable. Ensure start-portals is active.`,
            status: 502,
          })
        );
      }
    });

    clientReq.pipe(proxyReq);
  });

  return server;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const server = createGatewayServer();
  server.listen(GATEWAY_PORT, GATEWAY_HOST, () => {
    console.log("==================================================================");
    console.log(`🚀 Secure Multi-Tenant Tunnel Gateway listening on http://${GATEWAY_HOST}:${GATEWAY_PORT}`);
    console.log("==================================================================");
    console.log(`- Loopback binding strictly enforced: ${GATEWAY_HOST}`);
    console.log(`- Upstream routing targets:`);
    console.log(`  * Deccan:     ${UPSTREAMS.deccan.host}:${UPSTREAMS.deccan.port}`);
    console.log(`  * PaperPlus:  ${UPSTREAMS.paperplus.host}:${UPSTREAMS.paperplus.port}`);
    console.log(`  * QuickScrap: ${UPSTREAMS.quickscrap.host}:${UPSTREAMS.quickscrap.port}`);
    console.log(`- Security: /admin, /api/admin, /api/reset strictly BLOCKED (403 Forbidden)`);
    console.log(`- Routing: Durable cookie recircuit_tenant & canonical path matching enforced`);
    console.log(`- Fail Closed: Ambiguous requests rejected with 400 Bad Request`);
  });

  const cleanup = () => {
    console.log("\n🛑 Stopping Gateway...");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

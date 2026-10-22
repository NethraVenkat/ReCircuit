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
 * 5. Portal Route Validation:
 *    Validates /portal/:tenant against exact known tenants (deccan, paperplus, quickscrap).
 *    Unknown tenant -> 404 Not Found.
 *    Validates subpaths against allowed routes for that tenant. Cross-tenant routes -> 400 Bad Request.
 * 6. Explicit Tenant Selector Conflict Detection:
 *    Detects any conflicting explicit selectors (path prefix, canonical route, x-recycler-id header, ?ref=, ?portal=).
 *    If conflicting explicit selectors are detected, fails closed with 400 Bad Request (ConflictingTenantSelectors).
 * 7. Durable Multi-Tenant Routing (No Multi-Tab Cookie Collisions):
 *    Tenant identity is resolved deterministically from explicit selectors.
 *    Direct API requests (/api/fee, /api/bookings, etc.) must specify tenant explicitly (via path /portal/:tenant/api/... or x-recycler-id header).
 *    Naked API requests without explicit tenant fail closed (400 Bad Request) rather than relying on shared cookies that could be clobbered by another tab.
 *    Cookies set on /portal/:tenant are scoped with Path=/portal/:tenant.
 * 8. Graceful Process Teardown:
 *    Provides clean socket draining, server shutdown, and SIGINT/SIGTERM handlers.
 */

import http from "http";
import path from "path";
import { URL } from "url";

export const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || "3100", 10);
export const GATEWAY_HOST = "127.0.0.1"; // Bound strictly to loopback

export const UPSTREAMS = {
  deccan: { host: "127.0.0.1", port: 3101, name: "Deccan E-Cycle" },
  paperplus: { host: "127.0.0.1", port: 3102, name: "PaperPlus Kabadi" },
  quickscrap: { host: "127.0.0.1", port: 3103, name: "QuickScrap Hyd" },
};

export const ALLOWED_METHODS = new Set(["GET", "POST", "HEAD", "OPTIONS"]);

// Canonical routes belonging to each recycler
export const CANONICAL_ROUTES = {
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

export const SHARED_PUBLIC_APIS = new Set([
  "/api/bookings",
  "/api/fee",
  "/api/captcha",
  "/api/health",
]);

export const TENANT_ALLOWED_SUBPATHS = {
  deccan: new Set([
    "/",
    "/book-pickup",
    "/accepted-items",
    "/pickup-charges",
    "/track",
    "/book-pickup/confirmation",
    "/api/bookings",
    "/api/fee",
    "/api/health",
  ]),
  paperplus: new Set([
    "/",
    "/schedule",
    "/what-we-take",
    "/status",
    "/schedule/done",
    "/api/bookings",
    "/api/fee",
    "/api/captcha",
    "/api/health",
  ]),
  quickscrap: new Set([
    "/",
    "/pickup",
    "/rates",
    "/track-order",
    "/pickup/thanks",
    "/api/bookings",
    "/api/fee",
    "/api/health",
  ]),
};

/**
 * Normalizes request path:
 * - Decodes percent-encoded characters
 * - Normalizes slashes and resolves relative segments
 * - Strips trailing slash (except root)
 */
export function normalizePath(rawPath) {
  try {
    const decoded = decodeURIComponent(rawPath);
    const clean = decoded.split("?")[0].replace(/\\/g, "/");
    const normalized = path.posix.normalize(clean);
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
 * Validates /portal/:tenant/:subpath routes:
 * - Ensures :tenant is in UPSTREAMS
 * - Blocks administrative routes
 * - Verifies :subpath is allowed for that tenant
 */
export function validatePortalRoute(normPath) {
  const match = normPath.match(/^\/portal\/([^/]+)(\/.*)?$/i);
  if (!match) return { isPortal: false };

  const rawTenant = match[1].toLowerCase();
  const subpath = match[2] || "/";

  if (!UPSTREAMS[rawTenant]) {
    return {
      isPortal: true,
      valid: false,
      status: 404,
      error: "UnknownTenant",
      message: `Tenant '${rawTenant}' is not a recognized recycler portal. Expected one of: ${Object.keys(UPSTREAMS).join(", ")}.`,
    };
  }

  if (isBlockedRoute(subpath) || isBlockedRoute(normPath)) {
    return {
      isPortal: true,
      valid: false,
      status: 403,
      error: "Forbidden",
      message: "Access to administrative and reset endpoints is strictly prohibited over public tunnels.",
    };
  }

  const allowed = TENANT_ALLOWED_SUBPATHS[rawTenant];
  const isAllowedSubpath =
    allowed.has(subpath) ||
    subpath.startsWith("/_next/") ||
    subpath.startsWith("/api/bookings") ||
    subpath.startsWith("/api/fee") ||
    subpath.startsWith("/api/captcha") ||
    subpath === "/favicon.ico" ||
    (rawTenant === "deccan" && subpath.startsWith("/book-pickup/confirmation")) ||
    (rawTenant === "paperplus" && subpath.startsWith("/schedule/done")) ||
    (rawTenant === "quickscrap" && subpath.startsWith("/pickup/thanks"));

  if (!isAllowedSubpath) {
    return {
      isPortal: true,
      valid: false,
      status: 400,
      error: "RouteNotPermittedForTenant",
      message: `Route '${subpath}' is not permitted on the ${UPSTREAMS[rawTenant].name} portal.`,
    };
  }

  return {
    isPortal: true,
    valid: true,
    tenant: rawTenant,
    subpath,
  };
}

/**
 * Parse cookies from request header
 */
export function parseCookies(cookieHeader) {
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
 * Detects any conflicting explicit tenant selectors.
 */
export function detectTenantConflicts(req, normPath, parsedUrl) {
  const headers = req.headers || {};
  const queryPortal = parsedUrl.searchParams.get("portal")?.toLowerCase();
  const queryTenant = parsedUrl.searchParams.get("tenant")?.toLowerCase();
  const queryRef = parsedUrl.searchParams.get("ref")?.toUpperCase() || "";
  const headerRecycler = headers["x-recycler-id"]?.toLowerCase();
  const host = (headers["host"] || "").toLowerCase();

  const selectors = [];

  // 1. Path prefix: /portal/:tenant/* or /:tenant/*
  const portalMatch = normPath.match(/^\/portal\/([^/]+)(\/.*)?$/i);
  if (portalMatch && UPSTREAMS[portalMatch[1].toLowerCase()]) {
    selectors.push({ source: "path-prefix", tenant: portalMatch[1].toLowerCase() });
  }
  const directMatch = normPath.match(/^\/(deccan|paperplus|quickscrap)(\/.*)?$/i);
  if (directMatch && UPSTREAMS[directMatch[1].toLowerCase()]) {
    selectors.push({ source: "path-prefix", tenant: directMatch[1].toLowerCase() });
  }

  // 2. Canonical route
  const pathToCheck = portalMatch ? portalMatch[2] || "/" : normPath;
  for (const [t, routes] of Object.entries(CANONICAL_ROUTES)) {
    for (const r of routes) {
      if (pathToCheck === r || pathToCheck.startsWith(`${r}/`)) {
        selectors.push({ source: "canonical-route", tenant: t });
      }
    }
  }

  // 3. Header x-recycler-id
  if (headerRecycler && UPSTREAMS[headerRecycler]) {
    selectors.push({ source: "header", tenant: headerRecycler });
  }

  // 4. Query param ?portal= or ?tenant=
  const explicitQuery = queryPortal || queryTenant;
  if (explicitQuery && UPSTREAMS[explicitQuery]) {
    selectors.push({ source: "query-param", tenant: explicitQuery });
  }

  // 5. Tracking ref prefix
  if (queryRef.startsWith("DEC-")) {
    selectors.push({ source: "ref-prefix", tenant: "deccan" });
  } else if (queryRef.startsWith("PPK-")) {
    selectors.push({ source: "ref-prefix", tenant: "paperplus" });
  } else if (queryRef.startsWith("QSH-")) {
    selectors.push({ source: "ref-prefix", tenant: "quickscrap" });
  }

  // 6. Host header subdomain match
  for (const t of Object.keys(UPSTREAMS)) {
    if (host.includes(`${t}.`) || host.startsWith(`${t}-`)) {
      selectors.push({ source: "host-header", tenant: t });
    }
  }

  // Check for conflict
  const distinctTenants = new Set(selectors.map((s) => s.tenant));
  if (distinctTenants.size > 1) {
    return {
      hasConflict: true,
      selectors,
      message: `Conflicting explicit tenant selectors detected: ${selectors.map((s) => `${s.source}='${s.tenant}'`).join(" vs ")}`,
    };
  }

  return {
    hasConflict: false,
    resolvedTenant: distinctTenants.size === 1 ? Array.from(distinctTenants)[0] : null,
    source: selectors[0]?.source || null,
  };
}

/**
 * Resolves tenant identity deterministically.
 * Returns { recyclerId, rewritePath, setCookie, source } or { conflict, message } or null if ambiguous.
 */
export function resolveTenant(req, normPath, parsedUrl) {
  // 1. Conflict detection
  const conflictCheck = detectTenantConflicts(req, normPath, parsedUrl);
  if (conflictCheck.hasConflict) {
    return { conflict: true, message: conflictCheck.message };
  }

  // 2. Explicit selector resolved
  if (conflictCheck.resolvedTenant) {
    const tenant = conflictCheck.resolvedTenant;
    const portalMatch = normPath.match(/^\/portal\/([^/]+)(\/.*)?$/i);
    const directMatch = normPath.match(/^\/(deccan|paperplus|quickscrap)(\/.*)?$/i);

    let rewritePath = req.url;
    if (portalMatch) {
      rewritePath = (portalMatch[2] || "/") + (parsedUrl.search || "");
    } else if (directMatch) {
      rewritePath = (directMatch[2] || "/") + (parsedUrl.search || "");
    }

    return {
      recyclerId: tenant,
      rewritePath,
      setCookie: tenant,
      source: conflictCheck.source,
    };
  }

  // 3. Static assets & Next.js internals: route to the matching upstream
  if (normPath.startsWith("/_next/") || normPath === "/favicon.ico") {
    // A. Check if chunk path contains a canonical route name (e.g. /app/schedule/page.js -> paperplus)
    for (const [t, routes] of Object.entries(CANONICAL_ROUTES)) {
      for (const r of routes) {
        const clean = r.replace(/^\//, "");
        if (normPath.includes(`/${clean}/`) || normPath.includes(`/${clean}.`)) {
          return { recyclerId: t, rewritePath: req.url, setCookie: null, source: "asset-route-match" };
        }
      }
    }

    // B. Check Referer header if present
    const referer = req.headers["referer"] || "";
    for (const t of Object.keys(UPSTREAMS)) {
      if (referer.includes(`/portal/${t}`) || referer.includes(`/${t}/`)) {
        return { recyclerId: t, rewritePath: req.url, setCookie: null, source: "asset-referer" };
      }
    }
    for (const [t, routes] of Object.entries(CANONICAL_ROUTES)) {
      for (const r of routes) {
        if (referer.includes(r)) {
          return { recyclerId: t, rewritePath: req.url, setCookie: null, source: "asset-referer" };
        }
      }
    }

    // C. Cookie fallback or default to deccan
    const cookies = parseCookies(req.headers["cookie"]);
    const cookieTenant = cookies["recircuit_tenant"]?.toLowerCase();
    const assetTenant = cookieTenant && UPSTREAMS[cookieTenant] ? cookieTenant : "deccan";
    return {
      recyclerId: assetTenant,
      rewritePath: req.url,
      setCookie: null,
      source: "static-asset",
    };
  }

  // 4. For naked shared APIs without explicit tenant:
  // DO NOT fall back to shared cookie! Direct API calls must specify tenant explicitly.
  if (SHARED_PUBLIC_APIS.has(normPath)) {
    return null;
  }

  // 4. For page navigation or static assets, check cookie as fallback
  const cookies = parseCookies(req.headers["cookie"]);
  const cookieTenant = cookies["recircuit_tenant"]?.toLowerCase();
  if (cookieTenant && UPSTREAMS[cookieTenant]) {
    return {
      recyclerId: cookieTenant,
      rewritePath: req.url,
      setCookie: null,
      source: "cookie",
    };
  }

  // 5. Fail closed
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

  for (const tenant of Object.keys(UPSTREAMS)) {
    if (normPath === `/${tenant}` || normPath.startsWith(`/${tenant}/`)) return true;
  }

  return false;
}

export function createGatewayServer() {
  const activeSockets = new Set();

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

    // 3. /portal/:tenant Route Validation
    const portalValidation = validatePortalRoute(normPath);
    if (portalValidation.isPortal && !portalValidation.valid) {
      clientRes.writeHead(portalValidation.status, { "Content-Type": "application/json" });
      clientRes.end(
        JSON.stringify({
          error: portalValidation.error,
          message: portalValidation.message,
          status: portalValidation.status,
        })
      );
      return;
    }

    // 4. Public Route Allowlist Enforcement
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

    // 5. Deterministic Recycler Routing Resolution
    const routing = resolveTenant(clientReq, normPath, parsedUrl);

    // If conflicting explicit selectors detected -> 400 Bad Request
    if (routing && routing.conflict) {
      clientRes.writeHead(400, { "Content-Type": "application/json" });
      clientRes.end(
        JSON.stringify({
          error: "ConflictingTenantSelectors",
          message: routing.message,
          status: 400,
        })
      );
      return;
    }

    // If ambiguous -> FAIL CLOSED
    if (!routing) {
      clientRes.writeHead(400, { "Content-Type": "application/json" });
      clientRes.end(
        JSON.stringify({
          error: "AmbiguousTenantRouting",
          message:
            "Tenant identity cannot be determined. Request must specify tenant via path prefix (/portal/<tenant>), distinct route, or x-recycler-id header.",
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
    headers["x-recycler-id"] = recyclerId;

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

        // Attach Path-Scoped Set-Cookie
        if (setCookie) {
          const cookieStr = `recircuit_tenant=${setCookie}; Path=/portal/${setCookie}; SameSite=Lax; HttpOnly`;
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
        proxyRes.pipe(clientRes, { end: true });
      }
    );

    proxyReq.on("error", (err) => {
      console.error(`[GATEWAY ERROR] Failed to proxy to ${recyclerId} (${target.port}):`, err.message);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { "Content-Type": "application/json" });
        clientRes.end(
          JSON.stringify({
            error: "Bad Gateway",
            message: `Failed to connect to upstream recycler portal: ${target.name}`,
            status: 502,
          })
        );
      }
    });

    clientReq.pipe(proxyReq, { end: true });
  });

  server.on("connection", (socket) => {
    activeSockets.add(socket);
    socket.on("close", () => activeSockets.delete(socket));
  });

  server.closeGracefully = function () {
    return new Promise((resolve) => {
      server.close(() => resolve());
      for (const socket of activeSockets) {
        socket.destroy();
      }
      activeSockets.clear();
    });
  };

  return server;
}

export function startGateway() {
  const server = createGatewayServer();
  server.listen(GATEWAY_PORT, GATEWAY_HOST, () => {
    console.log("==================================================================");
    console.log(`🔒 ReCircuit Hardened Loopback Gateway Active`);
    console.log(`- Listening strictly on: http://${GATEWAY_HOST}:${GATEWAY_PORT}`);
    console.log(`- Upstreams:`);
    for (const [id, up] of Object.entries(UPSTREAMS)) {
      console.log(`  * ${up.name}: http://${up.host}:${up.port} (/portal/${id}/*)`);
    }
    console.log("==================================================================\n");
  });

  const cleanup = async () => {
    console.log("\n🛑 Stopping Gateway gracefully...");
    await server.closeGracefully();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  return server;
}

if (process.argv[1] && process.argv[1].endsWith("tunnel-gateway.mjs")) {
  startGateway();
}

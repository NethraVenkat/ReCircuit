import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRouteAllowedForRecycler, resolveRecyclerId } from "./lib/config";

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // 1. ADMIN_TOKEN enforcement for /admin, /api/admin, /api/reset
  if (
    pathname === "/admin" ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/reset")
  ) {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken || !adminToken.trim()) {
      return new NextResponse("Admin disabled", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }

  // 2. Production RECYCLER_ID enforcement
  let recyclerId: ReturnType<typeof resolveRecyclerId>;
  try {
    recyclerId = resolveRecyclerId(request.headers.get("host"));
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message === "CONFIGURATION_ERROR_MISSING_RECYCLER_ID"
    ) {
      return new NextResponse(
        "<html><body><h1>500 Server Configuration Error</h1><p>RECYCLER_ID environment variable is required in production.</p></body></html>",
        {
          status: 500,
          headers: { "Content-Type": "text/html" },
        }
      );
    }
    throw err;
  }

  // 3. Cross-recycler route 404 enforcement
  // Only check non-API, non-Next internal paths
  if (
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_next") &&
    !pathname.includes(".")
  ) {
    if (!isRouteAllowedForRecycler(pathname, recyclerId)) {
      return new NextResponse(
        `<html><body><h1>404 Not Found</h1><p>Route ${pathname} does not exist on this recycler portal (${recyclerId}).</p></body></html>`,
        {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and _next internals
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};


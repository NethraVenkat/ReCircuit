import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";
import { resolveRecyclerId } from "@/lib/config";

import { timingSafeEqual } from "crypto";

function safeTokenMatch(provided: string, expected: string): boolean {
  const bufA = Buffer.from(provided);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || !adminToken.trim()) {
    return new NextResponse("Admin disabled", { status: 503, headers: { "Content-Type": "text/plain" } });
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const cookieMatch = cookieHeader.match(/admin_token=([^;]+)/);
  const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

  const adminHeader = request.headers.get("x-admin-token");
  const url = new URL(request.url);
  const tokenQuery = url.searchParams.get("token");

  const candidate = cookieToken || adminHeader || tokenQuery;
  if (!candidate || !safeTokenMatch(candidate, adminToken)) {
    return NextResponse.json({ ok: false, error: "Unauthorized: Invalid or missing admin token" }, { status: 401 });
  }

  const host = request.headers.get("host");
  const recyclerId = url.searchParams.get("all") === "true" ? undefined : resolveRecyclerId(host);

  const repo = getRepository();
  await repo.reset(recyclerId);

  return NextResponse.json({
    ok: true,
    message: recyclerId ? `Reset demo data for recycler: ${recyclerId}` : "Reset all portal demo data",
  });
}


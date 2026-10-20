import { NextResponse } from "next/server";
import { resolveRecyclerId } from "@/lib/config";
import { getStorageType } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
  const host = request.headers.get("host");
  const recycler = resolveRecyclerId(host);
  const storage = getStorageType();

  return NextResponse.json({
    ok: true,
    recycler,
    storage,
  });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Portal configuration error" }, { status: 503 });
  }
}


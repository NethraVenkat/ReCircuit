import { NextResponse } from "next/server";
import { resolveRecyclerId } from "@/lib/config";
import { getStorageType } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const host = request.headers.get("host");
  const recycler = resolveRecyclerId(host);
  const storage = getStorageType();

  return NextResponse.json({
    ok: true,
    recycler,
    storage,
  });
}


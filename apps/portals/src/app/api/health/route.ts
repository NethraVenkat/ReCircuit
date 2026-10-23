import { NextResponse } from "next/server";
import path from "path";
import { resolveRecyclerId } from "@/lib/config";
import { getStorageType, getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const host = request.headers.get("host");
    const recycler = resolveRecyclerId(host);
    const storage = getStorageType();
    if (process.env.NODE_ENV === "production") await getRepository().getFailureSwitches(recycler);
    const storageDir = process.env.STORAGE_DIR
      ? path.resolve(process.env.STORAGE_DIR)
      : path.resolve(process.cwd(), ".data");

    return NextResponse.json({
      ok: true,
      recycler,
      storage,
      ...(process.env.NODE_ENV !== "production" ? { storageDir } : {}),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Portal configuration error" }, { status: 503 });
  }
}

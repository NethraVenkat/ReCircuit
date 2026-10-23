import { NextResponse } from "next/server";
import { getRepository } from "@recircuit/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    try { await getRepository().getRequest("00000000-0000-0000-0000-000000000000"); }
    catch { return NextResponse.json({ ok: false, error: "PERSISTENCE_UNAVAILABLE" }, { status: 503 }); }
  }
  return NextResponse.json({ ok: true, app: "web" });
}

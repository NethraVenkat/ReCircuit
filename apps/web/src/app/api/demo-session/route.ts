import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
export async function GET(request: Request): Promise<NextResponse> {
  const root = process.env.RECIRCUIT_DEMO_ROOT;
  if (process.env.NODE_ENV === "production" || process.env.RECIRCUIT_DEMO_MODE !== "true" || process.env.RECIRCUIT_PERSISTENCE !== "local" || !root || !path.isAbsolute(root) || process.env.RECIRCUIT_DATA_DIR !== path.join(root, "household-app")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const manifest = JSON.parse(await fs.readFile(path.join(root, "demo-manifest.json"), "utf8")) as { kind?: string };
  if (manifest.kind !== "recircuit-fictional-demo-v1") return NextResponse.json({ error: "Demo manifest required" }, { status: 503 });
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set("rc-household", "recircuit-fictional-household-demo-v1", { httpOnly: true, sameSite: "strict", path: "/" });
  return response;
}

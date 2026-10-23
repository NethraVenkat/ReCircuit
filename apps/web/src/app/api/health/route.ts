import { NextResponse } from "next/server";
import { getRepository, cloudRequest } from "@recircuit/db";
import { assertProductionConfiguration } from "../../../lib/production-config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    try {
      assertProductionConfiguration();
      await getRepository().getRequest("00000000-0000-0000-0000-000000000000");
      const bucket = await cloudRequest<{ public: boolean }>("/storage/v1/bucket/recircuit-evidence");
      if (!bucket || bucket.public !== false) throw new Error("PERSISTENCE_UNAVAILABLE: PRIVATE_EVIDENCE_BUCKET_REQUIRED");
    }
    catch (err) { return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "PERSISTENCE_UNAVAILABLE" }, { status: 503 }); }
  }
  return NextResponse.json({ ok: true, app: "web" });
}

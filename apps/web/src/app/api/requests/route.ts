import { NextResponse } from "next/server";
import { getRepository } from "@recircuit/db";
import { owner } from "../../../lib/household";

export const dynamic = "force-dynamic";
export async function GET() {
  const userId = owner();
  const records = userId ? (await getRepository().listRequests()).filter(r => r.request.userId === userId) : [];
  return NextResponse.json({ requests: records.map(r => ({ request: r.request, plan: r.plan, updatedAt: r.updatedAt, customer: r.household?.customer })) }, { headers: { "Cache-Control": "no-store" } });
}

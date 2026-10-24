import { NextResponse } from "next/server";
import { getRepository } from "@recircuit/db";
import { owner, failure } from "../../../lib/household";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
  const userId = await owner();
  const records = userId ? (await getRepository().listRequests(userId)).filter(r => r.request.userId === userId) : [];
  return NextResponse.json({ requests: records.map(r => ({ request: r.request, plan: r.plan, updatedAt: r.updatedAt, customer: r.household?.customer })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) { const f = failure(err); return NextResponse.json(f.body, { status: f.status }); }
}

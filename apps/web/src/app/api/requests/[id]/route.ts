import { NextResponse } from "next/server";
import { getRepository } from "@recircuit/db";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const repo = getRepository();
    const stored = await repo.getRequest(params.id);
    if (!stored) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const audits = await repo.getAudits({ requestId: params.id });

    return NextResponse.json({
      request: stored.request,
      items: stored.items,
      plan: stored.plan,
      approval: stored.approval,
      auditEvents: audits,
      updatedAt: stored.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

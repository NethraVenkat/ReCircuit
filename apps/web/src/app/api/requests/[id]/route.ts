import { NextResponse } from "next/server";
import { getRepository } from "@recircuit/db";
import { owned, failure } from "../../../../lib/household";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const repo = getRepository();
    const stored = await owned(params.id);
    if (!stored) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const audits = await repo.getAudits({ requestId: params.id });

    return NextResponse.json({
      household: stored.household,
      request: stored.request,
      items: stored.items,
      plan: stored.plan,
      approval: stored.approval,
      auditEvents: [...stored.auditEvents, ...audits].map(e => ({ id: e.id, previousState: e.previousState, newState: e.newState, observedAt: e.observedAt, legId: e.legId })),
      updatedAt: stored.updatedAt,
    });
  } catch (err) {
    const f = failure(err); return NextResponse.json(f.body, { status: f.status });
  }
}

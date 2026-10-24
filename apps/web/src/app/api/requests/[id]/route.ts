import { NextResponse } from "next/server";
import { getRepository } from "@recircuit/db";
import { owned, failure } from "../../../../lib/household";
import { storedPolicyMetadata } from "../../../../lib/policy-presentation";
import { sampleBookingStatuses } from "../../../../lib/sample-booking-status";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const repo = getRepository();
    const stored = await owned(id);
    if (!stored) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const audits = await repo.getAudits({ requestId: id });
    const statuses = await sampleBookingStatuses([stored]);

    return NextResponse.json({
      household: storedPolicyMetadata({ ...stored.household, bookingStatus: statuses.get(id) }),
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

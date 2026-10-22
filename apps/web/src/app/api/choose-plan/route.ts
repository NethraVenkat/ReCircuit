import { NextResponse } from "next/server";
import { z } from "zod";
import { requestApproval, type PlanScored } from "@recircuit/core";
import { getRepository } from "@recircuit/db";
import { owned, locked, sameOrigin, failure } from "../../../lib/household";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = z.object({ requestId: z.string().uuid(), planHash: z.string(), planId: z.string() }).parse(await req.json());
    return await locked(body.requestId, async () => {
      const stored = await owned(body.requestId);
      if (stored.request.state !== "AWAITING_APPROVAL") throw new Error("Choose a plan before approving or starting booking");
      if (stored.plan?.planHash !== body.planHash) throw new Error("STALE: Reload the current plan before choosing another");
      const choices = stored.household?.choices as PlanScored[] | undefined;
      const choice = choices?.find(c => c.plan.id === body.planId);
      if (!choice) throw new Error("This alternative is unavailable");
      const result = requestApproval({ request: { ...stored.request, state: "PLAN_CREATED" }, plan: choice.plan, slotPreference: stored.plan.slotPreference, approvalReasons: choice.approvalReasons, isPartial: choice.isPartial, unroutedItems: choice.unroutedItemIds.map(id => ({ description: stored.items.find(i => i.id === id)?.description || id, reasons: "Not included in this allocation" })) });
      await getRepository().saveRequest({ ...stored, request: result.request, plan: result.plan, approval: null, household: { ...stored.household, approvalCard: result.card }, updatedAt: new Date().toISOString() });
      return NextResponse.json({ success: true, plan: result.plan });
    });
  } catch (err) { const f = failure(err); return NextResponse.json(f.body, { status: f.status }); }
}

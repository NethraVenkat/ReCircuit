import { NextResponse } from "next/server";
import { recordDecision, hashPlan, type DecisionRecord } from "@recircuit/core";
import { getRepository } from "@recircuit/db";
import { z } from "zod";
import { owned, locked, failure, sameOrigin } from "../../../lib/household";
import { assertExecutionEvidence } from "../../../lib/execution-policy";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = z.object({
      requestId: z.string().uuid(),
      planHash: z.string(),
      decision: z.enum(["approve", "approved", "reject", "rejected"]),
      dataWipeConfirmed: z.boolean().optional(),
      reason: z.string().max(500).optional(),
    }).parse(await req.json());
    return await locked(body.requestId, async () => {
      const stored = await owned(body.requestId);
      if (!stored.plan) throw new Error("No plan available");
      if (body.planHash !== hashPlan(stored.plan)) {
        throw new Error(`Stale approval rejected: plan has changed. Expected hash ${stored.plan.planHash}, got ${body.planHash}`);
      }
      const decision = body.decision.startsWith("approve") ? "approved" : "rejected";
      if (decision === "approved") assertExecutionEvidence(stored.plan, stored.household);
      if (decision === "approved" && !stored.plan.legs.length) throw new Error("No eligible pickup is available to approve. Edit your items or location first.");
      if (stored.request.state === "APPROVED" && decision === "approved") {
        return NextResponse.json({ success: true, request: stored.request, plan: stored.plan });
      }
      const result = recordDecision({
        request: stored.request,
        plan: stored.plan,
        decision,
        decidedBy: stored.request.userId,
        dataWipeConfirmedByUser: body.dataWipeConfirmed,
        reason: body.reason,
        priorDecision: stored.approval as DecisionRecord | null,
      });
      await getRepository().saveRequest({
        ...stored,
        request: result.request,
        plan: result.plan,
        approval: result.decisionRecord,
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, decision, request: result.request, plan: result.plan });
    });
  } catch (err) {
    const f = failure(err);
    return NextResponse.json(f.body, { status: f.status });
  }
}

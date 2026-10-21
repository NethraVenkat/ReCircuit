import { NextResponse } from "next/server";
import { recordDecision, hashPlan } from "@recircuit/core";
import { getRepository } from "@recircuit/db";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      requestId?: string;
      planHash?: string;
      decision?: "approve" | "approved" | "reject" | "rejected";
      reason?: string;
      slotPreference?: { day: string; window: "morning" | "afternoon" | "any" };
      dataWipeConfirmed?: boolean;
    };

    if (!body.requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    const repo = getRepository();
    const stored = await repo.getRequest(body.requestId);
    if (!stored || !stored.plan) {
      return NextResponse.json({ error: "Request or plan not found" }, { status: 404 });
    }

    if (body.decision === "reject" || body.decision === "rejected") {
      const result = recordDecision({
        request: stored.request,
        plan: stored.plan,
        decision: "rejected",
        decidedBy: "household-user",
        reason: body.reason || "Rejected by user",
      });

      await repo.saveRequest({
        ...stored,
        request: result.request,
        approval: result.decisionRecord as any,
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        decision: "rejected",
        request: result.request,
        plan: result.plan,
      });
    }

    // Default: Approve
    if (!body.planHash) {
      return NextResponse.json({ error: "planHash is required for approval" }, { status: 400 });
    }

    // Guard against stale approvals
    const currentHash = hashPlan(stored.plan);
    if (body.planHash !== currentHash && body.planHash !== stored.plan.planHash) {
      return NextResponse.json(
        { error: `Stale approval rejected: plan has changed. Expected hash ${stored.plan.planHash}, got ${body.planHash}` },
        { status: 400 }
      );
    }

    const approvalResult = recordDecision({
      request: stored.request,
      plan: stored.plan,
      decision: "approved",
      decidedBy: "household-user",
      dataWipeConfirmedByUser: body.dataWipeConfirmed,
    });

    await repo.saveRequest({
      ...stored,
      request: approvalResult.request,
      plan: approvalResult.plan,
      approval: approvalResult.decisionRecord as any,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      decision: "approved",
      request: approvalResult.request,
      plan: approvalResult.plan,
      legs: approvalResult.legs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

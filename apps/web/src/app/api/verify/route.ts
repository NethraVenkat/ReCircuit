import { NextResponse } from "next/server";
import { VerificationRunner } from "@recircuit/worker";
import { getRepository } from "@recircuit/db";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      requestId?: string;
      legId?: string;
    };

    if (!body.requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    const repo = getRepository();
    const stored = await repo.getRequest(body.requestId);
    if (!stored || !stored.plan) {
      return NextResponse.json({ error: "Request or plan not found" }, { status: 404 });
    }

    const leg = body.legId
      ? stored.plan.legs.find((l) => l.id === body.legId)
      : stored.plan.legs.find((l) => l.state === "REQUEST_SUBMITTED");

    if (!leg) {
      return NextResponse.json({ error: "No submittted leg found to verify" }, { status: 404 });
    }

    const verificationResult = await VerificationRunner.verifyLegWithAudit({
      leg,
      plan: stored.plan,
    });

    leg.verifyingSessionId = verificationResult.verifyingSessionId;

    await repo.saveRequest({
      ...stored,
      plan: stored.plan,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      legId: leg.id,
      verification: verificationResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

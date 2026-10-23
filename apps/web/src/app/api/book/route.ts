import { NextResponse } from "next/server";
import { BookingRunner } from "@recircuit/worker";
import { hashPlan, type DecisionRecord } from "@recircuit/core";
import { getRepository } from "@recircuit/db";
import { z } from "zod";
import { owned, locked, sameOrigin, failure, customerSchema } from "../../../lib/household";
import { assertExecutionEvidence } from "../../../lib/execution-policy";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = z.object({ requestId: z.string().uuid(), planHash: z.string().optional() }).parse(await req.json());
    return await locked(body.requestId, async () => {
      const stored = await owned(body.requestId);
      const plan = stored.plan;
      const approval = stored.approval as DecisionRecord | null;
      if (!plan || stored.request.state !== "APPROVED" || approval?.decision !== "approved") {
        throw new Error(`Cannot book plan: request must be APPROVED (current state: ${stored?.request?.state || "UNKNOWN"}). Approve the current plan before booking.`);
      }
      if ((body.planHash && body.planHash !== hashPlan(plan)) || approval.planHash !== hashPlan(plan)) {
        throw new Error("STALE: Approval no longer matches this plan. Review again.");
      }
      if (!plan.legs || plan.legs.length === 0) {
        throw new Error("Cannot book plan: plan has no eligible pickup legs to book.");
      }
      const household = stored.household as Record<string, unknown> | undefined;
      const policies = Array.isArray(household?.policies) ? (household?.policies as Array<{ provenance?: string }>) : [];
      if (household?.policyMode === "fixture" || policies.some((p) => p.provenance === "fixture")) {
        throw new Error("Cannot book plan: request was generated using fixture/example policies. Live booking requires verified live policy retrieval.");
      }
      const customer = customerSchema.parse(stored.household?.customer);
      assertExecutionEvidence(plan, stored.household);
      const repo = getRepository();
      for (const leg of plan.legs) {
        if (leg.state !== "APPROVED") continue;
        leg.state = "SUBMITTING";
        leg.updatedAt = new Date().toISOString();
        await repo.saveRequest({ ...stored, plan, updatedAt: leg.updatedAt });
        try {
          const result = await BookingRunner.bookLegWithTransitions({ leg, plan, request: stored.request, approval, customer, items: leg.items || [], dataWipeAck: plan.dataWipeConfirmedByUser }, { headless: true });
          Object.assign(leg, result.updatedLeg);
          stored.auditEvents.push(...result.auditEvents.map(e => ({ ...e, requestId: stored.request.id })));
          if (result.result.needsHuman) stored.household = { ...stored.household, handoff: "Human verification is required. This household interface cannot resume the worker browser session. No automatic retry was submitted." };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error("[API/BOOK ERROR]", err);
          stored.household = { ...stored.household, bookingError: `Booking could not be confirmed (${errMsg}). Refresh to inspect the saved state; do not submit a new request until the outcome is reconciled.` };
          throw err;
        } finally { await repo.saveRequest({ ...stored, plan, updatedAt: new Date().toISOString() }); }
      }
      return NextResponse.json({ success: true, plan });
    });
  } catch (err) { const f = failure(err); return NextResponse.json(f.body, { status: f.status }); }
}

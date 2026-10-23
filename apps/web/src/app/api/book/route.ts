import { NextResponse } from "next/server";
import { BookingRunner, openSession, HumanVerificationService, getPortalBaseUrl } from "@recircuit/worker";
import { hashPlan, type DecisionRecord } from "@recircuit/core";
import { getRepository } from "@recircuit/db";
import { z } from "zod";
import { owned, locked, sameOrigin, failure, customerSchema } from "../../../lib/household";
import { assertExecutionEvidence } from "../../../lib/execution-policy";
import { assertProductionConfiguration } from "../../../lib/production-config";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    assertProductionConfiguration();
    const body = z.object({ requestId: z.string().uuid(), planHash: z.string().optional(), legId: z.string().optional(), humanCode: z.string().trim().regex(/^[a-zA-Z0-9]{5}$/).optional() }).parse(await req.json());
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
      const persist = async () => { stored.updatedAt = new Date().toISOString(); await repo.saveRequest(stored); };
      for (const leg of plan.legs) {
        const resuming = leg.state === "NEEDS_HUMAN" && body.legId === leg.id && Boolean(body.humanCode);
        if (leg.state !== "APPROVED" && !resuming) continue;
        if (body.legId && body.legId !== leg.id) continue;
        const handoffs = (stored.household?.humanHandoffs || {}) as Record<string, { sessionId: string; expiresAt: string; screenshotRef: string }>;
        const handoff = handoffs[leg.id];
        if (resuming && (!handoff || !Number.isFinite(Date.parse(handoff.expiresAt)) || Date.parse(handoff.expiresAt) <= Date.now())) throw new Error("STALE: Human verification session expired. No automatic resubmission is allowed; reconcile this pickup before retrying.");
        leg.state = "SUBMITTING";
        leg.updatedAt = new Date().toISOString();
        await persist();
        try {
          const context = { leg, plan, request: stored.request, approval, customer, items: leg.items || [], dataWipeAck: plan.dataWipeConfirmedByUser };
          const session = resuming ? await openSession({ mode: "browserbase", resumeSessionId: handoff!.sessionId }) : undefined;
          let result;
          if (session) {
            try {
              if (new URL(session.page.url()).origin !== new URL(getPortalBaseUrl(leg.recyclerId)).origin) throw new Error("Human session does not match the approved recycler.");
              await HumanVerificationService.submitVerificationCode(session.page, body.humanCode!);
              result = await BookingRunner.resumeInSession(context, session, { headless: true });
            } finally { await session.close(); }
          } else result = await BookingRunner.bookLegWithTransitions(context, { headless: true, keepSessionOpenOnNeedsHuman: process.env.NODE_ENV === "production" });
          Object.assign(leg, result.updatedLeg);
          stored.auditEvents.push(...result.auditEvents.map(e => ({ ...e, requestId: stored.request.id })));
          if (result.result.needsHuman && result.result.humanVerification && result.result.session?.mode === "browserbase") {
            handoffs[leg.id] = { sessionId: result.result.sessionId, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), screenshotRef: result.result.humanVerification.screenshotRef };
            stored.household = { ...stored.household, humanHandoffs: handoffs };
            // Save before disconnecting; the later invocation needs no process memory.
            try { await persist(); }
            catch (err) { await result.result.session.close(); throw err; }
            await result.result.session.disconnect!();
          } else if (result.result.success) {
            delete handoffs[leg.id];
            stored.household = { ...stored.household, humanHandoffs: handoffs, bookingError: undefined };
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          stored.household = { ...stored.household, bookingError: `Booking could not be confirmed (${errMsg}). Refresh to inspect the saved state; do not submit a new request until the outcome is reconciled.` };
          throw err;
        } finally { await persist(); }
        // Bound each invocation. The next leg requires another explicit click.
        break;
      }
      return NextResponse.json({ success: true, plan });
    });
  } catch (err) { const f = failure(err); return NextResponse.json(f.body, { status: f.status }); }
}

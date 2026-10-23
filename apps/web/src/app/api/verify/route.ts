import { NextResponse } from "next/server";
import { assertProductionConfiguration } from "../../../lib/production-config";

export const maxDuration = 300;
import { VerificationRunner } from "@recircuit/worker";
import { getRepository } from "@recircuit/db";
import { z } from "zod";
import { owned, locked, sameOrigin, failure } from "../../../lib/household";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    assertProductionConfiguration();
    const body = z.object({ requestId: z.string().uuid(), legId: z.string() }).parse(await req.json());
    return await locked(body.requestId, async () => {
      const stored = await owned(body.requestId);
      const leg = stored.plan?.legs.find(l => l.id === body.legId);
      if (!leg || !stored.plan || !["REQUEST_SUBMITTED", "REQUEST_CONFIRMED"].includes(leg.state)) throw new Error("No submitted leg available to verify");
      try {
        const result = await VerificationRunner.verifyLegWithAudit({ leg, plan: stored.plan });
        leg.verifyingSessionId = result.verifyingSessionId;
        if (result.auditEvent) stored.auditEvents.push({ ...result.auditEvent, requestId: stored.request.id });
        const verification = { verified: result.verified, bookingReference: result.bookingReference, observedStatus: result.observedStatus, observedItems: result.observedItems, observedFeeText: result.observedFeeText, isUncertain: result.isUncertain, verificationQuality: result.verificationQuality, checkedAt: new Date().toISOString(), error: result.error, independent: result.verifyingSessionId !== result.submittingSessionId };
        stored.household = { ...stored.household, verifications: { ...(stored.household?.verifications as object || {}), [leg.id]: verification } };
        await getRepository().saveRequest({ ...stored, updatedAt: new Date().toISOString() });
        return NextResponse.json({ success: true, legId: leg.id, verification });
      } catch (err) {
        stored.household = { ...stored.household, verificationError: "Independent verification did not complete. No match is claimed. Check the recycler record before taking further action." };
        await getRepository().saveRequest({ ...stored, updatedAt: new Date().toISOString() });
        throw err;
      }
    });
  } catch (err) { const f = failure(err); return NextResponse.json(f.body, { status: f.status }); }
}

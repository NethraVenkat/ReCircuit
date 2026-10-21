import { NextResponse } from "next/server";
import {
  parseIntake,
  buildEligibilityMatrix,
  generateRoutingPlans,
  DECCAN_EXTRACTION,
  PAPERPLUS_EXTRACTION,
  QUICKSCRAP_EXTRACTION,
  transitionState,
  createDomainRequestFromIntake,
  requestApproval,
  DEFAULT_SLOT_PREFERENCE,
  type ExtractedPolicy,
} from "@recircuit/core";
import { getRepository } from "@recircuit/db";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      text?: string;
      feeCapInr?: number;
      slotDay?: string;
      slotWindow?: "morning" | "afternoon" | "any";
      customer?: {
        fullName?: string;
        phone?: string;
        addressLine?: string;
        locality?: string;
        pincode?: string;
      };
    };

    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Intake text is required" }, { status: 400 });
    }

    // 1. Stage 3 Intake Parsing
    const intakeResult = await parseIntake(text);
    const domainRequest = createDomainRequestFromIntake(intakeResult);
    if (body.feeCapInr != null && !isNaN(body.feeCapInr)) {
      domainRequest.feeCapInr = body.feeCapInr;
    }

    // 2. Recycler Policies
    const policies: ExtractedPolicy[] = [
      {
        ...DECCAN_EXTRACTION,
        recyclerId: "deccan",
        companyName: "Deccan E-Cycle Solutions",
        status: "SUCCESS",
        feesUnknown: false,
        evidence: {
          url: "http://localhost:3101",
          textHash: "deccan-hash",
          screenshotPath: ".data/evidence/deccan-policy.png",
          extractedAt: new Date().toISOString(),
          sessionId: "local-deccan-web",
          extractionPath: "generic-ai",
        },
        acceptedCategories: ["laptop", "desktop", "mobile_phone", "charger_cable", "battery_household", "small_electronics"],
        rejectedCategories: ["newspaper", "cardboard", "plastic", "glass"],
        freeThresholdKg: 5,
        underWeightFeeInr: 180,
        minWeightKg: null,
        requiresDataWipeAck: true,
        quotes: ["Under 5 kg total weight: ₹180 standard pickup charge"],
        rates: [],
      },
      {
        ...PAPERPLUS_EXTRACTION,
        recyclerId: "paperplus",
        companyName: "PaperPlus Kabadi",
        status: "SUCCESS",
        feesUnknown: false,
        evidence: {
          url: "http://localhost:3102",
          textHash: "paperplus-hash",
          screenshotPath: ".data/evidence/paperplus-policy.png",
          extractedAt: new Date().toISOString(),
          sessionId: "local-paperplus-web",
          extractionPath: "generic-ai",
        },
        acceptedCategories: ["newspaper", "cardboard", "plastic", "glass", "textiles"],
        rejectedCategories: ["laptop", "desktop", "mobile_phone", "battery_household", "charger_cable"],
        freeThresholdKg: null,
        underWeightFeeInr: 0,
        minWeightKg: null,
        requiresDataWipeAck: false,
        quotes: ["Free doorstep collection for dry recyclables across Hyderabad"],
        rates: [],
      },
      {
        ...QUICKSCRAP_EXTRACTION,
        recyclerId: "quickscrap",
        companyName: "QuickScrap Hyd",
        status: "SUCCESS",
        feesUnknown: true,
        evidence: {
          url: "http://localhost:3103",
          textHash: "quickscrap-hash",
          screenshotPath: ".data/evidence/quickscrap-policy.png",
          extractedAt: new Date().toISOString(),
          sessionId: "local-quickscrap-web",
          extractionPath: "generic-ai",
        },
        acceptedCategories: ["small_electronics", "desktop", "newspaper", "cardboard"],
        rejectedCategories: ["battery_household"],
        freeThresholdKg: null,
        underWeightFeeInr: 0,
        minWeightKg: 10,
        requiresDataWipeAck: false,
        quotes: ["10 kg minimum consignment weight strictly enforced"],
        rates: [],
      },
    ];

    // 3. State Transitions: advance pipeline to POLICIES_READ then ELIGIBILITY_CHECKED
    const reqWithPolicies = { ...domainRequest, state: "POLICIES_READ" as const };
    const step1 = transitionState(reqWithPolicies, "ELIGIBILITY_CHECKED", {
      matrixHash: "audit-matrix-hash",
      checkedAt: new Date().toISOString(),
    }).newRequest!;

    // 4. Matrix & Deterministic Routing
    const matrix = buildEligibilityMatrix({
      requestId: step1.id,
      items: intakeResult.items,
      policies,
    });
    const routing = generateRoutingPlans({
      request: {
        id: step1.id,
        feeCapInr: domainRequest.feeCapInr,
      },
      items: intakeResult.items,
      policies,
    });

    const bestScored = routing.scoredPlans[0];
    if (!bestScored) {
      return NextResponse.json({ error: "No routing plan could be generated" }, { status: 500 });
    }

    const bestPlan = bestScored.plan;
    bestPlan.requestId = step1.id;

    const step2 = transitionState(step1, "PLAN_CREATED", {
      planId: bestPlan.id,
      planHash: bestPlan.planHash,
      approvalReason: bestScored.approvalReasons.join(",") || "NONE",
    }).newRequest!;

    const approvalReasons = bestScored.approvalReasons;
    const alternativesSummary = routing.scoredPlans.slice(1).map((alt, idx) => ({
      rank: idx + 2,
      planId: alt.plan.id,
      legsCount: alt.legsCount,
      fee: alt.totalFee,
      payout: alt.totalKnownPayout,
      net: alt.netPayout,
      recyclers: alt.plan.legs.map((l) => l.recyclerId),
    }));

    const unrouted = bestScored.unroutedItemIds.map((unId) => {
      const itm = intakeResult.items.find((i) => i.id === unId);
      const desc = itm ? `${itm.rawText} (${itm.category})` : unId;
      const reasons = matrix.cells
        .filter((c) => c.itemId === unId)
        .map((c) => `${c.recyclerName}: ${c.status}${c.reason ? ` (${c.reason})` : ""}`)
        .join("; ");
      return { description: desc, reasons };
    });

    const slotPref = {
      day: body.slotDay || DEFAULT_SLOT_PREFERENCE.day,
      window: body.slotWindow || DEFAULT_SLOT_PREFERENCE.window,
    };

    const { request: awaitingReq, plan: readyPlan, card: approvalCard } = requestApproval({
      request: step2,
      plan: bestPlan,
      slotPreference: slotPref,
      approvalReasons,
      isPartial: bestScored.isPartial,
      unroutedItems: unrouted,
      alternatives: alternativesSummary,
    });

    // 5. Persist to repository
    const repo = getRepository();
    await repo.saveRequest({
      request: awaitingReq,
      items: intakeResult.items.map((i) => ({
        id: i.id,
        requestId: awaitingReq.id,
        description: i.rawText,
        category: (i.category.toUpperCase() as any),
        quantity: i.quantity,
        estimatedWeightKg: i.declaredWeightKg ?? i.estimatedWeightKg ?? 1.0,
        confidence: 0.95,
        hazardClass: (i.hazardClass.toUpperCase() as any),
        createdAt: new Date().toISOString(),
      })),
      plan: readyPlan,
      auditEvents: [],
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      requestId: awaitingReq.id,
      request: awaitingReq,
      plan: readyPlan,
      approvalCard,
      matrix,
      scoredPlans: routing.scoredPlans,
      intakeResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

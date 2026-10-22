import { NextResponse } from "next/server";
import {
  parseIntake,
  buildEligibilityMatrix,
  generateRoutingPlans,
  ExtractedPolicySchema,
  transitionState,
  createDomainRequestFromIntake,
  requestApproval,
  DEFAULT_SLOT_PREFERENCE,
  type ExtractedPolicy,
  ValidatedIntakeResultSchema,
  IntakeItemSchema,
  taxonomyCategoryToItemCategory,
} from "@recircuit/core";
import { getRepository } from "@recircuit/db";
import { openSession, readRecyclerPolicy } from "@recircuit/worker";
import { z } from "zod";
import { customerSchema, owner, sameOrigin, failure, owned, locked } from "../../../lib/household";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = z.object({
      requestId: z.string().uuid().optional(),
      expectedHash: z.string().optional(),
      text: z.string().max(10000).default("Structured household intake"),
      items: z.array(IntakeItemSchema).min(1).max(20).optional(),
      feeCapInr: z.number().int().nonnegative().optional(),
      slotDay: z.string().min(1).max(50).default("earliest"),
      slotWindow: z.enum(["morning", "afternoon", "any"]).default("any"),
      customer: customerSchema.optional().default({
        fullName: "Household Resident",
        phone: "9876543210",
        addressLine: "Flat 101, Green Meadows",
        locality: "Madhapur",
        pincode: "500081",
      }),
    }).parse(await req.json());
    const text = body.text.trim();
    const intakeResult = body.items ? ValidatedIntakeResultSchema.parse({
      requestId: crypto.randomUUID(), state: "ITEMS_PARSED",
      location: { rawText: body.customer.locality, locality: body.customer.locality, pincode: body.customer.pincode, city: "Hyderabad", confidence: 1 },
      feeCapInr: body.feeCapInr ?? null, items: body.items, clarifications: [],
    }) : await parseIntake(text);
    if (new Set(intakeResult.items.map(i => i.id)).size !== intakeResult.items.length) throw new Error("Item identities must be unique");
    if (body.requestId) intakeResult.requestId = body.requestId;
    const domainRequest = createDomainRequestFromIntake(intakeResult);
    domainRequest.userId = owner(true)!;
    domainRequest.description = text;
    if (body.feeCapInr !== undefined) domainRequest.feeCapInr = body.feeCapInr;

    // 2. Recycler Policies
    if (body.requestId) await owned(body.requestId);
    const sources = [
      { id: "deccan", name: "Deccan E-Cycle Solutions", url: "http://localhost:3101" },
      { id: "paperplus", name: "PaperPlus Kabadi", url: "http://localhost:3102" },
      { id: "quickscrap", name: "QuickScrap Hyd", url: "http://localhost:3103" },
    ];
    const policies: ExtractedPolicy[] = await Promise.all(sources.map(async source => {
      const session = await openSession({ mode: "local", recyclerId: source.id, headless: true });
      try { return { ...await readRecyclerPolicy(source.id, session, source.url), companyName: source.name }; }
      catch { return ExtractedPolicySchema.parse({ recyclerId: source.id, companyName: source.name, status: "FAILED", feesUnknown: true, failureReason: "Policy source unavailable", evidence: { url: source.url, textHash: "", screenshotPath: "", extractedAt: new Date().toISOString(), sessionId: session.sessionId, extractionPath: "generic-ai" } }); }
      finally { await session.close(); }
    }));

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
      requestPincode: body.customer.pincode,
    });
    const routing = generateRoutingPlans({
      request: {
        id: step1.id,
        feeCapInr: domainRequest.feeCapInr,
        pincode: body.customer.pincode,
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
    const save = async () => {
    if (body.requestId) {
      const previous = await owned(body.requestId);
      if (previous.plan?.planHash !== body.expectedHash) throw new Error("STALE: Plan changed. Reload before editing.");
      if (previous.plan?.legs.some(l => !["APPROVED", "REJECTED"].includes(l.state))) throw new Error("Booking has started; items cannot be edited safely.");
    }
    await repo.saveRequest({
      request: awaitingReq,
      items: intakeResult.items.map((i) => ({
        id: i.id,
        requestId: awaitingReq.id,
        description: i.rawText,
        category: taxonomyCategoryToItemCategory(i.category),
        quantity: i.quantity,
        estimatedWeightKg: i.declaredWeightKg ?? i.estimatedWeightKg ?? 0,
        confidence: i.confidence,
        hazardClass: (i.hazardClass.startsWith("battery") ? "BATTERY" : "NON_HAZARDOUS") as "BATTERY" | "NON_HAZARDOUS",
        createdAt: new Date().toISOString(),
      })),
      plan: readyPlan,
      approval: null,
      household: { customer: body.customer, intakeResult, matrix, approvalCard, choices: routing.scoredPlans.slice(0,5),
        policyMode: "live", policies: policies.map(p => ({ name: p.companyName, url: p.evidence.url, quotes: p.quotes, status: p.status, retrievedAt: p.evidence.extractedAt, extractionPath: p.evidence.extractionPath })),
      },
      auditEvents: [],
      updatedAt: new Date().toISOString(),
    });

    };
    if (body.requestId) await locked(body.requestId, save); else await save();

    return NextResponse.json({
      requestId: awaitingReq.id,
      request: awaitingReq,
      plan: readyPlan,
      approvalCard,
      matrix,
      scoredPlans: routing.scoredPlans,
      intakeResult,
      policyMode: "live",
    });
  } catch (err) {
    const f = failure(err);
    return NextResponse.json(f.body, { status: f.status });
  }
}

import { NextResponse } from "next/server";
import {
  parseIntake,
  buildEligibilityMatrix,
  generateRoutingPlans,
  transitionState,
  createDomainRequestFromIntake,
  requestApproval,
  DEFAULT_SLOT_PREFERENCE,
  type ExtractedPolicy,
  type Plan,
  type ApprovalReason,
  ValidatedIntakeResultSchema,
  IntakeItemSchema,
  taxonomyCategoryToItemCategory,
  hashPlan,
} from "@recircuit/core";
import { getRepository } from "@recircuit/db";
import { openSession, readRecyclerPolicy } from "@recircuit/worker";
import { z } from "zod";
import { customerSchema, owner, sameOrigin, failure, owned, locked } from "../../../lib/household";
import { resolveRecyclerPolicy, type PolicySource, type PolicyMetadata } from "../../../lib/policy-cache";
import { assertProductionConfiguration } from "../../../lib/production-config";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    assertProductionConfiguration();
    const repo = getRepository();
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
      mode: z.enum(["live", "fixture", "example"]).optional(),
      policyMode: z.enum(["live", "fixture"]).optional(),
      forceRefresh: z.boolean().optional(),
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
    domainRequest.userId = (await owner(true))!;
    domainRequest.description = text;
    if (body.feeCapInr !== undefined) domainRequest.feeCapInr = body.feeCapInr;

    // 2. Recycler Policies - Resolved with provenance tracking and strict fixture isolation
    if (body.requestId) await owned(body.requestId);
    const sources: PolicySource[] = [
      { id: "deccan", name: "Deccan E-Cycle Solutions", url: process.env.PORTAL_DECCAN_URL || "http://127.0.0.1:3101" },
      { id: "paperplus", name: "PaperPlus Kabadi", url: process.env.PORTAL_PAPERPLUS_URL || "http://127.0.0.1:3102" },
      { id: "quickscrap", name: "QuickScrap Hyd", url: process.env.PORTAL_QUICKSCRAP_URL || "http://127.0.0.1:3103" },
    ];

    const resolutionResults = await Promise.all(
      sources.map((source) =>
        resolveRecyclerPolicy({
          source,
          mode: body.mode,
          policyMode: body.policyMode,
          forceRefresh: body.forceRefresh,
          fetchLive: async (src) => {
            const session = await openSession({ recyclerId: src.id, headless: true });
            try {
              const policy: ExtractedPolicy = {
                ...(await readRecyclerPolicy(src.id, session, src.url)),
                companyName: src.name,
              };
              return policy;
            } finally {
              await session.close();
            }
          },
        })
      )
    );

    const policies: ExtractedPolicy[] = resolutionResults.map((r) => r.policy);
    const policyMetas: PolicyMetadata[] = resolutionResults.map((r) => r.meta);
    const effectivePolicyMode = policyMetas.some((m) => m.provenance === "fixture") ? "fixture" : "live";

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
    let bestPlan: Plan;
    let approvalReasons: ApprovalReason[] = [];
    let isPartial = true;
    let alternativesSummary: Array<{
      rank: number;
      planId: string;
      legsCount: number;
      fee: number;
      payout: number;
      net: number;
      recyclers: string[];
    }> = [];
    let unrouted: Array<{ description: string; reasons: string }>;

    if (!bestScored) {
      const planId = crypto.randomUUID();
      const nowStr = new Date().toISOString();
      const emptyPlan: Plan = {
        id: planId,
        requestId: step1.id,
        legs: [],
        totalEstimatedFee: 0,
        totalEstimatedPayout: 0,
        planHash: "",
        createdAt: nowStr,
      };
      emptyPlan.planHash = hashPlan(emptyPlan);
      bestPlan = emptyPlan;
      approvalReasons = ["BOOKING_SUBMISSION"];
      isPartial = true;
      unrouted = intakeResult.items.map((itm) => {
        const desc = `${itm.rawText} (${itm.category})`;
        const reasons = matrix.cells
          .filter((c) => c.itemId === itm.id)
          .map((c) => `${c.recyclerName}: ${c.status}${c.reason ? ` (${c.reason})` : ""}`)
          .join("; ");
        return { description: desc, reasons: reasons || "Policy source unavailable or item unserviceable" };
      });
    } else {
      bestPlan = bestScored.plan;
      bestPlan.requestId = step1.id;
      approvalReasons = bestScored.approvalReasons;
      isPartial = bestScored.isPartial;
      alternativesSummary = routing.scoredPlans.slice(1).map((alt, idx) => ({
        rank: idx + 2,
        planId: alt.plan.id,
        legsCount: alt.legsCount,
        fee: alt.totalFee,
        payout: alt.totalKnownPayout,
        net: alt.netPayout,
        recyclers: alt.plan.legs.map((l) => l.recyclerId),
      }));
      unrouted = bestScored.unroutedItemIds.map((unId) => {
        const itm = intakeResult.items.find((i) => i.id === unId);
        const desc = itm ? `${itm.rawText} (${itm.category})` : unId;
        const reasons = matrix.cells
          .filter((c) => c.itemId === unId)
          .map((c) => `${c.recyclerName}: ${c.status}${c.reason ? ` (${c.reason})` : ""}`)
          .join("; ");
        return { description: desc, reasons };
      });
    }

    const step2 = transitionState(step1, "PLAN_CREATED", {
      planId: bestPlan.id,
      planHash: bestPlan.planHash,
      approvalReason: approvalReasons.join(",") || "NONE",
    }).newRequest!;

    const slotPref = {
      day: body.slotDay || DEFAULT_SLOT_PREFERENCE.day,
      window: body.slotWindow || DEFAULT_SLOT_PREFERENCE.window,
    };

    const { request: awaitingReq, plan: readyPlan, card: approvalCard } = requestApproval({
      request: step2,
      plan: bestPlan,
      slotPreference: slotPref,
      approvalReasons,
      isPartial,
      unroutedItems: unrouted,
      alternatives: alternativesSummary,
    });

    // 5. Persist to repository
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
        household: {
          customer: body.customer,
          intakeResult,
          matrix,
          approvalCard,
          choices: routing.scoredPlans.slice(0, 5),
          policyMode: effectivePolicyMode,
          policies: policyMetas,
          policySources: policies,
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
      policyMode: effectivePolicyMode,
      policies: policyMetas,
    });
  } catch (err) {
    const f = failure(err);
    return NextResponse.json(f.body, { status: f.status });
  }
}

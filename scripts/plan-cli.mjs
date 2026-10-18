#!/usr/bin/env node
/**
 * scripts/plan-cli.mjs
 *
 * CLI runner for ReCircuit End-to-End Planning & Split Routing:
 * Intake -> Discover Recyclers -> Read Policies -> Check Eligibility -> Create Plan
 *
 * Usage:
 *   npm run plan -- "<user recycling request sentence>"
 */

import fs from "fs";
import path from "path";
import {
  parseIntake,
  buildEligibilityMatrix,
  generateRoutingPlans,
  DECCAN_EXTRACTION,
  PAPERPLUS_EXTRACTION,
  QUICKSCRAP_EXTRACTION,
  transitionState,
  createDomainRequestFromIntake,
  explainWhyPlanBeats,
  requestApproval,
  formatApprovalCard,
  DEFAULT_SLOT_PREFERENCE,
} from "@recircuit/core";

async function main() {
  const args = process.argv.slice(2);
  const text = args.join(" ").trim();

  if (!text) {
    console.error(`Usage: npm run plan -- "<user recycling request sentence>"`);
    process.exit(1);
  }

  console.log(`\n================================================================`);
  console.log(`  ReCircuit Autonomous Routing & Plan Generator`);
  console.log(`================================================================\n`);
  console.log(`📝 User Intake Text: "${text}"\n`);

  // 1. Stage 3 Intake Parsing
  const intakeResult = await parseIntake(text);
  const domainRequest = createDomainRequestFromIntake(intakeResult);

  console.log(`📍 Request Location: ${intakeResult.location.locality ?? "N/A"}, ${intakeResult.location.city} (Pincode: ${intakeResult.location.pincode ?? "N/A"})`);
  console.log(`💰 User Fee Cap:    ${intakeResult.feeCapInr != null ? `₹${intakeResult.feeCapInr}` : "None stated"}`);
  console.log(`📦 Parsed Items (${intakeResult.items.length}):`);
  for (const itm of intakeResult.items) {
    const weight = itm.declaredWeightKg ?? itm.estimatedWeightKg ?? 0;
    console.log(`   • ${itm.rawText} -> ${itm.category} (qty: ${itm.quantity}, wt: ${weight} kg [${itm.weightSource}], hazard: ${itm.hazardClass})`);
  }

  if (intakeResult.clarifications.length > 0) {
    console.log(`\n⚠️ Clarifications needed:`);
    for (const c of intakeResult.clarifications) {
      console.log(`   [${c.code}] ${c.question}`);
    }
  }

  // 2. Recycler Policies (Deccan, PaperPlus, QuickScrap)
  const policies = [
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
        sessionId: "local-deccan-cli",
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
        sessionId: "local-paperplus-cli",
        extractionPath: "generic-ai",
      },
      acceptedCategories: ["newspaper", "cardboard", "books_magazines"],
      rejectedCategories: ["laptop", "battery_household", "small_electronics", "hazardous"],
      freeThresholdKg: null,
      underWeightFeeInr: null,
      minWeightKg: 5,
      requiresDataWipeAck: false,
      quotes: ["Minimum Weight: At least 5 kg total scrap weight is required for home pickup."],
      rates: [],
    },
    {
      ...QUICKSCRAP_EXTRACTION,
      recyclerId: "quickscrap",
      companyName: "QuickScrap Hyd",
      status: "SUCCESS",
      feesUnknown: false,
      evidence: {
        url: "http://localhost:3103",
        textHash: "quickscrap-hash",
        screenshotPath: ".data/evidence/quickscrap-policy.png",
        extractedAt: new Date().toISOString(),
        sessionId: "local-quickscrap-cli",
        extractionPath: "generic-ai",
      },
      acceptedCategories: ["laptop", "mobile_phone", "newspaper", "cardboard", "battery_household"],
      rejectedCategories: ["hazardous"],
      freeThresholdKg: null,
      underWeightFeeInr: null,
      minWeightKg: null,
      convenienceFeeInr: 199,
      requiresDataWipeAck: false,
      quotes: ["₹199 Flat Pickup Fee"],
      rates: [],
    },
  ];

  // 3. Stage 5 Eligibility Matrix
  console.log(`\n----------------------------------------------------------------`);
  console.log(`  ELIGIBILITY MATRIX`);
  console.log(`----------------------------------------------------------------`);
  const matrix = buildEligibilityMatrix({
    requestId: domainRequest.id,
    items: intakeResult.items,
    policies,
    requestPincode: intakeResult.location.pincode,
  });

  for (const cell of matrix.cells) {
    const symbol = cell.status === "ACCEPTED" ? "✅" : cell.status === "REJECTED" ? "❌" : "❓";
    console.log(`  ${symbol} [${cell.recyclerName}] ${cell.itemDescription} (${cell.category}) -> ${cell.status}`);
    if (cell.quote) {
      console.log(`     Quote: "${cell.quote}"`);
    }
    if (cell.reason) {
      console.log(`     Note:  ${cell.reason}`);
    }
  }

  // 4. Stage 5 Routing Plan Generation
  console.log(`\n----------------------------------------------------------------`);
  console.log(`  GENERATING REVERSE-LOGISTICS SPLIT ROUTING PLANS`);
  console.log(`----------------------------------------------------------------`);
  const routing = generateRoutingPlans({
    request: {
      id: domainRequest.id,
      feeCapInr: intakeResult.feeCapInr,
      pincode: intakeResult.location.pincode,
    },
    items: intakeResult.items,
    policies,
  });

  if (!routing.bestPlan) {
    console.log(`\n❌ No viable reverse-logistics plan could be formed for this request.`);
    process.exit(0);
  }

  const bestScored = routing.scoredPlans[0];
  const bestPlan = routing.bestPlan;

  console.log(`\n🏆 BEST PROPOSED PLAN (Plan ID: ${bestPlan.id}) ${bestScored.isPartial ? "[PARTIAL]" : "[FULL]"}`);
  console.log(`   Plan Hash:         ${bestPlan.planHash}`);
  console.log(`   Total Pickup Fee:  ₹${bestPlan.totalEstimatedFee}`);
  console.log(`   Total Payout:      ₹${bestPlan.totalEstimatedPayout}`);
  console.log(`   Net Financial:     ₹${bestScored.netPayout}`);
  console.log(`   Pickup Legs:       ${bestPlan.legs.length}`);
  console.log(`   Within Fee Cap:    ${bestScored.withinCap ? "YES" : "NO (Exceeds Cap)"}`);
  console.log(`   Approval Reasons:  ${bestScored.approvalReasons.length > 0 ? bestScored.approvalReasons.join(", ") : "(None - clean auto-approval candidate)"}`);
  if (bestScored.isPartial) {
    console.log(`   Unrouted Items (${bestScored.unroutedItemIds.length}):`);
    for (const unId of bestScored.unroutedItemIds) {
      const itm = intakeResult.items.find((i) => i.id === unId);
      const itmDesc = itm ? `${itm.rawText} (${itm.category})` : unId;
      const cellReasons = matrix.cells
        .filter((c) => c.itemId === unId)
        .map((c) => `${c.recyclerName}: ${c.status}${c.reason ? ` (${c.reason})` : ""}`)
        .join("; ");
      console.log(`     • ${itmDesc} -> ${cellReasons}`);
    }
  }

  console.log(`\n📋 PLAN LEGS BREAKDOWN:`);
  bestPlan.legs.forEach((leg, idx) => {
    console.log(`   [Leg ${idx + 1}] Recycler: ${leg.recyclerName} (${leg.recyclerId.toUpperCase()})`);
    console.log(`           Pickup Fee:  ₹${leg.estimatedFee}`);
    console.log(`           Payout:      ₹${leg.estimatedPayout}`);
    console.log(`           Assigned Items:`);
    leg.items?.forEach((it) => {
      console.log(`             - ${it.description} (qty: ${it.quantity}, wt: ${it.estimatedWeightKg} kg)`);
    });
  });

  const topAlternatives = routing.scoredPlans.slice(1, 6);
  if (topAlternatives.length > 0) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`  TOP ALTERNATIVE PLANS (Showing ${topAlternatives.length} of ${routing.scoredPlans.length - 1} candidates):`);
    console.log(`----------------------------------------------------------------`);
    topAlternatives.forEach((alt, idx) => {
      const rank = idx + 2;
      const prevRank = rank - 1;
      const prevScored = idx === 0 ? bestScored : topAlternatives[idx - 1];
      const comparison = explainWhyPlanBeats(prevScored, alt, intakeResult.items.length);
      console.log(`\n   [Alt ${idx + 1}] (Rank #${rank}) ${alt.isPartial ? "[PARTIAL]" : "[FULL]"}`);
      console.log(`       Legs: ${alt.legsCount} | Fee: ₹${alt.totalFee} | Payout: ₹${alt.totalKnownPayout} | Net: ₹${alt.netPayout} | Recyclers: ${alt.plan.legs.map((l) => l.recyclerId).join(", ")}`);
      console.log(`       Flags: ${alt.approvalReasons.join(", ") || "(none)"}`);
      if (alt.isPartial) {
        console.log(`       Unrouted items (${alt.unroutedItemIds.length}):`);
        for (const unId of alt.unroutedItemIds) {
          const itm = intakeResult.items.find((i) => i.id === unId);
          const itmDesc = itm ? `${itm.rawText} (${itm.category})` : unId;
          const cellReasons = matrix.cells
            .filter((c) => c.itemId === unId)
            .map((c) => `${c.recyclerName}: ${c.status}${c.reason ? ` (${c.reason})` : ""}`)
            .join("; ");
          console.log(`         • ${itmDesc} -> ${cellReasons}`);
        }
      }
      console.log(`       💡 Why #${prevRank} beats #${rank}: ${comparison}`);
    });
  }

  // 5. State Machine Transition Verification
  console.log(`\n----------------------------------------------------------------`);
  console.log(`  STATE MACHINE TRANSITION AUDIT`);
  console.log(`----------------------------------------------------------------`);
  // POLICIES_READ -> ELIGIBILITY_CHECKED
  const reqWithPolicies = { ...domainRequest, state: "POLICIES_READ" };
  const res1 = transitionState(reqWithPolicies, "ELIGIBILITY_CHECKED", {
    matrixHash: "audit-matrix-hash",
    checkedAt: new Date().toISOString(),
  });
  const step1 = res1.newRequest;
  console.log(`  Transition: POLICIES_READ -> ELIGIBILITY_CHECKED: [${step1.state}] ✅`);

  // ELIGIBILITY_CHECKED -> PLAN_CREATED
  const res2 = transitionState(step1, "PLAN_CREATED", {
    planId: bestPlan.id,
    planHash: bestPlan.planHash,
    approvalReason: bestScored.approvalReasons.join(",") || "NONE",
  });
  const step2 = res2.newRequest;
  console.log(`  Transition: ELIGIBILITY_CHECKED -> PLAN_CREATED: [${step2.state}] ✅`);

  // PLAN_CREATED -> AWAITING_APPROVAL (Stage 6 Approval Gate)
  const approvalReasons = bestScored.approvalReasons.includes("BOOKING_SUBMISSION")
    ? bestScored.approvalReasons
    : ["BOOKING_SUBMISSION", ...bestScored.approvalReasons];

  const alternativesSummary = topAlternatives.map((alt, idx) => ({
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

  const { request: awaitingReq, plan: readyPlan, card: approvalCard } = requestApproval({
    request: step2,
    plan: bestPlan,
    slotPreference: DEFAULT_SLOT_PREFERENCE,
    approvalReasons,
    isPartial: bestScored.isPartial,
    unroutedItems: unrouted,
    alternatives: alternativesSummary,
  });
  console.log(`  Transition: PLAN_CREATED -> AWAITING_APPROVAL: [${awaitingReq.state}] ✅`);

  // Persist request to .data/requests/<requestId>.json
  const requestsDir = path.resolve(process.cwd(), ".data/requests");
  if (!fs.existsSync(requestsDir)) {
    fs.mkdirSync(requestsDir, { recursive: true });
  }
  const requestPath = path.join(requestsDir, `${awaitingReq.id}.json`);
  fs.writeFileSync(
    requestPath,
    JSON.stringify(
      {
        request: awaitingReq,
        plan: readyPlan,
        approvalCard,
        scoredPlans: routing.scoredPlans,
        intakeResult,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`  Persisted request state to: .data/requests/${awaitingReq.id}.json ✅`);

  // Stage 6 Approval Card Presentation
  console.log(`\n${formatApprovalCard(approvalCard)}`);

  console.log(`\n================================================================`);
  console.log(`  Planning completed successfully.`);
  console.log(`================================================================\n`);
}

main().catch((err) => {
  console.error("Fatal planning error:", err);
  process.exit(1);
});

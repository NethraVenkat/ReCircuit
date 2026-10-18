#!/usr/bin/env node
/**
 * scripts/plan-cli.mjs
 *
 * CLI runner for ReRoute End-to-End Planning & Split Routing:
 * Intake -> Discover Recyclers -> Read Policies -> Check Eligibility -> Create Plan
 *
 * Usage:
 *   npm run plan -- "<user recycling request sentence>"
 */

import {
  parseIntake,
  buildEligibilityMatrix,
  generateRoutingPlans,
  DECCAN_EXTRACTION,
  PAPERPLUS_EXTRACTION,
  QUICKSCRAP_EXTRACTION,
  transitionState,
  createDomainRequestFromIntake,
} from "@reroute/core";

async function main() {
  const args = process.argv.slice(2);
  const text = args.join(" ").trim();

  if (!text) {
    console.error(`Usage: npm run plan -- "<user recycling request sentence>"`);
    process.exit(1);
  }

  console.log(`\n================================================================`);
  console.log(`  ReRoute Autonomous Routing & Plan Generator`);
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

  console.log(`\n🏆 BEST PROPOSED PLAN (Plan ID: ${bestPlan.id})`);
  console.log(`   Plan Hash:         ${bestPlan.planHash}`);
  console.log(`   Total Pickup Fee:  ₹${bestPlan.totalEstimatedFee}`);
  console.log(`   Total Payout:      ₹${bestPlan.totalEstimatedPayout}`);
  console.log(`   Net Financial:     ₹${bestScored.netPayout}`);
  console.log(`   Pickup Legs:       ${bestPlan.legs.length}`);
  console.log(`   Within Fee Cap:    ${bestScored.withinCap ? "YES" : "NO (Exceeds Cap)"}`);
  console.log(`   Approval Reasons:  ${bestScored.approvalReasons.length > 0 ? bestScored.approvalReasons.join(", ") : "(None - clean auto-approval candidate)"}`);

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

  if (routing.alternatives.length > 0) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`  ALTERNATIVE PLANS (${routing.alternatives.length} candidate(s)):`);
    console.log(`----------------------------------------------------------------`);
    routing.scoredPlans.slice(1).forEach((alt, idx) => {
      console.log(`   [Alt ${idx + 1}] Legs: ${alt.legsCount} | Fee: ₹${alt.totalFee} | Payout: ₹${alt.totalKnownPayout} | Recyclers: ${alt.plan.legs.map((l) => l.recyclerId).join(", ")} | Flags: ${alt.approvalReasons.join(", ") || "none"}`);
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

  console.log(`\n================================================================`);
  console.log(`  Planning completed successfully.`);
  console.log(`================================================================\n`);
}

main().catch((err) => {
  console.error("Fatal planning error:", err);
  process.exit(1);
});

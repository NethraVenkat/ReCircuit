#!/usr/bin/env node
/**
 * scripts/approve-cli.mjs
 *
 * CLI runner for Stage 6: Approval Gate & Safe Action System:
 * Human approval / rejection / plan selection for reverse-logistics requests.
 *
 * Usage:
 *   npm run approve -- --request=<id> --decision=approve|reject [--choose-plan=<rank>]
 */

import fs from "fs";
import path from "path";
import { recordDecision, requestApproval, formatApprovalCard, hashPlan } from "@recircuit/core";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        options[key] = val;
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith("--")) {
          options[key] = next;
          i++;
        } else {
          options[key] = true;
        }
      }
    }
  }
  return options;
}

async function main() {
  const options = parseArgs();
  const requestId = options.request;

  if (!requestId) {
    console.error(`\n❌ Error: Missing --request=<id> argument.`);
    console.error(`Usage: npm run approve -- --request=<id> --decision=approve|reject [--choose-plan=<rank>]\n`);
    process.exit(1);
  }

  const requestsDir = path.resolve(process.cwd(), ".data/requests");
  const requestFilePath = path.join(requestsDir, `${requestId}.json`);

  if (!fs.existsSync(requestFilePath)) {
    console.error(`\n❌ Error: Request file not found at ${requestFilePath}.`);
    console.error(`Run "npm run plan -- <sentence>" first to generate and persist a request.\n`);
    process.exit(1);
  }

  const raw = fs.readFileSync(requestFilePath, "utf-8");
  const persisted = JSON.parse(raw);

  // 1. Handle --choose-plan=<rank>
  if (options["choose-plan"] != null) {
    const rank = parseInt(String(options["choose-plan"]), 10);
    if (isNaN(rank) || rank < 1) {
      console.error(`\n❌ Error: Invalid rank "${options["choose-plan"]}". Rank must be a positive integer.`);
      process.exit(1);
    }

    if (!persisted.scoredPlans || persisted.scoredPlans.length < rank) {
      console.error(`\n❌ Error: Chosen plan rank #${rank} exceeds available plans (${persisted.scoredPlans ? persisted.scoredPlans.length : 0}).`);
      process.exit(1);
    }

    const chosenScored = persisted.scoredPlans[rank - 1];
    const newPlan = { ...chosenScored.plan };
    newPlan.slotPreference = persisted.plan.slotPreference ?? { day: "earliest", window: "any" };
    newPlan.planHash = hashPlan(newPlan);

    const alternativesSummary = (persisted.scoredPlans || []).map((alt, idx) => ({
      rank: idx + 1,
      planId: alt.plan.id,
      legsCount: alt.legsCount,
      fee: alt.totalFee,
      payout: alt.totalKnownPayout,
      net: alt.netPayout,
      recyclers: alt.plan.legs.map((l) => l.recyclerId),
    }));

    const approvalReasons = chosenScored.approvalReasons.includes("BOOKING_SUBMISSION")
      ? chosenScored.approvalReasons
      : ["BOOKING_SUBMISSION", ...chosenScored.approvalReasons];

    // Re-transition state machine to AWAITING_APPROVAL with new plan
    const resetReq = {
      ...persisted.request,
      state: "PLAN_CREATED",
    };

    const reApproval = requestApproval({
      request: resetReq,
      plan: newPlan,
      slotPreference: newPlan.slotPreference,
      approvalReasons,
      isPartial: chosenScored.isPartial,
      alternatives: alternativesSummary,
    });

    persisted.request = reApproval.request;
    persisted.plan = reApproval.plan;
    persisted.approvalCard = reApproval.card;
    delete persisted.priorDecision;
    persisted.updatedAt = new Date().toISOString();

    fs.writeFileSync(requestFilePath, JSON.stringify(persisted, null, 2), "utf-8");

    console.log(`\n================================================================`);
    console.log(`  SELECTED ALTERNATIVE PLAN (Rank #${rank})`);
    console.log(`================================================================`);
    console.log(`Plan ID:    ${persisted.plan.id}`);
    console.log(`Plan Hash:  ${persisted.plan.planHash}`);
    console.log(`Legs:       ${persisted.plan.legs.length}`);
    console.log(`Total Fee:  ₹${persisted.plan.totalEstimatedFee}`);
    console.log(`Payout:     ₹${persisted.plan.totalEstimatedPayout}`);
    console.log(`\n${formatApprovalCard(persisted.approvalCard)}\n`);

    // If no decision flag was given, prompt user and exit cleanly
    if (!options.decision) {
      console.log(`Plan rank #${rank} selected. To approve or reject this plan, run:`);
      console.log(`  npm run approve -- --request=${requestId} --decision=approve`);
      console.log(`  npm run approve -- --request=${requestId} --decision=reject\n`);
      process.exit(0);
    }
  }

  // 2. Handle --decision=approve|reject
  if (!options.decision) {
    // Print current card if no decision is specified
    if (persisted.approvalCard) {
      console.log(`\n${formatApprovalCard(persisted.approvalCard)}\n`);
    } else {
      console.log(`Request ${requestId} is in state: ${persisted.request.state}`);
    }
    console.log(`\nSpecify --decision=approve or --decision=reject to record a decision.`);
    process.exit(0);
  }

  const decisionInput = String(options.decision).toLowerCase().trim();
  let decision;
  if (decisionInput === "approve" || decisionInput === "approved") {
    decision = "approved";
  } else if (decisionInput === "reject" || decisionInput === "rejected") {
    decision = "rejected";
  } else {
    console.error(`\n❌ Error: Invalid decision "${options.decision}". Must be "approve" or "reject".\n`);
    process.exit(1);
  }

  // 3. Record Decision using Deterministic State Machine
  const transitionResult = recordDecision({
    request: persisted.request,
    plan: persisted.plan,
    decision,
    decidedBy: options.user || "cli_user",
    reason: options.reason,
    priorDecision: persisted.priorDecision,
  });

  persisted.request = transitionResult.request;
  persisted.legs = transitionResult.legs;
  persisted.priorDecision = transitionResult.decisionRecord;
  persisted.updatedAt = new Date().toISOString();

  fs.writeFileSync(requestFilePath, JSON.stringify(persisted, null, 2), "utf-8");

  // 4. Output Formatted Results
  if (decision === "approved") {
    console.log(`\n================================================================`);
    console.log(`  DECISION RECORDED: APPROVED ✅`);
    console.log(`================================================================`);
    console.log(`Request ID:       ${persisted.request.id}`);
    console.log(`State:            ${persisted.request.state}`);
    console.log(`Decision ID:      ${transitionResult.decisionRecord.id}`);
    console.log(`Decided By:       ${transitionResult.decisionRecord.decidedBy}`);
    console.log(`Decided At:       ${transitionResult.decisionRecord.decidedAt}`);
    console.log(`Plan Hash:        ${transitionResult.decisionRecord.planHash}`);
    console.log(`Idempotent:       ${transitionResult.idempotent ? "YES (already approved)" : "NO (new transition)"}`);
    console.log(`\n📦 CREATED LEGS FOR SAFE AUTOMATED DISPATCH (${transitionResult.legs.length}):`);
    for (const leg of transitionResult.legs) {
      console.log(`   • [Leg ${leg.id}] Recycler: ${leg.recyclerName} (${leg.recyclerId.toUpperCase()})`);
      console.log(`     State:           ${leg.state}`);
      console.log(`     Fee:             ₹${leg.estimatedFee}`);
      console.log(`     Payout:          ₹${leg.estimatedPayout}`);
      console.log(`     Idempotency Key: ${leg.idempotencyKey}`);
    }
    console.log(`\n🛡️ SAFE ACTION GATE: READY FOR BOOKING SUBMISSION (Stage 7)`);
    console.log(`================================================================\n`);
  } else {
    console.log(`\n================================================================`);
    console.log(`  DECISION RECORDED: REJECTED ❌`);
    console.log(`================================================================`);
    console.log(`Request ID:       ${persisted.request.id}`);
    console.log(`State:            ${persisted.request.state}`);
    console.log(`Decision ID:      ${transitionResult.decisionRecord.id}`);
    console.log(`Decided By:       ${transitionResult.decisionRecord.decidedBy}`);
    console.log(`Decided At:       ${transitionResult.decisionRecord.decidedAt}`);
    console.log(`Reason:           ${transitionResult.decisionRecord.reason || "Declined by user"}`);
    console.log(`Legs Created:     0`);
    console.log(`================================================================\n`);
  }
}

main().catch((err) => {
  console.error("Fatal approval error:", err);
  process.exit(1);
});


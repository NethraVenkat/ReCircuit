#!/usr/bin/env node
/**
 * scripts/book-cli.mjs
 *
 * Stage 7 CLI runner: Browser Booking Agent (Booker).
 * Automated browser form filling, DOM readback verification, CAPTCHA handoff,
 * and booking reference extraction.
 *
 * Usage:
 *   npm run book -- --request=<id> [--headless=true|false]
 */

import fs from "fs";
import path from "path";
import { BookingRunner } from "../apps/worker/dist/booking/runner.js";

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

  console.log("\n=======================================================");
  console.log("   ReCircuit — Browser Booking Agent (Stage 7)");
  console.log("=======================================================\n");

  if (!requestId) {
    console.error("❌ Error: Missing --request=<id> argument.");
    console.error("Usage: npm run book -- --request=<id> [--headless=true|false]\n");
    process.exit(1);
  }

  const requestsDir = path.resolve(process.cwd(), ".data/requests");
  const requestFilePath = path.join(requestsDir, `${requestId}.json`);

  if (!fs.existsSync(requestFilePath)) {
    console.error(`❌ Error: Request file not found at ${requestFilePath}`);
    console.error('Run "npm run plan" and "npm run approve" first.\n');
    process.exit(1);
  }

  const storedData = JSON.parse(fs.readFileSync(requestFilePath, "utf-8"));
  const request = storedData.request;
  const plan = storedData.plan || (storedData.plans && storedData.plans[0]);
  const approval = storedData.priorDecision || storedData.approval || storedData.decisionRecord;
  const legs = storedData.legs || (plan && plan.legs) || [];

  if (!plan) {
    console.error("❌ Error: No plan found for this request.");
    process.exit(1);
  }

  if (!approval || approval.decision !== "approved") {
    console.error("❌ Error: Safe action blocked: Plan lacks approved user decision.");
    console.error(`Run "npm run approve -- --request=${requestId} --decision=approve" first.\n`);
    process.exit(1);
  }

  const customer = {
    fullName: storedData.customer?.fullName || "Ramesh Reddy",
    phone: storedData.customer?.phone || "9876543210",
    addressLine: storedData.customer?.addressLine || "Plot 10, Road No 2",
    locality: storedData.customer?.locality || request.locality || "Kukatpally",
    pincode: storedData.customer?.pincode || request.pincode || "500072",
    preferredSlot: storedData.customer?.preferredSlot || "Tomorrow (10:00–12:00 IST)",
  };

  const dataWipeAck = Boolean(
    approval.dataWipeConfirmedByUser ||
    plan.dataWipeConfirmedByUser ||
    storedData.dataWipeConfirmed
  );

  console.log(`📦 Request ID   : ${requestId}`);
  console.log(`📋 Plan Hash    : ${plan.planHash}`);
  console.log(`👤 Customer     : ${customer.fullName} (${customer.phone})`);
  console.log(`📍 Address      : ${customer.addressLine}, ${customer.locality} (${customer.pincode})`);
  console.log(`🔢 Total Legs   : ${legs.length}\n`);

  const updatedLegs = [];
  let failed = false;
  const allEvents = storedData.events || [];

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    console.log(`-------------------------------------------------------`);
    console.log(`▶ Processing Leg ${i + 1}/${legs.length}: [${leg.recyclerId.toUpperCase()}]`);
    console.log(`  State         : ${leg.state}`);
    console.log(`  Estimated Fee : ₹${leg.estimatedFee}`);
    console.log(`  Items         : ${leg.items?.map((it) => it.description || it.name).join(", ")}`);

    const context = {
      leg,
      plan,
      approval,
      customer,
      items: leg.items || [],
      dataWipeAck,
      request,
    };

    // In local CLI mode, default to headed execution so the human can see the browser and solve verification
    const isHeadless = options.headless === true || options.headless === "true";
    const bookerOpts = {
      headless: isHeadless,
    };

    if (leg.state === "APPROVED" || leg.state === "NEEDS_HUMAN") {
      try {
        const execResult = await BookingRunner.bookLegWithTransitions(context, bookerOpts);

        if (execResult.result.needsHuman) {
          console.log(`\n🛡️ Human Verification (CAPTCHA) Required:`);
          console.log(`  Live View Link    : ${execResult.result.humanVerification?.liveViewUrl}`);
          console.log(`  Screenshot Saved  : .data/evidence/${execResult.result.humanVerification?.screenshotRef}`);
          console.log(`  State             : NEEDS_HUMAN\n`);
        } else if (execResult.result.success) {
          console.log(`\n✅ Booking Successfully Placed:`);
          console.log(`  Official Reference: ${execResult.result.bookingReference}`);
          console.log(`  Confirmation URL  : ${execResult.result.confirmationUrl}`);
          console.log(`  Screenshot Proof  : ${execResult.result.screenshotRef}`);
          console.log(`  Duplicate Request : ${execResult.result.isDuplicate ? "Yes (idempotent)" : "No"}`);
          console.log(`  State             : ${execResult.updatedLeg.state}\n`);
        }

        updatedLegs.push(execResult.updatedLeg);
        allEvents.push(...execResult.auditEvents);
      } catch (err) {
        failed = true;
        console.error(`\n❌ Leg Booking Failed: ${err.message}\n`);
        updatedLegs.push(leg);
      }
      continue;
    }

    console.log(`ℹ️ Leg already in state "${leg.state}". Skipping.\n`);
    updatedLegs.push(leg);
  }

  // Persist updated state
  storedData.legs = updatedLegs;
  if (failed) process.exitCode = 1;
  if (storedData.plan) {
    storedData.plan.legs = updatedLegs;
  }
  storedData.events = allEvents;
  fs.writeFileSync(requestFilePath, JSON.stringify(storedData, null, 2), "utf-8");

  console.log("=======================================================");
  console.log("   Booking run complete. State saved.");
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("\n❌ Fatal Error:", err);
  process.exit(1);
});

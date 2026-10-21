#!/usr/bin/env node

/**
 * scripts/verify-cli.mjs
 *
 * Stage 8: Independent Verifier CLI
 * Verifies a submitted booking reference against the recycler's live tracking
 * portal through a distinct, separate browser session.
 *
 * Usage:
 *   node scripts/verify-cli.mjs --ref DEC-12345 --recycler deccan
 *   node scripts/verify-cli.mjs --request <requestId>
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Verifier } from "../apps/worker/dist/verifier/verifier.js";
import { VerificationRunner } from "../apps/worker/dist/verifier/runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
      options[key] = val;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs();

  console.log("═════════════════════════════════════════════════════════════════");
  console.log("  ReCircuit — Stage 8: Independent Consignment Verifier");
  console.log("═════════════════════════════════════════════════════════════════\n");

  let recyclerId = options.recycler || "deccan";
  let bookingReference = options.ref || "";
  let submittingSessionId = options["submitting-session"] || "submitting-session-prior";
  let leg = null;
  let plan = null;

  if (options.request) {
    const reqPath = path.resolve(process.cwd(), ".data", "requests", `${options.request}.json`);
    if (fs.existsSync(reqPath)) {
      const reqData = JSON.parse(fs.readFileSync(reqPath, "utf-8"));
      plan = reqData.plan;
      if (plan && plan.legs && plan.legs.length > 0) {
        leg = plan.legs[0];
        recyclerId = leg.recyclerId;
        bookingReference = leg.bookingReference || bookingReference;
        submittingSessionId = leg.submittingSessionId || submittingSessionId;
      }
    }
  }

  if (!bookingReference) {
    // If no ref provided, check .data/requests for the latest submitted leg
    const reqDir = path.resolve(process.cwd(), ".data", "requests");
    if (fs.existsSync(reqDir)) {
      const files = fs.readdirSync(reqDir).filter((f) => f.endsWith(".json"));
      for (const file of files.reverse()) {
        const data = JSON.parse(fs.readFileSync(path.join(reqDir, file), "utf-8"));
        if (data.plan?.legs) {
          const submittedLeg = data.plan.legs.find((l) => l.bookingReference);
          if (submittedLeg) {
            leg = submittedLeg;
            plan = data.plan;
            recyclerId = submittedLeg.recyclerId;
            bookingReference = submittedLeg.bookingReference;
            submittingSessionId = submittedLeg.submittingSessionId || submittingSessionId;
            break;
          }
        }
      }
    }
  }

  if (!bookingReference) {
    console.error("❌ Error: Missing booking reference. Specify --ref <REFERENCE> --recycler <RECYCLER_ID> or --request <ID>.");
    process.exit(1);
  }

  if (!leg) {
    leg = {
      id: crypto.randomUUID(),
      recyclerId,
      categoryGroups: ["e_waste"],
      state: "REQUEST_SUBMITTED",
      estimatedFee: 180,
      estimatedPayout: 0,
      itemCount: 1,
      bookingReference,
      submittingSessionId,
      items: [{ name: "E-Waste Item", quantity: 1, weightKg: 2.0 }],
      idempotencyKey: `idemp-${Date.now()}`,
    };
  }

  if (!plan) {
    plan = {
      id: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      legs: [leg],
      totalEstimatedFee: 180,
      totalEstimatedPayout: 0,
      planHash: "plan-hash",
      createdAt: new Date().toISOString(),
    };
  }

  console.log(`🔍 Target Recycler       : ${recyclerId}`);
  console.log(`🔖 Booking Reference     : ${bookingReference}`);
  console.log(`🆔 Submitting Session ID : ${submittingSessionId}`);
  console.log(`🌐 Independent Session   : Launching clean browser session...\n`);

  try {
    const result = await VerificationRunner.verifyLegWithAudit(
      { leg, plan, expectedReference: bookingReference },
      { headless: true }
    );

    console.log("─────────────────────────────────────────────────────────────────");
    console.log("✅ INDEPENDENT VERIFICATION SUCCESSFUL");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log(`  Booking Reference    : ${result.bookingReference}`);
    console.log(`  Observed Status      : ${result.observedStatus}`);
    console.log(`  Verifying Session ID : ${result.verifyingSessionId} (DISTINCT from Submitting Session)`);
    console.log(`  Tracking Portal URL  : ${result.trackingUrl}`);
    console.log(`  Observed Fee Text    : ${result.observedFeeText || "N/A"}`);
    console.log(`  Observed Items       : ${result.observedItems.map((i) => `${i.name} (Qty: ${i.quantity ?? 1})`).join(", ")}`);
    console.log(`  Screenshot Proof     : ${result.screenshotRef || "N/A"}`);
    console.log(`  Proof Ledger Saved   : .data/verifications/${result.bookingReference}.json\n`);
  } catch (err) {
    console.error(`\n❌ Verification Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

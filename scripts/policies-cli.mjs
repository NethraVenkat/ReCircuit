#!/usr/bin/env node
import "./local-cli-only.mjs";
/**
 * scripts/policies-cli.mjs
 *
 * CLI runner for ReCircuit Browser Policy Discovery.
 * Discovers and extracts policies from Deccan, PaperPlus, and QuickScrap.
 * Automatically spins up local portal servers if not already running.
 *
 * Usage:
 *   npm run policies -- --mode=local
 *   npm run policies -- --mode=browserbase
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { openSession } from "../apps/worker/dist/browser/session.js";
import { readRecyclerPolicy } from "../apps/worker/dist/policy/policy-reader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const modeArg =
  args.find((a) => a.startsWith("--mode="))?.split("=")[1] ||
  process.env.BROWSER_MODE ||
  "local";

const PORTALS = [
  { id: "deccan", port: 3101, url: process.env.PORTAL_DECCAN_URL || "http://localhost:3101" },
  { id: "paperplus", port: 3102, url: process.env.PORTAL_PAPERPLUS_URL || "http://localhost:3102" },
  { id: "quickscrap", port: 3103, url: process.env.PORTAL_QUICKSCRAP_URL || "http://localhost:3103" },
];

async function isPortHealthy(port) {
  try {
    const res = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensurePortalsRunning() {
  const allUp = (await Promise.all(PORTALS.map((p) => isPortHealthy(p.port)))).every(Boolean);
  if (allUp) return null;

  console.log("🌐 Local portal servers not detected. Spawning mock portals in background...");
  const launcherPath = path.resolve(__dirname, "start-portals.cjs");
  const child = spawn("node", [launcherPath], {
    stdio: "ignore",
    detached: false,
    shell: true,
  });

  // Wait for health
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const healthy = (await Promise.all(PORTALS.map((p) => isPortHealthy(p.port)))).every(Boolean);
    if (healthy) {
      console.log("✅ All 3 mock portals ready on ports 3101, 3102, 3103.\n");
      return child;
    }
  }
  console.warn("⚠️ Timed out waiting for portal servers. Proceeding anyway...");
  return child;
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`  ReCircuit Policy Discovery CLI (Mode: ${modeArg.toUpperCase()})`);
  console.log(`======================================================\n`);

  let spawnedChild = null;
  if (modeArg === "local") {
    spawnedChild = await ensurePortalsRunning();
  }

  try {
    for (const portal of PORTALS) {
      console.log(`\n------------------------------------------------------`);
      console.log(`[Discovery] Initiating session for ${portal.id.toUpperCase()} at ${portal.url}...`);
      let session;
      try {
        session = await openSession({ mode: modeArg, recyclerId: portal.id, headless: true });
        const policy = await readRecyclerPolicy(portal.id, session, portal.url);

        console.log(`\n✅ Extraction Status: ${policy.status}`);
        console.log(`   Company:          ${policy.companyName}`);
        console.log(`   Accepted Categories: ${policy.acceptedCategories.join(", ") || "(none)"}`);
        console.log(`   Rejected Categories: ${policy.rejectedCategories.join(", ") || "(none)"}`);

        console.log(`   Fee Rules (${policy.feeRules.length}):`);
        if (policy.feeRules.length === 0) {
          console.log(`     (none stated)`);
        } else {
          for (const fr of policy.feeRules) {
            console.log(`     • [${fr.kind}] amount: ₹${fr.amountInr}${fr.thresholdKg != null ? `, threshold: ${fr.thresholdKg} kg` : ""} | Quote: "${fr.quote}"`);
          }
        }

        console.log(`   Payout Rules (${policy.payoutRules.length}):`);
        if (policy.payoutRules.length === 0) {
          console.log(`     (none stated)`);
        } else {
          for (const pr of policy.payoutRules) {
            console.log(`     • ${pr.rawName} -> ₹${pr.amountInr} (${pr.unit}) | Quote: "${pr.quote}"`);
          }
        }

        if (policy.minimumTotalKg?.value != null) {
          console.log(`   Minimum Total Weight: ${policy.minimumTotalKg.value} kg | Quote: "${policy.minimumTotalKg.quote}"`);
        }
        if (policy.serviceablePincodes?.values?.length > 0) {
          console.log(`   Serviceable Pincodes: ${policy.serviceablePincodes.values.join(", ")} | Quote: "${policy.serviceablePincodes.quote}"`);
        }
        if (policy.registrationNotice?.text) {
          console.log(`   Registration Notice: "${policy.registrationNotice.text}" | Quote: "${policy.registrationNotice.quote}"`);
        }
        if (policy.requiresDataWipeAck) {
          console.log(`   Data Wipe Ack:    REQUIRED`);
        }
        if (policy.failureReason) {
          console.log(`   Failure Reason:   ${policy.failureReason}`);
        }

        console.log(`   Cited Quotes:     ${policy.quotes.length} verbatim quotes verified`);
        for (const q of policy.quotes.slice(0, 3)) {
          console.log(`     - "${q}"`);
        }
        if (policy.quotes.length > 3) {
          console.log(`     ... (${policy.quotes.length - 3} more quotes)`);
        }

        const pages = policy.evidence.visitedPages?.length > 0
          ? policy.evidence.visitedPages
          : [{ url: portal.url, screenshotPath: policy.evidence.screenshotPath }];
        console.log(`   Visited Pages (${pages.length} page(s) visited):`);
        for (let i = 0; i < pages.length; i++) {
          console.log(`     [Page ${i + 1}] URL: ${pages[i].url}`);
          console.log(`            Screenshot: ${pages[i].screenshotPath}`);
        }
        console.log(`   Session ID:       ${policy.evidence.sessionId}`);
      } catch (err) {
        console.error(`❌ Error reading policy for ${portal.id}:`, err);
      } finally {
        if (session) {
          await session.close();
        }
      }
    }
  } finally {
    if (spawnedChild) {
      try {
        spawnedChild.kill();
      } catch {
        // ignore cleanup error
      }
    }
  }

  console.log(`\n======================================================`);
  console.log(`  Policy Discovery Run Complete.`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error("Fatal CLI error:", err);
  process.exit(1);
});

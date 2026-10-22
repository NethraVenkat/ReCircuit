/**
 * scripts/cloud-retrieve-policies.mjs
 *
 * Stage 3: Live Policy Discovery & Extraction from Mock Recycler Portals via Browserbase Cloud.
 *
 * Features:
 * - Visits portals using Browserbase cloud session
 * - Discovers policy navigation links (/accepted-items, /pickup-charges, /what-we-take, /rates)
 * - Extracts accepted & rejected items, minimum weights, and rate cards
 * - Stores verbatim quotes, source URLs, retrieval timestamps, and SHA-256 evidence
 */

import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { Browserbase } from "@browserbasehq/sdk";
import { readRecyclerPolicy } from "../apps/worker/dist/policy/policy-reader.js";
import { openSession } from "../apps/worker/dist/browser/session.js";

function loadEnvLocal() {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, "utf-8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined || process.env[key] === "") {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

const evidenceDir = path.resolve(process.cwd(), ".data", "evidence", "run-20261021-235300-cloud-soak");
if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

const RECYCLERS = [
  { id: "deccan", name: "Deccan E-Cycle", envKey: "PORTAL_DECCAN_URL" },
  { id: "paperplus", name: "PaperPlus Kabadi", envKey: "PORTAL_PAPERPLUS_URL" },
  { id: "quickscrap", name: "QuickScrap Hyd", envKey: "PORTAL_QUICKSCRAP_URL" },
];

async function runStage3() {
  const startTime = new Date().toISOString();
  console.log("==================================================================");
  console.log("  ReCircuit: Stage 3 Cloud Policy Discovery & Extraction");
  console.log("==================================================================");
  console.log(`- Start time: ${startTime}`);

  const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();

  if (!apiKey || !projectId) {
    console.error("Missing Browserbase credentials");
    process.exit(1);
  }

  const bb = new Browserbase({ apiKey });
  let session = null;
  let browser = null;
  let context = null;
  let page = null;
  let sessionId = "unknown";

  const extractedPolicies = {};

  try {
    session = await bb.sessions.create({ projectId, keepAlive: false });
    sessionId = session.id;
    console.log(`- Browserbase cloud session created: ${sessionId}`);

    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 45000 });
    const contexts = browser.contexts();
    context = contexts.length > 0 ? contexts[0] : await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    page.setDefaultTimeout(30000);

    // Session wrapper matching BrowserSession interface
    const browserSession = {
      page,
      sessionId: `bb-${sessionId}`,
      mode: "browserbase",
      close: async () => {},
      captureScreenshot: async (label) => {
        const filename = `stage3-policy-${label}.png`;
        const fullPath = path.join(evidenceDir, filename);
        const buffer = await page.screenshot({ path: fullPath });
        return { path: fullPath, buffer, filename };
      },
    };

    for (const recycler of RECYCLERS) {
      const portalUrl = process.env[recycler.envKey]?.trim();
      console.log(`\n- Discovering policies for ${recycler.name} (${portalUrl})...`);

      const policy = await readRecyclerPolicy(recycler.id, browserSession, portalUrl);
      extractedPolicies[recycler.id] = policy;

      console.log(`  * Accepted Categories: ${policy.acceptedCategories.length}`);
      console.log(`  * Rejected Categories: ${policy.rejectedCategories.length}`);
      console.log(`  * Rate Card Items:     ${policy.rateCard.length}`);
      console.log(`  * Min Weight Required: ${policy.minWeightKg} kg`);
      console.log(`  * Free Pickup Thresh:  ${policy.freeThresholdKg ?? "N/A"} kg`);
      console.log(`  * Evidence Quotes:     ${policy.evidenceQuotes.length}`);
    }

    const endTime = new Date().toISOString();
    console.log("\n==================================================================");
    console.log("  Stage 3 Policy Extraction: ALL POLICIES EXTRACTED PASS ✅");
    console.log("==================================================================");

    const outPath = path.join(evidenceDir, "cloud-extracted-policies.json");
    fs.writeFileSync(outPath, JSON.stringify(extractedPolicies, null, 2), "utf8");
    console.log(`- Extracted policies saved to: ${outPath}`);

    const record = {
      stage: "Stage 3 — Cloud Policy Discovery & Extraction",
      status: "PASS",
      provider: "browserbase",
      sessionId,
      extractedPolicies: Object.keys(extractedPolicies),
      outputFile: "cloud-extracted-policies.json",
      startTime,
      endTime,
    };
    fs.appendFileSync(path.join(evidenceDir, "manifest.jsonl"), JSON.stringify(record) + "\n", "utf8");
    return { status: "PASS", record, extractedPolicies };
  } catch (err) {
    const endTime = new Date().toISOString();
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Stage 3 Failed: ${errMsg}`);

    const record = {
      stage: "Stage 3 — Cloud Policy Discovery & Extraction",
      status: "FAIL",
      provider: "browserbase",
      sessionId,
      error: errMsg,
      startTime,
      endTime,
    };
    fs.appendFileSync(path.join(evidenceDir, "manifest.jsonl"), JSON.stringify(record) + "\n", "utf8");
    return { status: "FAIL", error: errMsg };
  } finally {
    console.log("- Releasing browser session...");
    try {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch {}

    if (bb && sessionId && sessionId !== "unknown") {
      try {
        const releaseRequestedAt = new Date().toISOString();
        console.log(`- Requesting documented session release for ${sessionId} via status='REQUEST_RELEASE'...`);
        await bb.sessions.update(sessionId, { status: "REQUEST_RELEASE", projectId }).catch((err) => {
          console.warn(`  * Release request notification: ${err.message}`);
        });

        const terminal = await bb.sessions.retrieve(sessionId).catch(() => null);
        const observedTerminalState = terminal?.status || "UNKNOWN";
        const endedAt = terminal?.endedAt || null;

        console.log(`- Observed Terminal State: ${observedTerminalState}`);
        console.log(`  * Release Requested At: ${releaseRequestedAt}`);
        console.log(`  * Session Ended At:     ${endedAt || "N/A"}`);
      } catch (e) {
        console.warn(`- Failed to retrieve terminal state: ${e.message}`);
      }
    }
  }
}

runStage3().then((res) => {
  if (res.status === "FAIL") process.exit(1);
});

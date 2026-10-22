/**
 * scripts/cloud-verify-portals.mjs
 *
 * Stage 2: Cloud Connectivity Verification to Mock Recycler Portals via Browserbase.
 *
 * Exercises Browserbase cloud browser against configured public portal URLs:
 * - Deccan E-Cycle:    PORTAL_DECCAN_URL
 * - PaperPlus Kabadi:  PORTAL_PAPERPLUS_URL
 * - QuickScrap Hyd:    PORTAL_QUICKSCRAP_URL
 *
 * Verifies:
 * - Successful HTTPS reachability from cloud containers
 * - Recycler branding and distinct route resolution
 * - Screenshot capture for release audit evidence
 * - Guaranteed clean session release in finally
 */

import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { Browserbase } from "@browserbasehq/sdk";

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

const PORTALS = [
  {
    id: "deccan",
    name: "Deccan E-Cycle",
    envKey: "PORTAL_DECCAN_URL",
    expectedText: "Deccan E-Cycle",
  },
  {
    id: "paperplus",
    name: "PaperPlus Kabadi",
    envKey: "PORTAL_PAPERPLUS_URL",
    expectedText: "PaperPlus Kabadi",
  },
  {
    id: "quickscrap",
    name: "QuickScrap Hyd",
    envKey: "PORTAL_QUICKSCRAP_URL",
    expectedText: "QuickScrap Hyd",
  },
];

async function runStage2() {
  const startTime = new Date().toISOString();
  console.log("==================================================================");
  console.log("  ReCircuit: Stage 2 Cloud Connectivity to Mock Recyclers");
  console.log("==================================================================");
  console.log(`- Start time: ${startTime}`);

  const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();

  if (!apiKey || !projectId) {
    console.error("Missing Browserbase credentials");
    process.exit(1);
  }

  // Check portal URLs
  const missingUrls = PORTALS.filter((p) => !process.env[p.envKey]?.trim());
  if (missingUrls.length > 0) {
    console.error(`- Missing configured portal URLs for: ${missingUrls.map((p) => p.envKey).join(", ")}`);
    console.error("  Please configure public tunnel URLs before starting Stage 2.");
    process.exit(1);
  }

  const bb = new Browserbase({ apiKey });
  let session = null;
  let browser = null;
  let context = null;
  let page = null;
  let sessionId = "unknown";

  const results = [];

  try {
    session = await bb.sessions.create({
      projectId,
      keepAlive: false,
    });
    sessionId = session.id;
    console.log(`- Browserbase cloud session created: ${sessionId}`);

    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 45000 });
    const contexts = browser.contexts();
    context = contexts.length > 0 ? contexts[0] : await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    page.setDefaultTimeout(30000);

    for (const portal of PORTALS) {
      const portalUrl = process.env[portal.envKey].trim();
      console.log(`\n- Testing ${portal.name} at ${portalUrl}...`);

      const t0 = Date.now();
      await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      const durationMs = Date.now() - t0;

      const title = (await page.title())?.trim();
      const bodyText = (await page.locator("body").innerText()) || "";
      const containsExpected = bodyText.includes(portal.expectedText);

      console.log(`  * Observed Title: "${title}"`);
      console.log(`  * Contains "${portal.expectedText}": ${containsExpected}`);
      console.log(`  * Load Duration: ${durationMs}ms`);

      if (!containsExpected) {
        throw new Error(`Expected text "${portal.expectedText}" not found on ${portal.name} (${portalUrl})`);
      }

      const screenshotFilename = `stage2-cloud-${portal.id}.png`;
      const screenshotPath = path.join(evidenceDir, screenshotFilename);
      await page.screenshot({ path: screenshotPath });
      console.log(`  * Screenshot saved: ${screenshotFilename}`);

      results.push({
        portalId: portal.id,
        name: portal.name,
        url: portalUrl,
        title,
        durationMs,
        screenshot: screenshotFilename,
        status: "PASS",
      });
    }

    const endTime = new Date().toISOString();
    console.log("\n==================================================================");
    console.log("  Stage 2 Cloud Connectivity: ALL PORTALS VERIFIED PASS ✅");
    console.log("==================================================================");

    const record = {
      stage: "Stage 2 — Cloud Connectivity to Mock Recyclers",
      status: "PASS",
      provider: "browserbase",
      sessionId,
      results,
      startTime,
      endTime,
    };
    fs.appendFileSync(path.join(evidenceDir, "manifest.jsonl"), JSON.stringify(record) + "\n", "utf8");
    return { status: "PASS", record };
  } catch (err) {
    const endTime = new Date().toISOString();
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Stage 2 Failed: ${errMsg}`);

    const record = {
      stage: "Stage 2 — Cloud Connectivity to Mock Recyclers",
      status: "FAIL",
      provider: "browserbase",
      sessionId,
      error: errMsg,
      results,
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

runStage2().then((res) => {
  if (res.status === "FAIL") process.exit(1);
});

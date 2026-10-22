import { chromium } from "playwright";
import { Browserbase } from "@browserbasehq/sdk";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// 1. Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  }
}

const apiKey = process.env.BROWSERBASE_API_KEY;
const projectId = process.env.BROWSERBASE_PROJECT_ID;

async function main() {
  console.log("1. Starting ingress tunnel for Deccan (port 3101)...");
  const ssh = spawn("ssh", [
    "-p", "443",
    "-R", "80:localhost:3101",
    "-o", "StrictHostKeyChecking=no",
    "-o", "ServerAliveInterval=30",
    "serveo.net"
  ], { shell: true });

  let tunnelUrl = "";
  ssh.stdout.on("data", (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.serveousercontent\.com/);
    if (match) {
      tunnelUrl = match[0];
    }
  });

  for (let i = 0; i < 25 && !tunnelUrl; i++) {
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("Tunnel established:", tunnelUrl);
  if (!tunnelUrl) {
    ssh.kill();
    throw new Error("Failed to capture public tunnel URL");
  }

  console.log("2. Requesting Browserbase cloud session...");
  const bb = new Browserbase({ apiKey });
  const session = await bb.sessions.create({ projectId, keepAlive: false });
  console.log("Browserbase session created:", session.id);

  let browser = null;
  let context = null;
  let page = null;

  try {
    console.log("3. Connecting Playwright to Browserbase CDP...");
    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 45000 });
    context = browser.contexts()[0] || (await browser.newContext());
    await context.setExtraHTTPHeaders({
      "serveo-skip-browser-warning": "true",
    });
    page = context.pages()[0] || (await context.newPage());

    console.log(`4. Navigating Browserbase cloud to ${tunnelUrl}...`);
    await page.goto(tunnelUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    const title = (await page.title())?.trim();
    console.log(`Browserbase Observed Title: "${title}"`);

    const h2Count = await page.locator("h2").count();
    let heading = "";
    if (h2Count > 0) {
      heading = (await page.locator("h2").first().textContent())?.trim() || "";
    }
    console.log(`Browserbase Observed Heading: "${heading}"`);

    const outDir = path.resolve(process.cwd(), ".data", "evidence");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const ssPath = path.join(outDir, "browserbase-deccan-cloud-test.png");
    await page.screenshot({ path: ssPath });
    console.log(`Screenshot saved to: ${ssPath}`);

    if (!heading.includes("Deccan E-Cycle")) {
      throw new Error(`Heading does not match Deccan E-Cycle: "${heading}"`);
    }

    console.log("✅ CLOUD REACHABILITY ASSERTION PASSED: Browserbase cloud reached local Deccan portal!");
  } finally {
    console.log("5. Cleaning up cloud session and tunnel...");
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (session && session.id) {
      await bb.sessions.update(session.id, { status: "COMPLETED" }).catch(() => {});
    }
    ssh.kill();
    console.log("Session released and tunnel closed cleanly.");
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

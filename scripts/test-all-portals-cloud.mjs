import { chromium } from "playwright";
import { Browserbase } from "@browserbasehq/sdk";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// Load .env.local
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

function startPortalTunnel(port, retries = 3) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryConnect = () => {
      attempt++;
      console.log(`[Tunnel] Establishing tunnel for port ${port} (attempt ${attempt})...`);
      const child = spawn("ssh", [
        "-p", "443",
        "-R", `80:localhost:${port}`,
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=30",
        "-o", "ConnectTimeout=10",
        "serveo.net"
      ], { shell: true });

      let url = "";
      let resolved = false;

      child.stdout.on("data", (d) => {
        const text = d.toString();
        const match = text.match(/https:\/\/[a-z0-9-]+\.serveousercontent\.com/);
        if (match && !resolved) {
          url = match[0];
          resolved = true;
          console.log(`[Tunnel] Port ${port} -> ${url}`);
          resolve({
            url,
            close: () => {
              try { child.kill(); } catch {}
            }
          });
        }
      });

      child.on("error", () => {});
      child.on("close", () => {
        if (!resolved && attempt < retries) {
          setTimeout(tryConnect, 2000);
        } else if (!resolved) {
          reject(new Error(`Failed to establish tunnel for port ${port} after ${retries} attempts`));
        }
      });

      setTimeout(() => {
        if (!resolved) {
          try { child.kill(); } catch {}
          if (attempt < retries) {
            setTimeout(tryConnect, 2000);
          } else {
            reject(new Error(`Timeout establishing tunnel for port ${port}`));
          }
        }
      }, 15000);
    };

    tryConnect();
  });
}

async function testPortals() {
  const bb = new Browserbase({ apiKey });
  const portals = [
    { id: "deccan", name: "Deccan E-Cycle", port: 3101, expectedHeading: "Deccan E-Cycle" },
    { id: "paperplus", name: "PaperPlus Kabadi", port: 3102, expectedHeading: "PaperPlus Kabadi" },
    { id: "quickscrap", name: "QuickScrap Hyd", port: 3103, expectedHeading: "QuickScrap Hyd" },
  ];

  for (const portal of portals) {
    console.log(`\n======================================================`);
    console.log(`  Verifying ${portal.name} (Port ${portal.port})`);
    console.log(`======================================================`);

    let tunnel = null;
    let session = null;
    let browser = null;
    let context = null;
    let page = null;

    try {
      tunnel = await startPortalTunnel(portal.port);

      console.log(`- Requesting Browserbase cloud session for ${portal.name}...`);
      session = await bb.sessions.create({ projectId, keepAlive: false });
      console.log(`- Cloud session created: ${session.id}`);

      console.log("- Connecting Playwright to Browserbase CDP...");
      browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 45000 });
      context = browser.contexts()[0] || (await browser.newContext());
      await context.setExtraHTTPHeaders({ "serveo-skip-browser-warning": "true" });
      page = context.pages()[0] || (await context.newPage());

      console.log(`- Navigating Browserbase cloud to ${tunnel.url}...`);
      await page.goto(tunnel.url, { waitUntil: "domcontentloaded", timeout: 30000 });

      const title = (await page.title())?.trim();
      const h2Count = await page.locator("h2").count();
      let heading = "";
      if (h2Count > 0) {
        heading = (await page.locator("h2").first().textContent())?.trim() || "";
      }

      console.log(`- Title: "${title}"`);
      console.log(`- Heading: "${heading}"`);

      const outDir = path.resolve(process.cwd(), ".data", "evidence");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const ssPath = path.join(outDir, `stage2-${portal.id}-connectivity.png`);
      await page.screenshot({ path: ssPath });
      console.log(`- Screenshot: ${ssPath}`);

      if (!heading.includes(portal.expectedHeading) && !title.includes(portal.expectedHeading)) {
        throw new Error(`Heading/Title does not match expected "${portal.expectedHeading}". Got: "${heading}" / "${title}"`);
      }

      console.log(`✅ ${portal.name} passed cloud reachability assertion!`);
    } finally {
      console.log(`- Cleaning up session and tunnel for ${portal.name}...`);
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      if (session?.id) {
        await bb.sessions.update(session.id, { status: "COMPLETED" }).catch(() => {});
      }
      if (tunnel) tunnel.close();
      console.log(`- Cleaned up.`);
    }

    // Brief pause between tunnels to prevent SSH connection throttles
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\n🎉 ALL 3 PORTALS REACHED AND VERIFIED IN BROWSERBASE CLOUD!");
}

testPortals().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

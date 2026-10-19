#!/usr/bin/env node
/**
 * scripts/demo-reset.mjs
 *
 * Full clean demo reset for ReCircuit.
 * 1. Resets portal databases & failure switches on ports 3101, 3102, 3103 via POST /api/reset
 * 2. Clears portal store files (.data/{deccan,paperplus,quickscrap,used_nonces}.json)
 * 3. Clears persisted requests (.data/requests/*.json)
 * 4. Clears temporary evidence files (.data/evidence/*.png)
 * 5. Clears action log (.data/action-log.jsonl)
 */

import fs from "fs";
import path from "path";

function loadEnvLocal() {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, "utf-8").split("\n");
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
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

const PORTAL_PORTS = [3101, 3102, 3103];
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error("❌ Error: ADMIN_TOKEN is not set in environment or .env.local.");
  console.error("Please configure ADMIN_TOKEN in .env.local or pass ADMIN_TOKEN in the environment before running demo:reset.");
  process.exit(1);
}

async function resetPortals() {
  console.log("🔄 Resetting recycler portal instances...");
  for (const port of PORTAL_PORTS) {
    const url = `http://localhost:${port}/api/reset?token=${encodeURIComponent(ADMIN_TOKEN)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "x-admin-token": ADMIN_TOKEN },
      });
      if (res.ok) {
        console.log(`   • Port ${port}: Portal database & failure switches reset ✅`);
      } else {
        console.log(`   • Port ${port}: Returned HTTP ${res.status} (offline or unauthenticated)`);
      }
    } catch {
      console.log(`   • Port ${port}: Not running (offline)`);
    }
  }
}

function clearFiles() {
  const dataDir = path.resolve(process.cwd(), ".data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    return;
  }

  // 1. Reset portal storage files
  const portalFiles = ["deccan.json", "paperplus.json", "quickscrap.json", "used_nonces.json"];
  for (const file of portalFiles) {
    const p = path.join(dataDir, file);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        // file in use
      }
    }
  }

  // 2. Clear requests
  const requestsDir = path.join(dataDir, "requests");
  if (fs.existsSync(requestsDir)) {
    for (const f of fs.readdirSync(requestsDir)) {
      if (f.endsWith(".json")) {
        try {
          fs.unlinkSync(path.join(requestsDir, f));
        } catch {}
      }
    }
  }

  // 3. Clear evidence
  const evidenceDir = path.join(dataDir, "evidence");
  if (fs.existsSync(evidenceDir)) {
    for (const f of fs.readdirSync(evidenceDir)) {
      if (f.endsWith(".png") || f.endsWith(".txt")) {
        try {
          fs.unlinkSync(path.join(evidenceDir, f));
        } catch {}
      }
    }
  }

  // 4. Truncate action-log.jsonl
  const actionLog = path.join(dataDir, "action-log.jsonl");
  if (fs.existsSync(actionLog)) {
    try {
      fs.writeFileSync(actionLog, "", "utf-8");
    } catch {}
  }

  console.log("🧹 Local file stores, requests, and evidence cleaned ✅");
}

async function main() {
  console.log("================================================================");
  console.log("  ReCircuit: Full Demo Reset");
  console.log("================================================================");
  await resetPortals();
  clearFiles();
  console.log("================================================================");
  console.log("  Demo environment is completely reset and ready for clean run. ✅");
  console.log("================================================================\n");
}

main().catch((err) => {
  console.error("Reset error:", err);
  process.exit(1);
});

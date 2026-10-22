#!/usr/bin/env node

/**
 * scripts/start-portals.cjs
 * Cross-platform launcher that concurrently starts the 3 mock recycler portals:
 * - Deccan E-Cycle:   http://127.0.0.1:3101 (RECYCLER_ID=deccan)
 * - PaperPlus Kabadi: http://127.0.0.1:3102 (RECYCLER_ID=paperplus)
 * - QuickScrap Hyd:   http://127.0.0.1:3103 (RECYCLER_ID=quickscrap)
 *
 * Guarantees:
 * - Passes consistent resolved STORAGE_DIR to all portal processes.
 * - Records child PIDs in STORAGE_DIR/portal-processes.json for safe process teardown.
 * - Never deletes synthetic storage or evidence.
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

function loadEnvLocal() {
  const envLocalPath = path.resolve(__dirname, "..", ".env.local");
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
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

const portalsDir = path.resolve(__dirname, "..", "apps", "portals");
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

// Ensure storage directory is resolved consistently to an absolute path
const storageDir = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve(__dirname, "..", ".data");

if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

const PORTALS = [
  { id: "deccan", name: "Deccan E-Cycle", port: 3101, color: "\x1b[32m" },
  { id: "paperplus", name: "PaperPlus Kabadi", port: 3102, color: "\x1b[33m" },
  { id: "quickscrap", name: "QuickScrap Hyd", port: 3103, color: "\x1b[36m" },
];

const RESET = "\x1b[0m";
const children = [];
const processRecords = [];

console.log("==================================================================");
console.log("🚀 Starting ReCircuit Mock Recycler Portals...");
console.log(`- Resolved STORAGE_DIR: ${storageDir}`);
console.log("==================================================================\n");

PORTALS.forEach(({ id, name, port, color }) => {
  const env = {
    ...process.env,
    PORT: String(port),
    RECYCLER_ID: id,
    STORAGE_DIR: storageDir,
    NEXT_DIST_DIR: `.next-${port}`,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || "test-admin-secret-token",
    CAPTCHA_SECRET: process.env.CAPTCHA_SECRET || "test-captcha-secret-key-32chars!!",
  };

  const cmd = `${npmCmd} run dev -- -p ${port}`;
  const child = spawn(cmd, {
    cwd: portalsDir,
    env,
    shell: true,
  });

  processRecords.push({
    id,
    name,
    port,
    pid: child.pid,
    startTime: new Date().toISOString(),
  });

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach((line) => {
      if (line.trim()) {
        console.log(`${color}[${name}:${port}]${RESET} ${line}`);
      }
    });
  });

  child.stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach((line) => {
      if (line.trim()) {
        console.error(`${color}[${name}:${port} ERROR]${RESET} ${line}`);
      }
    });
  });

  child.on("close", (code) => {
    console.log(`${color}[${name}:${port}]${RESET} exited with code ${code}`);
  });

  children.push(child);
  console.log(`${color}✓ ${name}${RESET} listening on http://127.0.0.1:${port} (PID: ${child.pid})`);
});

// Write process manifest to storage directory for tracking and graceful teardown
const manifestPath = path.join(storageDir, "portal-processes.json");
fs.writeFileSync(manifestPath, JSON.stringify(processRecords, null, 2), "utf8");
console.log(`\n- Process manifest recorded to: ${manifestPath}`);
console.log("\nPress Ctrl+C to stop portals.\n");

let isShuttingDown = false;
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\n🛑 Stopping mock portals (preserving all storage and evidence)...");
  children.forEach((child) => {
    if (isWin && child.pid) {
      try {
        spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
      } catch {}
    } else if (child.pid) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  });
  setTimeout(() => process.exit(0), 800);
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => {
    if (chunk[0] === 3) {
      shutdown();
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

#!/usr/bin/env node

/**
 * scripts/start-portals.cjs
 * Cross-platform launcher that concurrently starts the 3 mock recycler portals:
 * - Deccan E-Cycle: http://localhost:3101
 * - PaperPlus Kabadi: http://localhost:3102
 * - QuickScrap Hyd: http://localhost:3103
 */

const { spawn } = require("child_process");
const path = require("path");

const portalsDir = path.resolve(__dirname, "..", "apps", "portals");
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

const PORTALS = [
  { id: "deccan", name: "Deccan E-Cycle", port: 3101, color: "\x1b[32m" },
  { id: "paperplus", name: "PaperPlus Kabadi", port: 3102, color: "\x1b[33m" },
  { id: "quickscrap", name: "QuickScrap Hyd", port: 3103, color: "\x1b[36m" },
];

const RESET = "\x1b[0m";
const children = [];

console.log("🚀 Starting ReRoute Mock Recycler Portals...\n");

PORTALS.forEach(({ id, name, port, color }) => {
  const env = {
    ...process.env,
    PORT: String(port),
    RECYCLER_ID: id,
    NEXT_DIST_DIR: `.next-${port}`,
  };

  const child = spawn(npmCmd, ["run", "dev", "--", "-p", String(port)], {
    cwd: portalsDir,
    env,
    shell: true,
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
  console.log(`${color}✓ ${name}${RESET} listening on http://localhost:${port}`);
});

console.log("\nPress Ctrl+C to stop all portals.\n");

function shutdown() {
  console.log("\n🛑 Stopping all portals...");
  children.forEach((child) => {
    if (isWin) {
      spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
    } else {
      child.kill("SIGTERM");
    }
  });
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);


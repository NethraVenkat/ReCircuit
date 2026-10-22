/**
 * scripts/tunnel.mjs
 *
 * Reproducible Cloudflare Tunnel launcher using pinned project dependency 'untun'.
 * Forwards a single public HTTPS tunnel to the loopback gateway at 127.0.0.1:3100.
 */

import { startTunnel } from "untun";

const TARGET_PORT = parseInt(process.env.GATEWAY_PORT || "3100", 10);
const TARGET_URL = `http://127.0.0.1:${TARGET_PORT}`;

console.log("==================================================================");
console.log(`🌐 Launching Reproducible Cloudflare Quick Tunnel`);
console.log(`- Forwarding target: ${TARGET_URL}`);
console.log("==================================================================\n");

let tunnel = null;
let isShuttingDown = false;

async function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\n🛑 Stopping Cloudflare Quick Tunnel gracefully...");
  if (tunnel) {
    try {
      await tunnel.close();
      console.log("✓ Cloudflare Tunnel closed cleanly.");
    } catch (err) {
      console.warn("Notice during tunnel close:", err.message);
    }
  }
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

async function main() {
  tunnel = await startTunnel({
    url: TARGET_URL,
    acceptCloudflareNotice: true,
  });

  const publicUrl = await tunnel.getURL();
  console.log(`\n==================================================================`);
  console.log(`  PUBLIC_TUNNEL_URL=${publicUrl}`);
  console.log(`==================================================================\n`);
  console.log(`- Deterministic Recycler Endpoints over Single Tunnel:`);
  console.log(`  * Deccan E-Cycle:   ${publicUrl}/portal/deccan/book-pickup`);
  console.log(`  * PaperPlus Kabadi: ${publicUrl}/portal/paperplus/schedule`);
  console.log(`  * QuickScrap Hyd:   ${publicUrl}/portal/quickscrap/pickup`);
  console.log(`\nPress Ctrl+C to stop tunnel gracefully.\n`);
}

main().catch((err) => {
  console.error("Tunnel error:", err);
  process.exit(1);
});

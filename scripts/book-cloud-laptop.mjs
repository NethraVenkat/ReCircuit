/**
 * scripts/book-cloud-laptop.mjs
 *
 * Stage 4-5 Cloud Execution: Approved Synthetic Laptop Booking & Verification.
 *
 * Prerequisites:
 * - Approved plan in .data/runs/<runId>/synthetic-laptop-plan.json
 * - Executes booking ONLY after user approval.
 * - Idempotently re-starts portals against the existing run storage directory.
 * - Opens temporary Cloudflare tunnel.
 * - Through Browserbase:
 *   1. Submits Deccan booking for the approved synthetic laptop plan.
 *   2. Extracts confirmed reference (DEC-xxxxx).
 *   3. Verifies physical storage destination in deccan.json.
 *   4. Opens second clean context/session to verify tracking status ("RECEIVED").
 * - Cleanly releases Browserbase sessions and shuts down tunnel.
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { chromium } from "playwright";
import { Browserbase } from "@browserbasehq/sdk";
import { startTunnel } from "untun";
import { createGatewayServer } from "./tunnel-gateway.mjs";

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
        if (process.env[key] === undefined || process.env[key] === "") {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const portalsDir = path.resolve(process.cwd(), "apps", "portals");

// Target storage directory (default or environment)
const storageDir = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve(process.cwd(), ".data", "runs", "cloud-live-20261022T105749");

const evidenceDir = path.join(storageDir, "evidence");
fs.mkdirSync(evidenceDir, { recursive: true });

const planPath = path.join(storageDir, "synthetic-laptop-plan.json");
if (!fs.existsSync(planPath)) {
  console.error(`FATAL: Approved plan file not found at ${planPath}`);
  process.exit(1);
}

const approvedPlan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const EXPECTED_APPROVED_HASH = "19773a8a6705ae8034818a461802d7508e13459d74e419d51fb93ca32342ce02";

if (approvedPlan.planHash !== EXPECTED_APPROVED_HASH) {
  console.error(`FATAL: Approved planHash mismatch!`);
  console.error(`Expected: ${EXPECTED_APPROVED_HASH}`);
  console.error(`Observed: ${approvedPlan.planHash}`);
  process.exit(1);
}

if (approvedPlan.legs[0].recyclerId !== "deccan") {
  console.error(`FATAL: Destination recycler mismatch! Expected deccan, got ${approvedPlan.legs[0].recyclerId}`);
  process.exit(1);
}

if (approvedPlan.totalEstimatedFee !== 180) {
  console.error(`FATAL: Total estimated fee mismatch! Expected 180, got ${approvedPlan.totalEstimatedFee}`);
  process.exit(1);
}

console.log("==================================================================");
console.log("  ReCircuit: Cloud Browser Booking & Verification Execution");
console.log("==================================================================");
console.log(`- Storage Directory: ${storageDir}`);
console.log(`- Approved Plan ID:   ${approvedPlan.id}`);
console.log(`- Approved Hash:      ${approvedPlan.planHash} (VALIDATED ✅)`);
console.log(`- Destination:        ${approvedPlan.legs[0].recyclerId}`);
console.log(`- Data Wipe Confirmed:${approvedPlan.dataWipeConfirmedByUser}`);
console.log(`- Start Time:         ${new Date().toISOString()}\n`);

const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();

const spawnedProcesses = [];
let gateway = null;
let tunnel = null;
let bb = null;
let bookingSessionId = "unknown";
let trackingSessionId = "unknown";

// Suppress unhandled rejection from untun's cloudflared child process exit
process.on("unhandledRejection", (err) => {
  if (err && String(err.message).includes("cloudflared exited")) return;
  console.warn("Unhandled rejection:", err);
});

async function cleanup() {
  console.log("\nInitiating teardown...");

  // 1. Release Browserbase Sessions
  if (bb) {
    for (const sid of [bookingSessionId, trackingSessionId]) {
      if (sid && sid !== "unknown") {
        try {
          console.log(`- Requesting release for session ${sid}...`);
          await bb.sessions.update(sid, { status: "REQUEST_RELEASE", projectId }).catch(() => {});
          const t = await bb.sessions.retrieve(sid).catch(() => null);
          console.log(`  * Session ${sid} terminal status: ${t?.status || "COMPLETED"}`);
        } catch {}
      }
    }
  }

  // 2. Close Tunnel
  if (tunnel) {
    try {
      console.log("- Closing Cloudflare tunnel...");
      await tunnel.close();
      console.log("  ✓ Cloudflare tunnel closed.");
    } catch {}
  }

  // 3. Close Gateway
  if (gateway) {
    try {
      console.log("- Closing gateway...");
      await gateway.closeGracefully();
      console.log("  ✓ Gateway closed.");
    } catch {}
  }

  // 4. Terminate Portals
  console.log("- Terminating mock portals...");
  for (const p of spawnedProcesses) {
    if (p.child) {
      if (p.child.stdout) p.child.stdout.destroy();
      if (p.child.stderr) p.child.stderr.destroy();
      if (p.pid) {
        if (isWin) {
          try {
            spawn("taskkill", ["/pid", String(p.pid), "/f", "/t"]);
          } catch {}
        } else {
          try {
            p.child.kill("SIGTERM");
          } catch {}
        }
      }
    }
  }
  console.log("  ✓ Portals stopped. Evidence preserved.");
}

async function main() {
  // Step 1: Start Portals
  console.log("--- 1. Starting Portals against approved storage directory ---");
  const PORT_CONFIGS = [
    { id: "deccan", port: 3101, name: "Deccan E-Cycle" },
    { id: "paperplus", port: 3102, name: "PaperPlus Kabadi" },
    { id: "quickscrap", port: 3103, name: "QuickScrap Hyd" },
  ];

  for (const { id, port, name } of PORT_CONFIGS) {
    const env = {
      ...process.env,
      PORT: String(port),
      RECYCLER_ID: id,
      STORAGE_DIR: storageDir,
      NEXT_DIST_DIR: `.next-${port}`,
      ADMIN_TOKEN: "test-admin-secret-token",
      CAPTCHA_SECRET: "test-captcha-secret-key-32chars!!",
    };

    const child = spawn(`${npmCmd} run dev -- -p ${port}`, {
      cwd: portalsDir,
      env,
      shell: true,
    });
    spawnedProcesses.push({ id, port, name, child, pid: child.pid });
  }

  // Health poll
  for (const { id, port } of PORT_CONFIGS) {
    const start = Date.now();
    let ready = false;
    while (Date.now() - start < 45000) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) {
          const h = await res.json();
          if (h.storageDir === storageDir) {
            ready = true;
            break;
          }
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!ready) throw new Error(`Portal ${id} failed health verification`);
    console.log(`  ✓ Portal ${id} ready on port ${port}`);
  }

  // Step 2: Start Gateway
  gateway = createGatewayServer();
  await new Promise((resolve) => gateway.listen(3100, "127.0.0.1", resolve));
  console.log("  ✓ Gateway active on 127.0.0.1:3100");

  // Pre-warm Next.js JIT routes to prevent cold compilation timeouts
  console.log("- Pre-warming JIT routes locally on loopback...");
  await Promise.all([
    fetch("http://127.0.0.1:3100/portal/deccan/book-pickup").catch(() => {}),
    fetch("http://127.0.0.1:3100/portal/deccan/book-pickup/confirmation?ref=DEC-00000").catch(() => {}),
    fetch("http://127.0.0.1:3100/portal/deccan/track?ref=DEC-00000").catch(() => {}),
    fetch("http://127.0.0.1:3100/_next/static/chunks/app/track/page.js").catch(() => {}),
  ]);
  console.log("  ✓ Deccan routes pre-warmed.\n");

  // Step 3: Start Tunnel
  tunnel = await startTunnel({
    url: "http://127.0.0.1:3100",
    acceptCloudflareNotice: true,
  });
  const publicUrl = await tunnel.getURL();
  console.log(`  ✓ Cloudflare Tunnel active: ${publicUrl}\n`);

  // Validate replacement origin against expected mock recycler identity with bounded retry for DNS propagation
  console.log(`- Validating replacement origin ${publicUrl} against mock recycler identity...`);
  let originCheckOk = false;
  const startCheck = Date.now();
  let lastError = "";
  while (Date.now() - startCheck < 30000) {
    try {
      const originCheckRes = await fetch(`${publicUrl}/portal/deccan/book-pickup`);
      if (originCheckRes.ok) {
        const originCheckHtml = await originCheckRes.text();
        if (originCheckHtml.includes("Deccan E-Cycle")) {
          originCheckOk = true;
          break;
        } else {
          lastError = "Response HTML did not include Deccan E-Cycle";
        }
      } else {
        lastError = `HTTP ${originCheckRes.status}`;
      }
    } catch (e) {
      lastError = e.message;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (!originCheckOk) {
    throw new Error(`Replacement origin validation failed for ${publicUrl} within 30s: ${lastError}`);
  }
  console.log("  ✓ Replacement origin validated: Deccan E-Cycle identity confirmed.\n");

  // Step 4: Browserbase Cloud Booking Session
  console.log("--- 2. Connecting Browserbase Cloud Session for Booking Execution ---");
  bb = new Browserbase({ apiKey });
  const bSession = await bb.sessions.create({ projectId, keepAlive: false });
  bookingSessionId = bSession.id;
  console.log(`  ✓ Booking Session ID: ${bookingSessionId}`);

  const browser = await chromium.connectOverCDP(bSession.connectUrl, { timeout: 45000 });
  const context = (await browser.contexts())[0] || (await browser.newContext());
  const page = (await context.pages())[0] || (await context.newPage());
  page.setDefaultTimeout(30000);

  const targetBookingUrl = `${publicUrl}/portal/deccan/book-pickup`;
  console.log(`  * Navigating to ${targetBookingUrl}...`);
  await page.goto(targetBookingUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="booking-form"][data-hydrated="true"]', { timeout: 45000 });

  // Assert fee matches approved plan fee (₹180)
  const feeText = (await page.locator('[data-testid="portal-computed-fee"]').textContent())?.trim();
  console.log(`  * Observed portal computed fee: "${feeText}"`);
  if (!feeText.includes(String(approvedPlan.totalEstimatedFee))) {
    throw new Error(`Fee mismatch! Expected ₹${approvedPlan.totalEstimatedFee}, observed "${feeText}"`);
  }

  console.log("  * Filling customer booking details...");
  await page.fill('[data-testid="input-fullname"]', "Synthetic Laptop Donor");
  await page.fill('[data-testid="input-phone"]', "9876543210");
  await page.fill('[data-testid="input-address"]', "Flat 402, Cyber Tower");
  await page.fill('[data-testid="input-locality"]', "Madhapur");
  await page.selectOption('[data-testid="input-pincode"]', "500081");
  try {
    await page.selectOption('[data-testid="select-slot"]', "2026-10-25 (10:00–12:00 IST)");
  } catch {
    await page.selectOption('[data-testid="select-slot"]', { index: 4 });
  }
  await page.check('[data-testid="data-wipe-ack"]');

  // --- Synchronize Consignment Items with Approved Plan (Prevent Silent Default Substitution) ---
  console.log("  * Clearing pre-populated portal default items to avoid silent substitution...");
  const removeBtns = page.locator('[data-testid="remove-item"]');
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await removeBtns.count();
    if (count === 0) break;
    await removeBtns.first().click().catch(() => {});
    await page.locator('[data-testid="item-row"]').first().waitFor({ state: "detached", timeout: 2000 }).catch(() => {});
  }

  const approvedLegItems = approvedPlan.legs[0]?.items || [];
  console.log(`  * Populating ${approvedLegItems.length} approved item(s) from canonical plan...`);
  for (const item of approvedLegItems) {
    const itemName = item.name || item.description || (item.category ? `Synthetic ${item.category}` : "Synthetic Laptop");
    const itemQty = item.quantity ?? 1;
    const itemWeight = item.estimatedWeightKg ?? 2.5;

    await page.fill('[data-testid="input-item-name"]', itemName);
    await page.fill('[data-testid="input-item-qty"]', String(itemQty));
    await page.fill('[data-testid="input-item-weight"]', String(itemWeight));
    const prevCount = await page.locator('[data-testid="item-row"]').count();
    await page.click('[data-testid="add-item"]');
    await page.locator('[data-testid="item-row"]').nth(prevCount).waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  }

  // --- Pre-Submission DOM Readback Verification for Item Fidelity ---
  const renderedItemRows = await page.locator('[data-testid="item-row"]').all();
  if (renderedItemRows.length !== approvedLegItems.length) {
    throw new Error(`DOM Readback Error: expected ${approvedLegItems.length} item rows, found ${renderedItemRows.length}`);
  }
  for (let i = 0; i < approvedLegItems.length; i++) {
    const exp = approvedLegItems[i];
    const row = renderedItemRows[i];
    const rowQty = (await row.locator('[data-testid="item-row-qty"]').textContent()) || "";
    const rowWeight = (await row.locator('[data-testid="item-row-weight"]').textContent()) || "";
    const parsedQty = parseInt(rowQty.replace(/\D+/g, ""), 10);
    const parsedWeight = parseFloat(rowWeight.replace(/[^\d.]/g, ""));
    if (parsedQty !== exp.quantity) {
      throw new Error(`DOM Readback quantity mismatch: expected ${exp.quantity}, got ${parsedQty}`);
    }
    if (Math.abs(parsedWeight - exp.estimatedWeightKg) > 0.01) {
      throw new Error(`DOM Readback weight mismatch: expected ${exp.estimatedWeightKg} kg, got ${parsedWeight} kg`);
    }
  }
  console.log("  ✓ Item fidelity verified in pre-submission DOM readback (2.5 kg synthetic laptop confirmed).");
  await page.screenshot({ path: path.join(evidenceDir, "booking-form-filled.png") });

  console.log("  * Submitting booking...");
  await page.click('[data-testid="confirm-booking"]');

  await page.waitForURL(/.*confirmation.*/, { timeout: 30000 });
  const bookingRef = (await page.locator('[data-testid="booking-reference"]').textContent())?.trim();
  console.log(`  ✓ Booking Confirmed! Reference: "${bookingRef}"`);
  await page.screenshot({ path: path.join(evidenceDir, "booking-confirmation.png") });

  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  // Step 5: Verify on disk
  console.log("\n--- 3. Verifying Physical Storage on Disk ---");
  const deccanJsonPath = path.join(storageDir, "deccan.json");
  if (!fs.existsSync(deccanJsonPath)) {
    throw new Error(`deccan.json does not exist at ${deccanJsonPath}!`);
  }
  const deccanData = JSON.parse(fs.readFileSync(deccanJsonPath, "utf8"));
  const storedBooking = deccanData.bookings.find((b) => b.bookingReference === bookingRef);
  if (!storedBooking) {
    throw new Error(`Booking reference ${bookingRef} not found in deccan.json!`);
  }
  if (storedBooking.status !== "RECEIVED") {
    throw new Error(`Invalid initial booking status! Expected RECEIVED, got "${storedBooking.status}"`);
  }
  if (storedBooking.status === "PICKED_UP" || storedBooking.status === "WEIGHED" || storedBooking.status === "COLLECTED") {
    throw new Error(`CRITICAL INVARIANT VIOLATION: Stored booking was prematurely marked as collected/picked up!`);
  }
  console.log(`  ✓ Booking found in deccan.json:`);
  console.log(`    - Reference:  ${storedBooking.bookingReference}`);
  console.log(`    - Recycler:   ${storedBooking.recyclerId}`);
  console.log(`    - Status:     ${storedBooking.status} (Verified NOT collected)`);
  console.log(`    - Fee:        ₹${storedBooking.chargedFeeInr || storedBooking.computedFeeInr || 180}`);
  console.log(`    - Locality:   ${storedBooking.locality}`);

  // Step 6: Second Cloud Session for Independent Tracking Verification
  console.log("\n--- 4. Opening Second Cloud Session for Independent Tracking Verification ---");
  const tSession = await bb.sessions.create({ projectId, keepAlive: false });
  trackingSessionId = tSession.id;
  console.log(`  ✓ Tracking Session ID: ${trackingSessionId}`);

  const tBrowser = await chromium.connectOverCDP(tSession.connectUrl, { timeout: 45000 });
  const tContext = (await tBrowser.contexts())[0] || (await tBrowser.newContext());
  const tPage = (await tContext.pages())[0] || (await tContext.newPage());
  tPage.setDefaultTimeout(60000);

  const trackingUrl = `${publicUrl}/portal/deccan/track?ref=${bookingRef}`;
  console.log(`  * Navigating to tracking URL: ${trackingUrl}...`);
  await tPage.goto(trackingUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await tPage.waitForSelector('[data-testid="tracking-status"]', { timeout: 60000 });

  const statusText = (await tPage.locator('[data-testid="tracking-status"]').textContent())?.trim();
  console.log(`  * Observed Tracking Status: "${statusText}"`);
  if (!statusText.includes("RECEIVED")) {
    throw new Error(`Tracking status mismatch! Expected RECEIVED, got "${statusText}"`);
  }
  if (statusText.includes("COLLECTED") || statusText.includes("PICKED_UP") || statusText.includes("WEIGHED")) {
    throw new Error(`CRITICAL INVARIANT VIOLATION: Tracking status unexpectedly marked as collected/picked up!`);
  }
  // Independent item fidelity check on tracking page
  const trackingItemRows = await tPage.locator('[data-testid="tracking-item-row"]').all();
  if (trackingItemRows.length !== approvedLegItems.length) {
    throw new Error(`Tracking verification error: expected ${approvedLegItems.length} item rows, found ${trackingItemRows.length}`);
  }
  for (let i = 0; i < approvedLegItems.length; i++) {
    const exp = approvedLegItems[i];
    const row = trackingItemRows[i];
    const details = (await row.locator('[data-testid="tracking-item-details"]').textContent()) || "";
    const parsedQty = parseInt(details.match(/Qty:\s*(\d+)/i)?.[1] || "0", 10);
    const parsedWeight = parseFloat(details.match(/Weight:\s*([\d.]+)\s*kg/i)?.[1] || "0");
    if (parsedQty !== exp.quantity) {
      throw new Error(`Tracking item quantity mismatch: expected ${exp.quantity}, got ${parsedQty}`);
    }
    if (Math.abs(parsedWeight - exp.estimatedWeightKg) > 0.01) {
      throw new Error(`Tracking item weight mismatch: expected ${exp.estimatedWeightKg} kg, got ${parsedWeight} kg`);
    }
  }
  console.log("  ✓ Tracking page item fidelity verified: observed items match approved 2.5 kg laptop.");
  await tPage.screenshot({ path: path.join(evidenceDir, "tracking-verified.png") });
  console.log(`  ✓ Independent Tracking Verified: Status is "${statusText}" (Confirmed NOT collected) ✅\n`);

  await tPage.close().catch(() => {});
  await tContext.close().catch(() => {});
  await tBrowser.close().catch(() => {});

  const bookingResult = {
    bookingReference: bookingRef,
    status: statusText,
    planId: approvedPlan.id,
    planHash: approvedPlan.planHash,
    recyclerId: "deccan",
    fee: storedBooking.chargedFeeInr || storedBooking.computedFeeInr || 180,
    bookingSessionId,
    trackingSessionId,
    completedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(storageDir, "booking-execution-result.json"),
    JSON.stringify(bookingResult, null, 2),
    "utf8"
  );

  console.log("==================================================================");
  console.log("  ALL BOOKING AND VERIFICATION STAGES COMPLETED SUCCESSFULLY ✅");
  console.log("==================================================================");
}

main()
  .catch((err) => {
    console.error("FATAL ERROR during booking execution:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });

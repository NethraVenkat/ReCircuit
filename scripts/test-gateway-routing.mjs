/**
 * scripts/test-gateway-routing.mjs
 *
 * Comprehensive verification of:
 * 1. Gateway Security & Validation Guards:
 *    - Strict loopback binding (127.0.0.1)
 *    - Allowed vs alternate HTTP methods (405 rejection for PUT, DELETE, PATCH, TRACE)
 *    - Admin / Reset route protection against encoded paths, trailing slashes, alternate methods (403)
 *    - Portal validation (/portal/:tenant: unknown tenant -> 404, cross-tenant route -> 400)
 *    - Conflicting explicit tenant selectors detection (400 ConflictingTenantSelectors)
 *    - Fail-closed behavior on ambiguous routing (400 Bad Request)
 * 2. Multi-Tab Same Browser Context Isolation:
 *    - Two different recycler tabs in the EXACT SAME browser context
 *    - Open Deccan, then PaperPlus
 *    - Return to Deccan, compute fee and submit synthetic booking
 *    - Repeat in reverse order (QuickScrap then Deccan) and with concurrent API requests
 *    - Assert intended recycler and actual storage destination (no cross-tab cookie clobbering)
 * 3. Physical On-Disk Storage Assertions:
 *    - deccan.json, paperplus.json, quickscrap.json in run-specific directory
 *    - Zero cross-contamination across files
 * 4. Graceful Process Teardown & Event Loop Draining:
 *    - Observable server startup & measured JIT route warmup
 *    - Bounded per-action navigation timeouts
 *    - Complete stream destruction and process tree termination
 *    - Zero process.exit(0) mask; natural event loop exit
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import http from "http";
import crypto from "crypto";
import { spawn } from "child_process";
import { chromium } from "playwright";
import { createGatewayServer, normalizePath, isBlockedRoute } from "./tunnel-gateway.mjs";

const TEST_RUN_ID = `test-gateway-${Date.now()}`;
const STORAGE_DIR = path.resolve(process.cwd(), ".data", "runs", TEST_RUN_ID);
fs.mkdirSync(STORAGE_DIR, { recursive: true });

console.log("==================================================================");
console.log("  ReCircuit: Gateway Security & Multi-Tenant Routing Test Suite");
console.log(`- Test Run ID: ${TEST_RUN_ID}`);
console.log(`- Synthetic Storage: ${STORAGE_DIR}`);
console.log("==================================================================\n");

async function testSecurityGuards() {
  console.log("--- 1. Testing Gateway Security Guards, Route Validation & Conflict Detection ---");
  const server = createGatewayServer();
  await new Promise((resolve) => server.listen(3198, "127.0.0.1", resolve));

  try {
    // 1. Alternate HTTP methods (Method Allowlist)
    for (const m of ["DELETE", "PUT", "PATCH"]) {
      const res = await fetch("http://127.0.0.1:3198/api/bookings", { method: m });
      assert.strictEqual(res.status, 405, `Expected 405 for method ${m}`);
      console.log(`  ✓ Method ${m} rejected with 405 Method Not Allowed`);
    }

    const traceStatus = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: 3198, path: "/api/bookings", method: "TRACE" },
        (res) => resolve(res.statusCode)
      );
      req.on("error", reject);
      req.end();
    });
    assert.strictEqual(traceStatus, 405, "Expected 405 for TRACE");
    console.log("  ✓ Method TRACE rejected with 405 Method Not Allowed");

    // 2. Admin & Reset route variations
    const blockedPaths = [
      "/admin",
      "/admin/",
      "/admin//",
      "/admin/subpath",
      "/api/admin",
      "/api/admin/",
      "/api/admin/switches",
      "/api/reset",
      "/api/reset/",
      "/%61dmin",             // URL-encoded 'a'
      "/admin/%2e%2e/admin",  // Path traversal
      "/api/%72eset",         // URL-encoded 'r'
      "/portal/deccan/admin", // Admin under portal prefix
      "/portal/deccan/api/reset", // Reset under portal prefix
    ];

    for (const p of blockedPaths) {
      for (const m of ["GET", "POST"]) {
        const res = await fetch(`http://127.0.0.1:3198${p}`, { method: m });
        assert.strictEqual(res.status, 403, `Expected 403 for ${m} ${p}, got ${res.status}`);
      }
      console.log(`  ✓ Blocked administrative path: ${p} (403 Forbidden across GET & POST)`);
    }

    // 3. /portal/* validation: Unknown tenant -> 404
    const resUnknownTenant = await fetch("http://127.0.0.1:3198/portal/unknownrecycler/schedule");
    assert.strictEqual(resUnknownTenant.status, 404, "Expected 404 for unknown tenant in /portal/*");
    const jsonUnknown = await resUnknownTenant.json();
    assert.strictEqual(jsonUnknown.error, "UnknownTenant");
    console.log("  ✓ Unknown tenant in /portal/* rejected with 404 Not Found (UnknownTenant)");

    // 4. /portal/* validation: Disallowed route for tenant -> 400
    const resDisallowedRoute = await fetch("http://127.0.0.1:3198/portal/deccan/schedule");
    assert.strictEqual(resDisallowedRoute.status, 400, "Expected 400 for cross-tenant route");
    const jsonDisallowed = await resDisallowedRoute.json();
    assert.strictEqual(jsonDisallowed.error, "RouteNotPermittedForTenant");
    console.log("  ✓ Disallowed cross-tenant route /portal/deccan/schedule rejected with 400 Bad Request");

    // 5. Conflicting explicit tenant selectors -> 400
    // Case A: Path deccan vs Header paperplus
    const resConflictHeader = await fetch("http://127.0.0.1:3198/portal/deccan/api/fee?weight=5", {
      headers: { "x-recycler-id": "paperplus" },
    });
    assert.strictEqual(resConflictHeader.status, 400, "Expected 400 for conflicting header vs path");
    const jsonConflictHeader = await resConflictHeader.json();
    assert.strictEqual(jsonConflictHeader.error, "ConflictingTenantSelectors");
    console.log("  ✓ Conflicting explicit selectors (path 'deccan' vs header 'paperplus') rejected with 400");

    // Case B: Path deccan vs Ref PPK- (paperplus)
    const resConflictRef = await fetch("http://127.0.0.1:3198/portal/deccan/track?ref=PPK-12345");
    assert.strictEqual(resConflictRef.status, 400, "Expected 400 for conflicting ref vs path");
    const jsonConflictRef = await resConflictRef.json();
    assert.strictEqual(jsonConflictRef.error, "ConflictingTenantSelectors");
    console.log("  ✓ Conflicting explicit selectors (path 'deccan' vs ref 'PPK-') rejected with 400");

    // 6. Ambiguous Routing Fails Closed
    const resAmbiguousRoot = await fetch("http://127.0.0.1:3198/");
    assert.strictEqual(resAmbiguousRoot.status, 400, "Expected 400 for naked / without tenant");
    const jsonRoot = await resAmbiguousRoot.json();
    assert.strictEqual(jsonRoot.error, "AmbiguousTenantRouting");
    console.log("  ✓ Naked root request without tenant identity failed closed (400 Bad Request)");

    const resAmbiguousApi = await fetch("http://127.0.0.1:3198/api/fee?weight=5");
    assert.strictEqual(resAmbiguousApi.status, 400, "Expected 400 for naked /api/fee without tenant");
    console.log("  ✓ Naked shared API request without tenant identity failed closed (400 Bad Request)");

    console.log("Security guard, validation, and conflict tests PASSED cleanly. ✅\n");
  } finally {
    await server.closeGracefully();
  }
}

async function testConcurrentPortals() {
  console.log("--- 2. Testing Multi-Tab Same Browser Context Isolation & Storage Integrity ---");

  const portalsDir = path.resolve(process.cwd(), "apps", "portals");
  const isWin = process.platform === "win32";
  const npmCmd = isWin ? "npm.cmd" : "npm";

  const spawnedProcesses = [];
  const PORT_CONFIGS = [
    { id: "deccan", port: 3101, name: "Deccan E-Cycle" },
    { id: "paperplus", port: 3102, name: "PaperPlus Kabadi" },
    { id: "quickscrap", port: 3103, name: "QuickScrap Hyd" },
  ];

  console.log(`- Spawning mock portals on ports 3101, 3102, 3103 with STORAGE_DIR=${STORAGE_DIR}...`);
  for (const { id, port, name } of PORT_CONFIGS) {
    const env = {
      ...process.env,
      PORT: String(port),
      RECYCLER_ID: id,
      STORAGE_DIR,
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

  // Record process IDs in storage directory
  fs.writeFileSync(
    path.join(STORAGE_DIR, "portal-processes.json"),
    JSON.stringify(spawnedProcesses.map((p) => ({ id: p.id, port: p.port, name: p.name, pid: p.pid })), null, 2),
    "utf8"
  );

  let gateway = null;
  let browser = null;

  try {
    // Phase 1: Observable Health Verification
    console.log("- Waiting for portals to report healthy and verifying STORAGE_DIR...");
    const startupStart = Date.now();
    for (const { id, port } of PORT_CONFIGS) {
      const start = Date.now();
      let ready = false;
      while (Date.now() - start < 45000) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/api/health`);
          if (res.ok) {
            const health = await res.json();
            assert.strictEqual(
              health.storageDir,
              STORAGE_DIR,
              `Portal ${id} storageDir mismatch! Expected ${STORAGE_DIR}, got ${health.storageDir}`
            );
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1000));
      }
      assert.ok(ready, `Portal ${id} on port ${port} failed to report healthy within 45s`);
      console.log(`  ✓ Portal ${id} ready on port ${port} (STORAGE_DIR resolved: ${STORAGE_DIR})`);
    }
    const startupDuration = ((Date.now() - startupStart) / 1000).toFixed(1);
    console.log(`  ✓ All portals verified healthy in ${startupDuration}s.`);

    // Start Gateway on 3100
    gateway = createGatewayServer();
    await new Promise((resolve) => gateway.listen(3100, "127.0.0.1", resolve));
    console.log("  ✓ Gateway active on http://127.0.0.1:3100");

    // Phase 2: Measured JIT Route Warmup
    console.log("- Pre-warming Next.js JIT routes before browser tests...");
    const warmupStart = Date.now();
    await Promise.all([
      fetch("http://127.0.0.1:3100/portal/deccan/book-pickup").catch(() => {}),
      fetch("http://127.0.0.1:3100/portal/deccan/book-pickup/confirmation?ref=DEC-00000").catch(() => {}),
      fetch("http://127.0.0.1:3100/portal/deccan/track?ref=DEC-00000").catch(() => {}),
      fetch("http://127.0.0.1:3100/portal/paperplus/schedule").catch(() => {}),
      fetch("http://127.0.0.1:3100/portal/paperplus/status?ref=PPK-00000").catch(() => {}),
      fetch("http://127.0.0.1:3100/portal/quickscrap/pickup").catch(() => {}),
      fetch("http://127.0.0.1:3100/portal/quickscrap/pickup/thanks?ref=QSH-00000").catch(() => {}),
      fetch("http://127.0.0.1:3100/portal/quickscrap/track-order?ref=QSH-00000").catch(() => {}),
    ]);
    const warmupDuration = ((Date.now() - warmupStart) / 1000).toFixed(1);
    console.log(`  ✓ Next.js routes pre-warmed in ${warmupDuration}s.\n`);

    // Phase 3: Focused Browser Multi-Tab Execution
    browser = await chromium.launch({ headless: true });
    const sharedContext = await browser.newContext();

    // Tab 1: Open Deccan
    console.log("  * Tab 1: Opening Deccan E-Cycle at /portal/deccan/book-pickup...");
    const tabDeccan = await sharedContext.newPage();
    tabDeccan.setDefaultTimeout(15000);
    await tabDeccan.goto("http://127.0.0.1:3100/portal/deccan/book-pickup", { waitUntil: "domcontentloaded" });
    const decText = await tabDeccan.locator("body").innerText();
    assert.ok(decText.includes("Deccan E-Cycle"), "Expected Deccan brand in Tab 1");
    await tabDeccan.waitForSelector('[data-testid="booking-form"][data-hydrated="true"]', { timeout: 15000 });
    console.log("  ✓ Tab 1 loaded Deccan E-Cycle and hydrated successfully");

    // Tab 2: Open PaperPlus in the SAME context
    console.log("  * Tab 2: Opening PaperPlus Kabadi at /portal/paperplus/schedule in SAME context...");
    const tabPaperPlus = await sharedContext.newPage();
    tabPaperPlus.setDefaultTimeout(15000);
    await tabPaperPlus.goto("http://127.0.0.1:3100/portal/paperplus/schedule", { waitUntil: "domcontentloaded" });
    const ppText = await tabPaperPlus.locator("body").innerText();
    assert.ok(ppText.includes("PaperPlus Kabadi"), "Expected PaperPlus brand in Tab 2");
    await tabPaperPlus.waitForSelector('[data-testid="booking-form"][data-hydrated="true"]', { timeout: 15000 });
    console.log("  ✓ Tab 2 loaded PaperPlus Kabadi in the same browser context");

    // Return to Tab 1 (Deccan) and request fee & submit booking
    console.log("  * Returning to Tab 1 (Deccan) to request fee and submit synthetic booking...");
    await tabDeccan.bringToFront();

    const decFeeText = await tabDeccan.locator('[data-testid="portal-computed-fee"]').textContent();
    assert.ok(decFeeText.includes("180"), `Expected Deccan fee ₹180, observed: "${decFeeText}"`);
    console.log(`  ✓ Tab 1 verified Deccan-specific fee: "${decFeeText.trim()}" (not contaminated by Tab 2)`);

    await tabDeccan.fill('[data-testid="input-fullname"]', "MultiTab Deccan User");
    await tabDeccan.fill('[data-testid="input-phone"]', "9876543210");
    await tabDeccan.fill('[data-testid="input-address"]', "Plot 42, Hitec City");
    await tabDeccan.fill('[data-testid="input-locality"]', "Madhapur");
    await tabDeccan.selectOption('[data-testid="select-slot"]', { index: 1 });
    await tabDeccan.check('[data-testid="data-wipe-ack"]');
    await tabDeccan.click('[data-testid="confirm-booking"]');

    await tabDeccan.waitForURL(/.*confirmation.*/, { timeout: 30000 });
    const decRef = (await tabDeccan.locator('[data-testid="booking-reference"]').textContent())?.trim();
    assert.match(decRef, /^DEC-\d{5}$/, `Expected DEC-xxxxx reference, got: ${decRef}`);
    console.log(`  ✓ Tab 1 submitted Deccan booking successfully: "${decRef}"`);

    const deccanJsonPath = path.join(STORAGE_DIR, "deccan.json");
    const paperplusJsonPath = path.join(STORAGE_DIR, "paperplus.json");
    assert.ok(fs.existsSync(deccanJsonPath), "Expected deccan.json to exist");
    const deccanStore = JSON.parse(fs.readFileSync(deccanJsonPath, "utf8"));
    const deccanBooking = deccanStore.bookings.find((b) => b.bookingReference === decRef);
    assert.ok(deccanBooking, `Booking ${decRef} was NOT found in deccan.json!`);

    if (fs.existsSync(paperplusJsonPath)) {
      const ppStore = JSON.parse(fs.readFileSync(paperplusJsonPath, "utf8"));
      const leakedBooking = ppStore.bookings.find((b) => b.bookingReference === decRef);
      assert.ok(!leakedBooking, `CRITICAL LEAK: Deccan booking ${decRef} leaked into paperplus.json!`);
    }
    console.log(`  ✓ Storage Destination Verified: Booking "${decRef}" resides exclusively in deccan.json ✅`);

    // Reverse order in same context (QuickScrap then Deccan)
    console.log("\n- Testing Reverse Order in SAME Context (QuickScrap then Deccan)...");
    const tabQuickScrap = await sharedContext.newPage();
    tabQuickScrap.setDefaultTimeout(15000);
    await tabQuickScrap.goto("http://127.0.0.1:3100/portal/quickscrap/pickup", { waitUntil: "domcontentloaded" });
    await tabQuickScrap.waitForSelector('[data-testid="booking-form"][data-hydrated="true"]', { timeout: 15000 });
    console.log("  ✓ Tab 3 loaded QuickScrap Hyd");

    const tabDeccan2 = await sharedContext.newPage();
    tabDeccan2.setDefaultTimeout(15000);
    await tabDeccan2.goto("http://127.0.0.1:3100/portal/deccan/book-pickup", { waitUntil: "domcontentloaded" });
    await tabDeccan2.waitForSelector('[data-testid="booking-form"][data-hydrated="true"]', { timeout: 15000 });
    console.log("  ✓ Tab 4 loaded Deccan E-Cycle in same context");

    await tabQuickScrap.bringToFront();
    const qsFeeText = await tabQuickScrap.locator('[data-testid="portal-computed-fee"]').textContent();
    assert.ok(qsFeeText.includes("50"), `Expected QuickScrap fee ₹50, observed: "${qsFeeText}"`);
    console.log(`  ✓ Tab 3 verified QuickScrap fee ₹50: "${qsFeeText.trim()}"`);

    await tabQuickScrap.fill('[data-testid="input-fullname"]', "MultiTab QuickScrap User");
    await tabQuickScrap.fill('[data-testid="input-phone"]', "9800011122");
    await tabQuickScrap.fill('[data-testid="input-address"]', "Plot 99, Secunderabad");
    await tabQuickScrap.fill('[data-testid="input-locality"]', "Secunderabad");
    await tabQuickScrap.selectOption('[data-testid="select-slot"]', { index: 1 });
    await tabQuickScrap.click('[data-testid="confirm-booking"]');

    await tabQuickScrap.waitForURL(/.*pickup\/thanks.*/, { timeout: 30000 });
    const qsRef = (await tabQuickScrap.locator('[data-testid="booking-reference"]').textContent())?.trim();
    assert.match(qsRef, /^QSH-\d{5}$/, `Expected QSH-xxxxx reference, got: ${qsRef}`);
    console.log(`  ✓ Tab 3 submitted QuickScrap booking successfully: "${qsRef}"`);

    const quickscrapJsonPath = path.join(STORAGE_DIR, "quickscrap.json");
    assert.ok(fs.existsSync(quickscrapJsonPath), "Expected quickscrap.json to exist");
    const qsStore = JSON.parse(fs.readFileSync(quickscrapJsonPath, "utf8"));
    const qsBooking = qsStore.bookings.find((b) => b.bookingReference === qsRef);
    assert.ok(qsBooking, `Booking ${qsRef} was NOT found in quickscrap.json!`);
    console.log(`  ✓ Storage Destination Verified: Booking "${qsRef}" resides exclusively in quickscrap.json ✅`);

    // Concurrent API requests in same context
    console.log("\n- Testing Concurrent Cross-Tenant Requests in SAME Browser Context...");
    const [feeDecRes, feeQsRes] = await Promise.all([
      tabDeccan.evaluate(async () => {
        const res = await fetch("/portal/deccan/api/fee?weight=2.2", {
          headers: { "x-recycler-id": "deccan" },
        });
        return res.json();
      }),
      tabQuickScrap.evaluate(async () => {
        const res = await fetch("/portal/quickscrap/api/fee?weight=2.2", {
          headers: { "x-recycler-id": "quickscrap" },
        });
        return res.json();
      }),
    ]);

    assert.strictEqual(feeDecRes.recyclerId, "deccan");
    assert.strictEqual(feeDecRes.fee, 180, "Expected Deccan fee to be ₹180");
    assert.strictEqual(feeQsRes.recyclerId, "quickscrap");
    assert.strictEqual(feeQsRes.fee, 50, "Expected QuickScrap fee to be ₹50");
    console.log("  ✓ Concurrent requests dispatched in same context resolved to correct upstreams without cross-talk ✅");

    // Clean context direct tracking readback
    console.log("\n- Testing Direct Tracking URLs on clean context without cookies or referer...");
    const cleanContext = await browser.newContext({ extraHTTPHeaders: { Referer: "" } });
    const cleanPage = await cleanContext.newPage();
    cleanPage.setDefaultTimeout(15000);

    await cleanPage.goto(`http://127.0.0.1:3100/portal/deccan/track?ref=${decRef}`, { waitUntil: "domcontentloaded" });
    await cleanPage.locator('[data-testid="tracking-status"]').waitFor({ state: "visible", timeout: 30000 });
    const decCleanStatus = (await cleanPage.locator('[data-testid="tracking-status"]').textContent())?.trim();
    assert.ok(decCleanStatus === "RECEIVED" || decCleanStatus === "CONFIRMED");
    console.log(`  ✓ Deccan tracking URL resolved directly: "${decCleanStatus}"`);

    await cleanPage.goto(`http://127.0.0.1:3100/portal/quickscrap/track-order?ref=${qsRef}`, { waitUntil: "domcontentloaded" });
    await cleanPage.locator('[data-testid="tracking-status"]').waitFor({ state: "visible", timeout: 30000 });
    const qsCleanStatus = (await cleanPage.locator('[data-testid="tracking-status"]').textContent())?.trim();
    assert.ok(qsCleanStatus === "RECEIVED" || qsCleanStatus === "CONFIRMED");
    console.log(`  ✓ QuickScrap tracking URL resolved directly: "${qsCleanStatus}"`);

    // Physical On-Disk Cross-Contamination Audit
    console.log("\n--- 3. Verifying Physical Storage Cross-Contamination Audit ---");
    const decFinalStore = JSON.parse(fs.readFileSync(deccanJsonPath, "utf8"));
    const qsFinalStore = JSON.parse(fs.readFileSync(quickscrapJsonPath, "utf8"));

    assert.ok(!decFinalStore.bookings.some((b) => b.bookingReference.startsWith("QSH-")), "Contamination in deccan.json!");
    assert.ok(!qsFinalStore.bookings.some((b) => b.bookingReference.startsWith("DEC-")), "Contamination in quickscrap.json!");
    console.log(`  ✓ deccan.json verified clean: ${decFinalStore.bookings.length} bookings (isolated)`);
    console.log(`  ✓ quickscrap.json verified clean: ${qsFinalStore.bookings.length} bookings (isolated)`);

    console.log("\n==================================================================");
    console.log("  ALL MULTI-TAB & GATEWAY TESTS PASSED WITH 100% ISOLATION! ✅");
    console.log("==================================================================");

    const testSummary = {
      testRunId: TEST_RUN_ID,
      storageDir: STORAGE_DIR,
      passedAt: new Date().toISOString(),
      verifiedBookings: {
        deccan: decRef,
        quickscrap: qsRef,
      },
      multiTabSameContextPassed: true,
      concurrentRequestsPassed: true,
      securityGuardsPassed: true,
      storageIsolationPassed: true,
    };
    fs.writeFileSync(path.join(STORAGE_DIR, "test-summary.json"), JSON.stringify(testSummary, null, 2), "utf8");
  } finally {
    console.log("\nInitiating complete process and stream teardown...");
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (gateway) {
      await gateway.closeGracefully().catch(() => {});
    }

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
    console.log("Teardown completed cleanly. Synthetic storage preserved on disk.");
  }
}

async function main() {
  await testSecurityGuards();
  await testConcurrentPortals();
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exitCode = 1;
});

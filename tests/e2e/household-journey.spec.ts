import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

test.describe("Stage 9: Real Browser Household User Journey & Edge Cases", () => {
  test.setTimeout(360000);

  test("Complete household journey: Intake -> Plan -> Approval -> Booking -> Verifier -> Ledger", async ({
    page,
    browser,
  }) => {
    const evidenceDir = path.resolve(process.env.HOUSEHOLD_EVIDENCE_DIR || path.join(process.cwd(), ".data", "evidence"));
    if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

    // Warm up Next.js routes to avoid cold compilation timeouts
    await Promise.all([
      page.request.get("http://localhost:3000/").catch(() => {}),
      page.request.get("http://localhost:3000/arrange").catch(() => {}),
      page.request.get("http://127.0.0.1:3101/").catch(() => {}),
      page.request.get("http://127.0.0.1:3101/pickup-charges").catch(() => {}),
      page.request.get("http://127.0.0.1:3101/accepted-items").catch(() => {}),
      page.request.get("http://127.0.0.1:3101/book-pickup").catch(() => {}),
      page.request.get("http://127.0.0.1:3101/track?client=journey-warmup").catch(() => {}),
      page.request.get("http://127.0.0.1:3102/").catch(() => {}),
      page.request.get("http://127.0.0.1:3102/what-we-take").catch(() => {}),
      page.request.get("http://127.0.0.1:3103/").catch(() => {}),
      page.request.get("http://127.0.0.1:3103/rates").catch(() => {}),
    ]);

    // 1. Visit Household Dashboard
    await page.goto("http://localhost:3000");
    await expect(page.locator("h1")).toContainText("My pickups");
    await page.screenshot({ path: path.join(evidenceDir, "01-household-dashboard.png") });

    // Click "Arrange a pickup" to go to /arrange
    await page.locator('a[href="/arrange"]').first().click();
    await expect(page).toHaveURL(/.*\/arrange/, { timeout: 30000 });
    await expect(page.locator("h1")).toContainText("Arrange a pickup");

    // 2. Test Over-Budget Edge Case (TC3)
    await page.fill('input[id^="name-"]', "1 old Dell laptop");
    await page.fill('input[id^="weight-"]', "2.5");
    await page.fill("#fullName", "Vikram Kumar");
    await page.fill("#phone", "9876543210");
    await page.fill("#addressLine", "Door 5, Phase 1");
    await page.fill("#locality", "Madhapur");
    await page.fill("#pincode", "500081");
    await page.fill("#fee", "100");

    await page.locator('[data-testid="generate-plan-button"]').click();

    // Verify redirected to request page
    await page.waitForURL(/\/r\/.+/, { timeout: 60000 });
    await expect(page.locator("h1")).toContainText("Let’s find the right way forward");

    // Click "Review recommended plan" to view approval section
    await page.click('button:has-text("Review recommended plan")');

    // Verify budget warning is displayed
    await expect(
      page.locator("text=exceeds stated fee cap of ₹100").or(page.locator("text=Pickup fee ₹180 exceeds"))
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(evidenceDir, "02-edge-case-over-budget.png") });

    // 3. Test Edge Case: Decline Proposal
    const declineBtn = page.locator('button:has-text("Decline plan")');
    await declineBtn.click();
    await expect(page.locator("h1")).toContainText("Pickup plan declined");
    await page.screenshot({ path: path.join(evidenceDir, "04-edge-case-declined-approval.png") });

    // 4. Arrange new pickup for booking execution with sufficient budget
    await page.goto("http://localhost:3000/arrange");
    await page.fill('input[id^="name-"]', "1 old Dell laptop in Madhapur, Hyderabad");
    await page.fill('input[id^="weight-"]', "2.5");
    await page.fill("#fullName", "Vikram Kumar");
    await page.fill("#phone", "9876543210");
    await page.fill("#addressLine", "Door 5, Phase 1");
    await page.fill("#locality", "Madhapur");
    await page.fill("#pincode", "500081");
    await page.fill("#fee", "500");

    await page.locator('[data-testid="generate-plan-button"]').click();
    await page.waitForURL(/\/r\/.+/, { timeout: 60000 });

    // Verify Eligibility Matrix renders
    await expect(page.locator("text=Compare recyclers")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Deccan E-Cycle").first()).toBeVisible();
    await expect(page.locator("text=ACCEPTED").first()).toBeVisible();

    // Click "Review recommended plan"
    await page.click('button:has-text("Review recommended plan")');

    // Verify Proposed Plan renders
    await expect(page.locator("text=Pickup fee").first()).toBeVisible();
    await expect(page.locator("text=₹180").first()).toBeVisible();

    // Check approval checkboxes
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.first().check();
    await checkboxes.nth(1).check();

    // Click Approve Plan
    const approveBtn = page.locator('[data-testid="approve-plan-button"]');
    await approveBtn.click();

    // 5. Booking Execution
    const startBookingBtn = page.locator('button:has-text("Start booking")');
    await expect(startBookingBtn).toBeVisible({ timeout: 15000 });
    const bookingResponse = page.waitForResponse(
      response => response.url().endsWith("/api/book") && response.request().method() === "POST",
      { timeout: 180000 }
    );
    await startBookingBtn.click();
    const booking = await bookingResponse;
    expect(booking.status(), await booking.text()).toBe(200);

    // 6. Verify Booking Reference & Exact Label Mapping (REQUEST_SUBMITTED -> "Booking requested")
    const refBadge = page.locator('[data-testid="booking-reference-badge"]');
    await expect(refBadge).toHaveText(/^DEC-\d+$/, { timeout: 90000 });
    const bookingRef = (await refBadge.textContent())?.trim();

    // Exact state assertion: leg is submitted, waiting for verification
    await expect(page.locator('[data-testid="request-dashboard"]')).toContainText("Booking requested");
    await expect(page.locator('[data-testid="request-dashboard"]')).not.toContainText("Pickup scheduled");
    await expect(page.locator('[data-testid="request-dashboard"]')).not.toContainText("Booking independently checked");

    // Requested slot is explicitly labelled requested, and assigned slot is "Not assigned"
    await expect(page.locator("text=Requested slot")).toBeVisible();
    await expect(page.locator("text=Assigned slot")).toBeVisible();
    await expect(page.locator("text=Not assigned")).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, "05-proof-ledger-booked.png") });

    // 7. Execute Independent Verification
    const verifyBtn = page.locator('[data-testid="run-independent-verification-button"]');
    await expect(verifyBtn).toBeVisible({ timeout: 15000 });
    const verificationResponse = page.waitForResponse(
      response => response.url().endsWith("/api/verify") && response.request().method() === "POST",
      { timeout: 120000 }
    );
    await verifyBtn.click();

    // The loading message is not a completed verification. Wait for the actual
    // result before asserting the ledger; cold browser startup can exceed 5s.
    const verification = await verificationResponse;
    expect(verification.status(), await verification.text()).toBe(200);
    const verificationBody = await verification.json();
    expect(verificationBody.verification.verified).toBe(true);
    await expect(page.locator("text=The independent check matched the exposed booking fields.")).toBeVisible({ timeout: 30000 });

    // Assert exact verified state: "Booking independently checked" (REQUEST_CONFIRMED)
    // and recycler status is "Booking received" (RECEIVED).
    // RECEIVED and independent verification MUST NOT imply scheduling!
    await expect(page.locator('[data-testid="request-dashboard"]')).toContainText("Booking independently checked");
    await expect(page.locator('[data-testid="request-dashboard"]')).toContainText("Booking received");
    await expect(page.locator('[data-testid="request-dashboard"]')).not.toContainText("Pickup scheduled");
    await expect(page.locator("text=Not assigned")).toBeVisible();

    // 8. Verify TC4 Invariant: Never Reported as Collected
    await expect(page.locator("text=Your items have not been reported as collected.")).toBeVisible();
    await expect(page.locator("text=A booking request is not evidence of collection.")).toBeVisible();
    await expect(page.locator('[data-testid="request-dashboard"]')).not.toContainText("COLLECTED");
    await expect(page.locator('[data-testid="request-dashboard"]')).not.toContainText("PICKED_UP");
    await expect(page.locator('[data-testid="request-dashboard"]')).not.toContainText("Collection recorded");

    // 9. Open Independent Browser Context and verify public tracking portal directly
    const separateContext = await browser.newContext();
    const separatePage = await separateContext.newPage();
    await separatePage.goto(`http://127.0.0.1:3101/track?ref=${bookingRef}`);
    await expect(separatePage.locator(`text=${bookingRef}`)).toBeVisible({ timeout: 15000 });
    await expect(separatePage.locator('[data-testid="tracking-status"]')).toHaveText("RECEIVED");
    await separatePage.screenshot({ path: path.join(evidenceDir, "06-independent-portal-tracking.png") });

    await separateContext.close();
    await page.screenshot({ path: path.join(evidenceDir, "07-final-ledger-verified.png") });
  });
});

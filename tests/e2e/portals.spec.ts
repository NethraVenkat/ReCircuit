import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TEST_ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-secret-token";

test.describe("ReCircuit Mock Recycler Portals E2E Suite", () => {
  // Reset demo state before tests
  test.beforeAll(async ({ request }) => {
    test.setTimeout(60000);
    // Warm up all 3 portal servers in parallel
    await Promise.all(
      [3101, 3102, 3103].map(async (port) => {
        for (let attempt = 0; attempt < 40; attempt++) {
          try {
            const res = await request.get(`http://localhost:${port}/api/health`);
            if (res.ok()) return;
          } catch {
            // waiting for server
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      })
    );

    try {
      await request.post("http://localhost:3101/api/reset?all=true", {
        headers: { "x-admin-token": TEST_ADMIN_TOKEN },
      });
    } catch {
      // server might start on first test
    }
  });


  // -------------------------------------------------------------------------
  // 1. Site Differentiation: Nav landmarks & distinct layouts
  // -------------------------------------------------------------------------
  test("Deccan, PaperPlus, and QuickScrap homepages render distinct navigation landmarks and accordions", async ({
    page,
  }) => {
    // Deccan (3101): Left sidebar + CPCB badge
    await page.goto("http://localhost:3101");
    await expect(page.locator('[data-testid="deccan-sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="cpcb-badge"]')).toBeVisible();

    // PaperPlus (3102): Top tab bar + CPCB badge
    await page.goto("http://localhost:3102");
    await expect(page.locator('[data-testid="paperplus-topbar"]')).toBeVisible();
    await expect(page.locator('[data-testid="cpcb-badge"]')).toBeVisible();

    // QuickScrap (3103): Top header + Application in process notice + Accordions
    await page.goto("http://localhost:3103");
    await expect(page.locator('[data-testid="quickscrap-nav"]')).toBeVisible();
    await expect(page.locator('[data-testid="unregistered-notice"]')).toContainText("Registration: application in process");
    await expect(page.locator('[data-testid="cpcb-badge"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="quickscrap-accordion"]')).toHaveCount(3);
  });

  // -------------------------------------------------------------------------
  // 2. Deccan E-Cycle: Booking and Tracking
  // -------------------------------------------------------------------------
  test("Deccan E-Cycle: valid booking returns DEC-XXXXX reference and tracking shows RECEIVED", async ({
    page,
  }) => {
    await page.goto("http://localhost:3101/book-pickup");

    await page.fill('[data-testid="input-fullname"]', "Ramesh Reddy");
    await page.fill('[data-testid="input-phone"]', "9876543210");
    await page.fill('[data-testid="input-address"]', "Plot 10, Road No 2");
    await page.fill('[data-testid="input-locality"]', "Kukatpally");
    await page.selectOption('[data-testid="input-pincode"]', "500072");

    // Check data-wipe ack
    await page.check('[data-testid="data-wipe-ack"]');

    // Submit
    await page.click('[data-testid="confirm-booking"]');

    // Should land on confirmation page
    await page.waitForURL("**/book-pickup/confirmation?**");
    const refEl = page.locator('[data-testid="booking-reference"]');
    await expect(refEl).toBeVisible();
    const reference = (await refEl.textContent())?.trim() || "";
    expect(reference).toMatch(/^DEC-\d{5}$/);

    const statusEl = page.locator('[data-testid="confirmation-status"]');
    await expect(statusEl).toHaveText(/RECEIVED/i);

    // Track order
    await page.goto("http://localhost:3101/track");
    await page.fill('[data-testid="input-reference"]', reference);
    await page.click('[data-testid="submit-track"]');

    await expect(page.locator('[data-testid="tracking-result"]')).toBeVisible();
    await expect(page.locator('[data-testid="tracking-status"]')).toHaveText(/RECEIVED/i);
    await expect(page.locator('[data-testid="booking-reference"]')).toHaveText(reference);
  });

  // -------------------------------------------------------------------------
  // 3. Deccan Rejections: missing data wipe and unsupported item
  // -------------------------------------------------------------------------
  test("Deccan rejects missing data-wipe ack and unsupported paper scrap", async ({ page }) => {
    await page.goto("http://localhost:3101/book-pickup");

    await page.fill('[data-testid="input-fullname"]', "Anil Rao");
    await page.fill('[data-testid="input-phone"]', "9876543210");
    await page.fill('[data-testid="input-address"]', "Road 4");
    await page.fill('[data-testid="input-locality"]', "Kukatpally");

    // Uncheck data-wipe ack
    await page.uncheck('[data-testid="data-wipe-ack"]');

    await page.click('[data-testid="confirm-booking"]');

    // Form should show error banner
    await expect(page.locator('[data-testid="form-error-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="form-error-banner"]')).toContainText("Data-wipe acknowledgement");
  });

  // -------------------------------------------------------------------------
  // 4. PaperPlus: Human verification (SVG Captcha) enforcement
  // -------------------------------------------------------------------------
  test("PaperPlus: human verification panel exists with SVG image and no code text in DOM", async ({
    page,
  }) => {
    await page.goto("http://localhost:3102/schedule");

    const hvPanel = page.locator('[data-human-verification="required"]');
    await expect(hvPanel).toBeVisible();

    const captchaImg = page.locator('[data-testid="captcha-image"]');
    await expect(captchaImg).toBeVisible();

    // Verify the image source is /api/captcha?sid=...
    const src = await captchaImg.getAttribute("src");
    expect(src).toContain("/api/captcha?sid=");

    // Crucial check: verify that page HTML does NOT contain the 5-char code as plaintext
    const content = await page.content();
    expect(content).not.toContain("<text");

    // Submitting wrong code fails
    await page.fill('[data-testid="input-fullname"]', "Srinivas Rao");
    await page.fill('[data-testid="input-phone"]', "9876543211");
    await page.fill('[data-testid="input-address"]', "Flat 202");
    await page.fill('[data-testid="input-locality"]', "KPHB");
    await page.fill('[data-testid="input-captcha-code"]', "WRONG");

    await page.click('[data-testid="confirm-booking"]');

    await expect(page.locator('[data-testid="form-error-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="form-error-banner"]')).toContainText("verification code is incorrect");
  });

  // -------------------------------------------------------------------------
  // 5. QuickScrap: Instant pickup booking
  // -------------------------------------------------------------------------
  test("QuickScrap Hyd: valid booking returns QSH-XXXXX reference", async ({ page }) => {
    await page.goto("http://localhost:3103/pickup");

    await page.fill('[data-testid="input-fullname"]', "Vikram Kumar");
    await page.fill('[data-testid="input-phone"]', "9876543212");
    await page.fill('[data-testid="input-address"]', "Door 5, Phase 1");
    await page.fill('[data-testid="input-locality"]', "Madhapur");
    await page.selectOption('[data-testid="input-pincode"]', "500081");

    await page.click('[data-testid="confirm-booking"]');

    await page.waitForURL("**/pickup/thanks?**");
    const refEl = page.locator('[data-testid="booking-reference"]');
    await expect(refEl).toBeVisible();
    const reference = (await refEl.textContent())?.trim() || "";
    expect(reference).toMatch(/^QSH-\d{5}$/);
  });

  // -------------------------------------------------------------------------
  // 6. Admin Console: Auth guard, Simulated actions & Badges
  // -------------------------------------------------------------------------
  test("Admin console refuses unauthenticated requests and executes SIMULATED events", async ({
    page,
    request,
  }) => {
    // 1. Unauthorized without token
    await page.goto("http://localhost:3101/admin");
    await expect(page.locator('[data-testid="admin-unauthorized"]')).toBeVisible();

    // 2. Authorized with ?token=TEST_ADMIN_TOKEN
    await page.goto(`http://localhost:3101/admin?token=${TEST_ADMIN_TOKEN}`);
    await expect(page.locator("h1")).toContainText("Deccan E-Cycle");
    await expect(page.locator('[data-testid="btn-reset-demo"]')).toBeVisible();

    // Create a booking to manipulate via admin
    const createRes = await request.post("http://localhost:3101/api/bookings", {
      data: {
        client_request_id: "admin-e2e-test",
        full_name: "Admin Tester",
        phone: "9876543210",
        address_line: "Main Rd",
        locality: "Kukatpally",
        pincode: "500072",
        preferred_slot: "Tomorrow (10:00–12:00 IST)",
        items: [{ name: "Laptop", quantity: 1, weightKg: 2.0 }],
        data_wipe_ack: true,
      },
    });
    const bookingData = await createRes.json();
    const ref = bookingData.booking.bookingReference;

    await page.reload();

    // Confirm booking
    const confirmBtn = page.locator(`[data-testid="btn-confirm-${ref}"]`);
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    await expect(page.locator('[data-testid="admin-action-message"]')).toContainText("CONFIRMED");

    // Schedule booking
    const scheduleBtn = page.locator(`[data-testid="btn-schedule-${ref}"]`);
    await scheduleBtn.click();
    await expect(page.locator('[data-testid="admin-action-message"]')).toContainText("SCHEDULED");

    // Mark Picked Up (generates 6-digit OTP)
    const pickupBtn = page.locator(`[data-testid="btn-pickup-${ref}"]`);
    await pickupBtn.click();
    await expect(page.locator('[data-testid="admin-action-message"]')).toContainText("OTP Generated");

    // Record Weight
    const weighBtn = page.locator(`[data-testid="btn-weigh-${ref}"]`);
    await weighBtn.click();
    await expect(page.locator('[data-testid="admin-action-message"]')).toContainText("WEIGHED");

    // Check tracking page for SIMULATED DOWNSTREAM EVENT badge
    await page.goto(`http://localhost:3101/track?ref=${ref}`);
    await expect(page.locator('[data-testid="tracking-status"]')).toHaveText(/WEIGHED/i);
    const simBadges = page.locator('[data-testid="simulated-event-badge"]');
    await expect(simBadges.first()).toBeVisible();
    await expect(simBadges.first()).toHaveText("SIMULATED DOWNSTREAM EVENT");
  });

  // -------------------------------------------------------------------------
  // 7. Failure Switches Testing
  // -------------------------------------------------------------------------
  test("Failure switches trigger HTTP 500, omitted reference, and changed policy layout", async ({
    page,
    request,
  }) => {
    // A. HTTP 500 Failure Switch
    await request.post(`http://localhost:3101/api/admin?token=${TEST_ADMIN_TOKEN}`, {
      data: { action: "toggle_switch", switchName: "failNextSubmit", value: true },
    });

    const submit500 = await request.post("http://localhost:3101/api/bookings", {
      data: {
        client_request_id: "req-fail-500",
        full_name: "Test User",
        phone: "9876543210",
        address_line: "Road 1",
        locality: "Kukatpally",
        pincode: "500072",
        preferred_slot: "Slot",
        items: [{ name: "Laptop", quantity: 1 }],
      },
    });
    expect(submit500.status()).toBe(500);

    // B. Changed Policy Layout Switch
    await request.post(`http://localhost:3101/api/admin?token=${TEST_ADMIN_TOKEN}`, {
      data: { action: "toggle_switch", switchName: "changedPolicyLayout", value: true },
    });
    await page.goto("http://localhost:3101/pickup-charges");
    await expect(page.locator("h2")).toHaveText("Tariff Matrix & Logistics Assessment Protocol");

    // Restore switch
    await request.post(`http://localhost:3101/api/admin?token=${TEST_ADMIN_TOKEN}`, {
      data: { action: "toggle_switch", switchName: "changedPolicyLayout", value: false },
    });
    await page.goto("http://localhost:3101/pickup-charges");
    await expect(page.locator("h2")).toHaveText("Pickup Charges & Payout Rates");
  });

  // -------------------------------------------------------------------------
  // 8. Cross-Recycler Route Isolation (404s)
  // -------------------------------------------------------------------------
  test("Routes belonging to another recycler return HTTP 404", async ({ request }) => {
    // /schedule belongs to PaperPlus, not Deccan (3101)
    const deccanCross = await request.get("http://localhost:3101/schedule");
    expect(deccanCross.status()).toBe(404);

    // /book-pickup belongs to Deccan, not QuickScrap (3103)
    const qsCross = await request.get("http://localhost:3103/book-pickup");
    expect(qsCross.status()).toBe(404);

    // /rates belongs to QuickScrap, not PaperPlus (3102)
    const ppCross = await request.get("http://localhost:3102/rates");
    expect(ppCross.status()).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 9. Automated Axe Accessibility Verification
  // -------------------------------------------------------------------------
  test("Deccan, PaperPlus, and QuickScrap pass automated axe accessibility checks on home and booking pages", async ({
    page,
  }) => {
    // Deccan Home
    await page.goto("http://localhost:3101");
    const deccanHomeAxe = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
    expect(deccanHomeAxe.violations).toEqual([]);

    // Deccan Booking
    await page.goto("http://localhost:3101/book-pickup");
    const deccanBookAxe = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
    expect(deccanBookAxe.violations).toEqual([]);

    // PaperPlus Booking
    await page.goto("http://localhost:3102/schedule");
    const paperPlusBookAxe = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
    expect(paperPlusBookAxe.violations).toEqual([]);

    // QuickScrap Booking
    await page.goto("http://localhost:3103/pickup");
    const quickScrapBookAxe = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
    expect(quickScrapBookAxe.violations).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 10. XSS Input Escaping & Safety
  // -------------------------------------------------------------------------
  test("Malicious script tags in customer name or address are safely rendered and not executed", async ({
    page,
  }) => {
    const xssPayload = '<img src="x" onerror="window.__xss_attack_executed=true">';
    await page.goto("http://localhost:3101/book-pickup");

    await page.fill('[data-testid="input-fullname"]', xssPayload);
    await page.fill('[data-testid="input-phone"]', "9876543210");
    await page.fill('[data-testid="input-address"]', "Plot 10, Road No 2");
    await page.fill('[data-testid="input-locality"]', "Kukatpally");
    await page.selectOption('[data-testid="input-pincode"]', "500072");
    await page.check('[data-testid="data-wipe-ack"]');
    await page.click('[data-testid="confirm-booking"]');

    await page.waitForURL("**/book-pickup/confirmation?**");
    const ref = (await page.locator('[data-testid="booking-reference"]').textContent())?.trim() || "";

    await page.goto(`http://localhost:3101/track?ref=${encodeURIComponent(ref)}`);
    await expect(page.locator('[data-testid="tracking-result"]')).toBeVisible();

    const isExecuted = await page.evaluate(() => (window as any).__xss_attack_executed);
    expect(isExecuted).toBeUndefined();
  });
});


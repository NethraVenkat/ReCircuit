import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

test.describe("Stage 9: Real Browser Household User Journey & Edge Cases", () => {
  test.setTimeout(180000);

  test("Complete household journey: Intake -> Plan -> Approval -> Booking -> Verifier -> Ledger", async ({
    page,
    browser,
  }) => {
    const evidenceDir = path.resolve(process.cwd(), ".data", "evidence");
    if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

    // 1. Visit Household Dashboard
    await page.goto("http://localhost:3000");
    await expect(page.locator("h1")).toContainText("Responsible E-Waste & Recycling");
    await page.screenshot({ path: path.join(evidenceDir, "01-household-dashboard.png") });

    // 2. Test Over-Budget Edge Case (TC3)
    const overBudgetBtn = page.locator("button", { hasText: "Over-Budget ₹100 (TC3)" });
    await overBudgetBtn.click();
    await page.locator('[data-testid="generate-plan-button"]').click();

    // Verify budget warning is displayed
    await expect(page.locator("text=Approval Escalation Conditions:")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=exceeds your fee limit").or(page.locator("text=fee limit"))).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, "02-edge-case-over-budget.png") });

    // 3. Test Normal Intake with Split Items (Laptop + AA Batteries)
    const intakeInput = page.locator('[data-testid="intake-text-input"]');
    await intakeInput.fill("1 old Dell laptop in Madhapur, Hyderabad");
    // Increase budget cap to ₹500
    const feeCapInput = page.locator('input[type="number"]');
    await feeCapInput.fill("500");

    await page.locator('[data-testid="generate-plan-button"]').click();

    // Verify Eligibility Matrix renders
    await expect(page.locator("text=Live Recycler Policy Eligibility Matrix")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Deccan E-Cycle").first()).toBeVisible();
    await expect(page.locator("text=ACCEPTED").first()).toBeVisible();

    // Verify Proposed Plan renders
    await expect(page.locator("text=Proposed Reverse-Logistics Plan")).toBeVisible();
    await expect(page.locator("text=Pickup Fee: ₹180").first()).toBeVisible();

    // Verify Safe Action Gate (Approval Card) renders with Plan Hash
    await expect(page.locator("text=Human Approval & Slot Preferences")).toBeVisible();
    await expect(page.locator("text=Hash: ")).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, "03-plan-and-approval-gate.png") });

    // 4. Test Edge Case: Decline Proposal
    const declineBtn = page.locator("button", { hasText: "Decline" });
    await declineBtn.click();
    // Verify plan is cleared from view
    await expect(page.locator("text=Proposed Reverse-Logistics Plan")).not.toBeVisible();
    await page.screenshot({ path: path.join(evidenceDir, "04-edge-case-declined-approval.png") });

    // 5. Re-generate plan for booking execution
    await page.locator('[data-testid="generate-plan-button"]').click();
    await expect(page.locator("text=Human Approval & Slot Preferences")).toBeVisible({ timeout: 15000 });

    // Check data wipe ack checkbox
    const dataWipeCheckbox = page.locator('input[type="checkbox"]');
    await dataWipeCheckbox.check();

    // Click Approve & Book Pickup
    const approveBtn = page.locator('[data-testid="approve-plan-button"]');
    await approveBtn.click();

    // 6. Navigation to Proof Ledger
    await page.waitForURL(/\/r\/.+/, { timeout: 90000 });
    await expect(page.locator("h1")).toContainText("Consignment Proof Ledger");
    await page.screenshot({ path: path.join(evidenceDir, "05-proof-ledger-booked.png") });

    // 7. Verify Ledger Details: Reference, Submitting Session, and State Timeline
    await expect(page.locator('[data-testid="booking-reference-badge"]')).toBeVisible({ timeout: 15000 });
    const bookingRef = (await page.locator('[data-testid="booking-reference-badge"]').first().textContent())?.trim();
    expect(bookingRef).toMatch(/^DEC-[A-Z0-9]+$/);

    await expect(page.locator('[data-testid="leg-state-badge"]').first()).toContainText("REQUEST_SUBMITTED");

    // 8. Execute Stage 8 Independent Verification in the Ledger
    const verifyBtn = page.locator('[data-testid="run-independent-verification-button"]');
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();

    // Verify Dual-Session Independence Panel updates
    await expect(page.locator('[data-testid="verification-feedback-banner"]')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('[data-testid="leg-state-badge"]').first()).toContainText("REQUEST_CONFIRMED");

    // 9. Verify TC4 Invariant on Ledger: Never Collected
    await expect(page.locator("text=TC4 Invariant: Status remains \"Pickup Scheduled\"; never claimed as Collected")).toBeVisible();
    await expect(page.locator('[data-testid="leg-state-badge"]').first()).not.toContainText("COLLECTED");
    await expect(page.locator('[data-testid="leg-state-badge"]').first()).not.toContainText("PICKED_UP");

    // 10. Open Independent Browser Context and verify public tracking portal directly
    const separateContext = await browser.newContext();
    const separatePage = await separateContext.newPage();
    await separatePage.goto(`http://localhost:3101/track?ref=${bookingRef}`);
    await expect(separatePage.locator(`text=${bookingRef}`)).toBeVisible({ timeout: 15000 });
    await separatePage.screenshot({ path: path.join(evidenceDir, "06-independent-portal-tracking.png") });

    await separateContext.close();
    await page.screenshot({ path: path.join(evidenceDir, "07-final-ledger-verified.png") });
  });
});

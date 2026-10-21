import { test, expect } from "@playwright/test";

test.describe("Stage 10: Official Test Cases Dashboard E2E", () => {
  test.setTimeout(90000);

  test("Run All 4 Official Test Cases on /test-cases in real browser", async ({ page }) => {
    await page.goto("http://localhost:3000/test-cases");
    await expect(page.locator("h1")).toContainText("Official Reverse-Logistics Test Cases");

    // Click "Run All 4 Official Test Cases" batch runner button
    const runAllBtn = page.locator('[data-testid="run-all-test-cases-button"]');
    await expect(runAllBtn).toBeVisible();
    await runAllBtn.click();

    // Verify all 4 cards show "PASSED" badge
    await expect(page.locator('[data-testid="badge-tc1"]')).toContainText("PASSED", { timeout: 30000 });
    await expect(page.locator('[data-testid="badge-tc2"]')).toContainText("PASSED", { timeout: 30000 });
    await expect(page.locator('[data-testid="badge-tc3"]')).toContainText("PASSED", { timeout: 30000 });
    await expect(page.locator('[data-testid="badge-tc4"]')).toContainText("PASSED", { timeout: 30000 });

    // Verify grounded citations are rendered on the page
    await expect(page.locator("text=Under 5 kg total weight: ₹180 standard pickup charge").first()).toBeVisible();
    await expect(page.locator("text=Category battery_household explicitly rejected").first()).toBeVisible();
    await expect(page.locator("text=FEE_CAP_EXCEEDED").first()).toBeVisible();
    await expect(page.locator("text=TC4 Zero-Unverified-Collection Invariant").first()).toBeVisible();
  });
});

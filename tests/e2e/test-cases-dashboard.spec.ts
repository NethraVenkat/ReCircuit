import { test, expect } from "@playwright/test";

test.describe("Stage 10: Official Test Cases Dashboard E2E", () => {
  test.setTimeout(90000);

  test("Run All 4 Official Test Cases on /test-cases in real browser", async ({ page }) => {
    await page.goto("http://localhost:3000/test-cases");
    await expect(page.locator("h1")).toContainText("Explore before you arrange");

    // Execute each test case sequentially and wait for its API response
    for (let i = 1; i <= 4; i++) {
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/test-cases/run?tc=${i}`) && resp.status() === 200,
        { timeout: 30000 }
      );
      const article = page.locator("article.rc-item").nth(i - 1);
      await article.locator('button:has-text("Run check")').click();
      await responsePromise;
    }

    // Verify all 4 cards show "Rule check passed" badge
    const passedBadges = page.locator('.rc-badge:has-text("Rule check passed")');
    await expect(passedBadges).toHaveCount(4, { timeout: 30000 });

    // Verify grounded citations are rendered on the page
    await expect(
      page.locator("text=Laptop classified as 'laptop'").or(page.locator("text=Deccan E-Cycle Solutions")).first()
    ).toBeVisible();
    await expect(
      page.locator("text=PaperPlus status for battery: REJECTED").or(page.locator("text=batteries rejected")).first()
    ).toBeVisible();
    await expect(page.locator("text=FEE_CAP_EXCEEDED").first()).toBeVisible();
    await expect(
      page.locator("text=allUncollected: true").or(page.locator("text=NEVER 'Collected'")).first()
    ).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
const diagnostics = new Map<object, Array<{ kind: string; detail: string }>>();
test.beforeEach(async ({ page }) => {
  const rows: Array<{ kind: string; detail: string }> = []; diagnostics.set(page, rows);
  page.on("pageerror", error => rows.push({ kind: "pageerror", detail: error.message }));
  page.on("requestfailed", request => rows.push({ kind: "requestfailed", detail: new URL(request.url()).pathname + ": " + request.failure()?.errorText }));
  page.on("response", response => { if (response.status() >= 400) rows.push({ kind: "http", detail: response.status() + " " + new URL(response.url()).pathname }); });
});
test.afterEach(async ({ page }, info) => { await fs.mkdir(info.outputDir, { recursive: true }); const filename = info.outputPath("browser-diagnostics.json"); await fs.writeFile(filename, JSON.stringify(diagnostics.get(page), null, 2)); await info.attach("browser-diagnostics", { path: filename, contentType: "application/json" }); diagnostics.delete(page); });

test.describe("Stage 10: Official Test Cases Dashboard E2E", () => {
  test.setTimeout(90000);

  test("Run All 4 Official Test Cases on /test-cases in real browser", async ({ page }) => {
    await page.goto("http://localhost:3000/test-cases");
    await expect(page.locator("h1")).toContainText("Explore before you arrange");

    // Execute each test case sequentially and wait for its API response
    for (let i = 1; i <= 4; i++) {
      const article = page.locator("article.rc-item").nth(i - 1);
      const button = article.locator('button:has-text("Run check")');
      await expect(button).toBeEnabled({ timeout: 30000 });
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/test-cases/run?tc=${i}`) && resp.status() === 200,
        { timeout: 30000 }
      );
      await button.click();
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

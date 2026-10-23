import { expect, test } from "@playwright/test";
test("rule-check actions stay disabled until their client handlers are ready", async ({ page }) => {
  let release!: () => void, hold = true;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/_next/static/**/*.js", async route => { if (hold) await ready; await route.continue().catch(() => {}); });
  try {
    await page.goto("http://localhost:3000/test-cases", { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "Explore before you arrange" })).toBeVisible();
    const button = page.getByRole("button", { name: "Run check", exact: true }).first();
    await expect(button).toBeDisabled({ timeout: 1500 });
    hold = false; release();
    await expect(button).toBeEnabled();
    await Promise.all([page.waitForResponse(r => r.url().includes("/api/test-cases/run?tc=1") && r.status() === 200), button.click()]);
    await expect(page.getByText("Rule check passed", { exact: true })).toBeVisible();
  } finally { hold = false; release(); }
});

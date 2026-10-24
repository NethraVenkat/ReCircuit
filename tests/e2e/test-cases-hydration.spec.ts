import { expect, test } from "@playwright/test";
test("rule-check actions stay disabled until their client handlers are ready", async ({ page }) => {
  let release!: () => void, hold = true, heldScripts = 0;
  const clientErrors: string[] = [];
  page.on("pageerror", error => clientErrors.push(error.message));
  const ready = new Promise<void>(resolve => { release = resolve; });
  // Match cache-busted chunks too; a glob ending in .js missed ?v= URLs.
  await page.route(url => url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".js"), async route => { if (hold) { heldScripts++; await ready; } await route.continue().catch(() => {}); });
  try {
    await page.goto("http://localhost:3000/test-cases", { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "Explore before you arrange" })).toBeVisible();
    const button = page.getByRole("button", { name: "Run check", exact: true }).first();
    await expect(button).toBeDisabled({ timeout: 1500 });
    expect(heldScripts).toBeGreaterThan(0);
    hold = false; release();
    // The readiness assertion starts after its blocked script-delivery prerequisite.
    // Keep the existing five-second enabled assertion, not a larger deadline.
    await page.waitForLoadState("load");
    await expect(button).toBeEnabled();
    await Promise.all([page.waitForResponse(r => r.url().includes("/api/test-cases/run?tc=1") && r.status() === 200), button.click()]);
    await expect(page.getByText("Rule check passed", { exact: true })).toBeVisible();
    expect(clientErrors).toEqual([]);
  } finally { hold = false; release(); }
});

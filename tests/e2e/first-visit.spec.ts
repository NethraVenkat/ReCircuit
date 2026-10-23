import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const base = "http://localhost:3000";
const evidence = path.resolve(".data/first-visit-20261023");
test("first visit examples are editable drafts, separate from real history", async ({ browser }) => {
  test.setTimeout(240000);
  fs.mkdirSync(evidence, { recursive: true });
  const results: string[] = [];
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const writes: string[] = [];
    page.on("request", request => { if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(request.url()); });
    await page.goto(base);
    const cards = page.getByRole("region", { name: "Try an example" });
    await expect(cards.getByRole("link")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Arrange a pickup", exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `${evidence}/empty-${width}.png`, fullPage: true });
    for (const [title, names, types, quantities, weights, fee] of [
      ["Old laptop", ["Old laptop"], ["laptop"], ["1"], ["2.5"], "500"],
      ["Paper and batteries", ["Newspapers", "Household batteries"], ["newspaper", "battery_household"], ["1", "4"], ["8", "0.5"], "500"],
      ["Pickup budget", ["Old laptop"], ["laptop"], ["1"], ["2.5"], "100"],
    ] as const) {
      await page.goto(base);
      await page.getByRole("link", { name: `Try ${title}`, exact: true }).click();
      await expect(page.locator('input[id^="name-"]')).toHaveCount(names.length);
      for (let i = 0; i < names.length; i++) {
        await expect(page.locator('input[id^="name-"]').nth(i)).toHaveValue(names[i]!);
        await expect(page.locator('select[id^="type-"]').nth(i)).toHaveValue(types[i]!);
        await expect(page.locator('input[id^="qty-"]').nth(i)).toHaveValue(quantities[i]!);
        await expect(page.locator('input[id^="weight-"]').nth(i)).toHaveValue(weights[i]!);
      }
      await expect(page.locator("#fee")).toHaveValue(fee);
      for (const field of ["fullName", "phone", "addressLine"]) await expect(page.locator(`#${field}`)).toHaveValue("");
      await expect(page.getByRole("checkbox")).toHaveCount(0);
      await page.locator('input[id^="name-"]').first().fill("My editable item");
      await expect(page.locator('input[id^="name-"]').first()).toHaveValue("My editable item");
      await page.reload();
      await expect(page.locator('input[id^="name-"]').first()).toHaveValue("My editable item");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${evidence}/${title.replaceAll(" ", "-").toLowerCase()}-${width}.png`, fullPage: true });
    }
    expect(writes).toEqual([]);
    expect((await (await context.request.get(`${base}/api/requests`)).json()).requests).toEqual([]);
    results.push(`${width}: all three editable prefills; no writes on click/load/refresh; no contact or acknowledgement inserted; no overflow`);
    if (width === 1440) {
      // Compile the mock policy pages before the worker's bounded live reads.
      // Cold dev compilation must not masquerade as a changed/unreadable policy.
      for (const url of ["http://127.0.0.1:3101/", "http://127.0.0.1:3101/accepted-items", "http://127.0.0.1:3101/pickup-charges", "http://127.0.0.1:3102/", "http://127.0.0.1:3102/what-we-take", "http://127.0.0.1:3103/", "http://127.0.0.1:3103/rates"]) {
        expect((await context.request.get(url, { timeout: 90000 })).status()).toBe(200);
      }
      // Explicit continuation uses the existing live-policy route. No approval
      // or booking is performed, and all data stays in an isolated local store.
      await page.goto(`${base}/arrange?example=pickup-budget`);
      await page.locator("#fullName").fill("Browser verification");
      await page.locator("#phone").fill("9876543210");
      await page.locator("#addressLine").fill("Synthetic local test address");
      const planResponse = page.waitForResponse(r => r.url().endsWith("/api/plan"), { timeout: 120000 });
      await page.getByRole("button", { name: "Compare recyclers", exact: true }).click();
      const response = await planResponse;
      expect(response.status(), await response.text()).toBe(200);
      const sent = response.request().postDataJSON();
      expect(sent.mode).toBeUndefined(); expect(sent.policyMode).toBeUndefined();
      const planned = await response.json(); expect(planned.policyMode).toBe("live");
      expect(planned.plan.totalEstimatedFee).toBeGreaterThan(sent.feeCapInr);
      expect(planned.request.state).toBe("AWAITING_APPROVAL");
      const before = (await (await context.request.get(`${base}/api/requests`)).json()).requests;
      expect(before).toHaveLength(1);
      await page.goto(base); await expect(page.getByRole("heading", { name: "Your requests" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Try an example" })).toHaveCount(0);
      await page.screenshot({ path: `${evidence}/existing-history.png`, fullPage: true });
      await page.goto(`${base}/arrange?example=paper-batteries`); await page.reload();
      expect((await (await context.request.get(`${base}/api/requests`)).json()).requests).toEqual(before);
      expect(writes.filter(url => url.includes("/api/book") || url.includes("/api/approve"))).toEqual([]);
      results.push("explicit continuation uses live policy workflow; existing history unchanged; no approval or booking");
    }
    await context.close();
  }
  fs.writeFileSync(`${evidence}/browser-results.json`, JSON.stringify(results, null, 2));
});

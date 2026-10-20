import { defineConfig, devices } from "@playwright/test";

process.env.CAPTCHA_SECRET = "playwright-only-captcha-secret";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 60000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node scripts/start-portals.cjs",
    port: 3101,
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      CAPTCHA_SECRET: process.env.CAPTCHA_SECRET,
      ADMIN_TOKEN: process.env.ADMIN_TOKEN || "test-admin-secret-token",
    },
  },
});


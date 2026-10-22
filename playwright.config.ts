import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || "test-captcha-secret-key-32chars!!";
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-secret-token";
process.env.STORAGE_DIR = process.env.STORAGE_DIR || path.resolve(__dirname, ".data", "test-storage");
process.env.RECIRCUIT_DATA_DIR = process.env.RECIRCUIT_DATA_DIR || path.resolve(__dirname, ".data", "test-storage", "household");

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
  webServer: [
    {
      command: "node scripts/start-portals.cjs",
      url: "http://127.0.0.1:3101/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        STORAGE_DIR: process.env.STORAGE_DIR,
        CAPTCHA_SECRET: process.env.CAPTCHA_SECRET,
        ADMIN_TOKEN: process.env.ADMIN_TOKEN,
      },
    },
    {
      command: "npm run dev --workspace=@recircuit/web",
      url: "http://127.0.0.1:3000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        PORT: "3000",
        RECIRCUIT_DATA_DIR: process.env.RECIRCUIT_DATA_DIR,
        STORAGE_DIR: process.env.STORAGE_DIR,
        PORTAL_DECCAN_URL: "http://127.0.0.1:3101",
        PORTAL_PAPERPLUS_URL: "http://127.0.0.1:3102",
        PORTAL_QUICKSCRAP_URL: "http://127.0.0.1:3103",
      },
    },
  ],
});

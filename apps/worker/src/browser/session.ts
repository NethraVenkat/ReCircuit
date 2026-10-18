/**
 * apps/worker/src/browser/session.ts
 *
 * Browser session manager supporting both local Playwright execution (offline dev & CI)
 * and cloud Browserbase sessions.
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

export type BrowserMode = "local" | "browserbase";

export interface BrowserSessionOptions {
  mode?: BrowserMode;
  recyclerId?: string;
  headless?: boolean;
}

export interface ScreenshotResult {
  path: string;
  buffer: Buffer;
  filename: string;
}

export interface BrowserSession {
  page: Page;
  sessionId: string;
  mode: BrowserMode;
  close(): Promise<void>;
  captureScreenshot(label: string): Promise<ScreenshotResult>;
}

export async function openSession(options: BrowserSessionOptions = {}): Promise<BrowserSession> {
  const requestedMode = options.mode || (process.env.BROWSER_MODE as BrowserMode) || "local";
  const sessionId = randomUUID();
  let mode: BrowserMode = "local";
  let browser: Browser;
  let context: BrowserContext;

  if (requestedMode === "browserbase" && process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID) {
    try {
      const cdpUrl = `wss://connect.browserbase.com?apiKey=${encodeURIComponent(
        process.env.BROWSERBASE_API_KEY
      )}&projectId=${encodeURIComponent(process.env.BROWSERBASE_PROJECT_ID)}`;
      browser = await chromium.connectOverCDP(cdpUrl);
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      mode = "browserbase";
    } catch {
      // Graceful fallback to local browser if cloud connection fails
      browser = await chromium.launch({
        headless: options.headless ?? true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      mode = "local";
    }
  } else {
    // Local Playwright session
    browser = await chromium.launch({
      headless: options.headless ?? true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    mode = "local";
  }

  const page = await context.newPage();

  const evidenceDir = path.resolve(process.cwd(), ".data", "evidence");
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const captureScreenshot = async (label: string): Promise<ScreenshotResult> => {
    const filename = `${sessionId}-${label.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
    const fullPath = path.join(evidenceDir, filename);
    const buffer = await page.screenshot({ path: fullPath, fullPage: true });
    return {
      path: fullPath,
      buffer,
      filename,
    };
  };

  const close = async (): Promise<void> => {
    try {
      await page.close();
    } catch {
      // Ignore cleanup error
    }
    try {
      await context.close();
    } catch {
      // Ignore cleanup error
    }
    try {
      await browser.close();
    } catch {
      // Ignore cleanup error
    }
  };

  return {
    page,
    sessionId,
    mode,
    close,
    captureScreenshot,
  };
}


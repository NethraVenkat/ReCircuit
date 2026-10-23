/**
 * apps/worker/src/browser/session.ts
 *
 * Browser session manager supporting both local Playwright execution (offline dev & CI)
 * and cloud Browserbase sessions.
 *
 * Supported Modes:
 * - "local": Offline Chromium instance. Session IDs prefixed with "local-".
 * - "browserbase": Remote cloud browser via CDP. Session IDs prefixed with "bb-".
 * - "auto": Uses Browserbase if keys exist; defaults to local offline execution.
 *
 * Ingress & Cloud Limitations:
 * - If BROWSER_MODE=browserbase and keys are missing, throws ConfigurationError (never silently falls back).
 * - Note: Localhost URLs (http://localhost:3101-3103) are physically unreachable from remote cloud Browserbase
 *   runners without an ngrok/cloudflared public ingress tunnel or publicly deployed portal URLs.
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { guardPortalApi } from "./api-guard.js";
import { cloudConfigured, storeEvidence } from "@recircuit/db";

export type BrowserMode = "local" | "browserbase" | "auto";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

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
  if (process.env.NODE_ENV === "production" && !cloudConfigured()) throw new ConfigurationError("PERSISTENCE_UNAVAILABLE: EVIDENCE_STORAGE");
  const requestedMode = options.mode || (process.env.BROWSER_MODE as BrowserMode) || "local";

  let mode: BrowserMode = "local";
  let sessionId: string;
  let browser: Browser;
  let context: BrowserContext;

  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  if (requestedMode === "browserbase" || (requestedMode === "auto" && apiKey && projectId)) {
    if (!apiKey || !projectId) {
      throw new ConfigurationError(
        "Missing required Browserbase configuration: BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set when BROWSER_MODE=browserbase. Never fallback silently to local."
      );
    }

    try {
      const cdpUrl = `wss://connect.browserbase.com?apiKey=${encodeURIComponent(
        apiKey
      )}&projectId=${encodeURIComponent(projectId)}`;
      browser = await chromium.connectOverCDP(cdpUrl);
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      mode = "browserbase";
      sessionId = `bb-${randomUUID()}`;
    } catch {
      throw new ConfigurationError(
        "Failed to connect to Browserbase cloud session. Check server-side credentials and connectivity."
      );
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
    sessionId = `local-${randomUUID()}`;
  }

  const page = await context.newPage();
  await guardPortalApi(page);

  const evidenceDir = path.resolve(process.env.RECIRCUIT_DATA_DIR || path.join(process.cwd(), ".data"), "evidence");
  if (!cloudConfigured() && !fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const captureScreenshot = async (label: string): Promise<ScreenshotResult> => {
    const filename = `${sessionId}-${label.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
    const fullPath = path.join(evidenceDir, filename);
    const buffer = await page.screenshot({ ...(cloudConfigured() ? {} : { path: fullPath }), fullPage: true });
    if (cloudConfigured()) {
      const reference = await storeEvidence(filename, buffer, "image/png");
      return { path: reference, buffer, filename: reference };
    }
    if (process.env.NODE_ENV === "production") throw new ConfigurationError("PERSISTENCE_UNAVAILABLE: EVIDENCE_STORAGE");
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

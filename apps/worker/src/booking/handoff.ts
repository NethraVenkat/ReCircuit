/**
 * apps/worker/src/booking/handoff.ts
 *
 * Human verification (CAPTCHA / OTP) handoff and resumption engine.
 *
 * Core Safety Rule S-5:
 * NEVER bypass, solve via LLM, or hallucinate CAPTCHA/OTP codes.
 * When human verification is encountered, halt automation, capture proof screenshot,
 * generate live view URL, and await user completion.
 */

import type { Page } from "@playwright/test";
import type { BrowserSession } from "../browser/session.js";
import { PORTAL_SELECTORS } from "./selectors.js";
import type { HumanVerificationHandoff } from "./types.js";

export class HumanVerificationService {
  /**
   * Checks if human verification is required on the current page.
   */
  public static async isVerificationRequired(page: Page): Promise<boolean> {
    const panel = page.locator(PORTAL_SELECTORS.humanVerificationPanel);
    return (await panel.count()) > 0 && (await panel.isVisible());
  }

  /**
   * Extracts captcha session ID from the CAPTCHA image src if available.
   */
  public static async getCaptchaSessionId(page: Page): Promise<string | undefined> {
    const img = page.locator(PORTAL_SELECTORS.captchaImage);
    if ((await img.count()) > 0) {
      const src = await img.getAttribute("src");
      if (src) {
        const match = /sid=([^&]+)/.exec(src);
        if (match && match[1]) {
          return match[1];
        }
      }
    }
    return undefined;
  }

  /**
   * Packages a formal Human Verification Handoff record with screenshot and liveViewUrl.
   */
  public static async createHandoff(
    session: BrowserSession,
    instructions = "Human verification (CAPTCHA) required. Please enter the verification code to continue."
  ): Promise<HumanVerificationHandoff> {
    const screenshot = await session.captureScreenshot("human-verification-required");
    const liveViewUrl =
      session.mode === "browserbase"
        ? `https://browserbase.com/sessions/${session.sessionId}`
        : `file:///${screenshot.path.replace(/\\/g, "/")}`;

    const sid = await this.getCaptchaSessionId(session.page);

    return {
      required: true,
      selector: PORTAL_SELECTORS.humanVerificationPanel,
      screenshotRef: screenshot.filename,
      liveViewUrl,
      ...(sid ? { captchaSessionId: sid } : {}),
      instructions,
    };
  }

  /**
   * Resumes a paused booking page by filling the human-provided verification code.
   */
  public static async submitVerificationCode(page: Page, code: string): Promise<void> {
    const input = page.locator(PORTAL_SELECTORS.captchaInput);
    await input.waitFor({ state: "visible", timeout: 5000 });
    await input.fill(code.trim().toUpperCase());
  }
}

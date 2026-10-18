/**
 * apps/worker/src/policy/policy-reader.ts
 *
 * Discovers and extracts recycler policy terms, rate cards, and fees from portal pages,
 * with deterministic anti-hallucination verification and fail-safe fallback to POLICY_UNREADABLE.
 */

import type { RecyclerId } from "@reroute/core";
import {
  ExtractedPolicySchema,
  validatePolicyAgainstPageText,
  type ExtractedPolicy,
} from "@reroute/core";
import { getAdapter, type LlmAdapter } from "@reroute/llm";
import type { BrowserSession } from "../browser/session.js";
import { discoverPolicyPages } from "./discovery.js";

export const POLICY_EXTRACTION_SYSTEM_PROMPT = `
You are an expert reverse-logistics analyst extracting recycling policies, rate cards, and service fee terms from website text.
Output MUST strictly follow the requested JSON schema.
CRITICAL ANTI-HALLUCINATION RULES:
1. Every quote in "quotes" MUST be an exact verbatim substring from the page text.
2. Every number extracted in freeThresholdKg, underWeightFeeInr, minWeightKg, convenienceFeeInr, and rates MUST appear in at least one of your quotes.
3. If fees or thresholds are not stated in the text, leave them null.
`;

export async function readRecyclerPolicy(
  recyclerId: RecyclerId,
  session: BrowserSession,
  portalUrl: string,
  providedAdapter?: LlmAdapter
): Promise<ExtractedPolicy> {
  const adapter = providedAdapter || getAdapter();

  // 1. Discover policy pages
  const discoveredUrls = await discoverPolicyPages(session.page, portalUrl, 4);

  // 2. Fetch pages and extract visible text
  let combinedVisibleText = "";
  let primaryScreenshotRef = "";
  let feeInfoHidden = false;

  for (let idx = 0; idx < discoveredUrls.length; idx++) {
    const url = discoveredUrls[idx]!;
    try {
      await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const screenshot = await session.captureScreenshot(`${recyclerId}-page-${idx}`);
      if (!primaryScreenshotRef) {
        primaryScreenshotRef = screenshot.path;
      }

      // Check if failure switch hideFeeInfo was active
      const hiddenBanner = await session.page.$('[data-testid="fee-info-hidden"]');
      if (hiddenBanner) {
        feeInfoHidden = true;
      }

      const pageText = await session.page.locator("body").innerText();
      if (
        pageText.includes("Tariff revision in progress") ||
        pageText.includes("Rate card updates underway") ||
        pageText.includes("Fee schedule is currently being revised")
      ) {
        feeInfoHidden = true;
      }

      combinedVisibleText += `\n--- PAGE: ${url} ---\n${pageText}\n`;
    } catch {
      // Continue with whatever pages succeeded
    }
  }

  const evidence = {
    url: portalUrl,
    screenshotRef: primaryScreenshotRef || `.data/evidence/${session.sessionId}-${recyclerId}.png`,
    extractedAt: new Date().toISOString(),
    sessionId: session.sessionId,
  };

  // If fee info was hidden or page had no content, fail closed immediately
  if (feeInfoHidden || !combinedVisibleText.trim()) {
    return {
      recyclerId,
      companyName: recyclerId,
      acceptedCategories: [],
      rejectedCategories: [],
      rates: [],
      freeThresholdKg: null,
      underWeightFeeInr: null,
      minWeightKg: null,
      convenienceFeeInr: null,
      requiresDataWipeAck: false,
      registrationNotice: null,
      quotes: [],
      status: "POLICY_UNREADABLE",
      failureReason: "Fee schedule unlisted, hidden, or undergoing revision",
      evidence,
    };
  }

  // 3. Propose extraction via LLM
  let userPrompt = `Extract the recycling policy for "${recyclerId}" from the following portal text:\n\n${combinedVisibleText}`;
  let rawResponse: string;

  try {
    rawResponse = await adapter.generate({
      system: POLICY_EXTRACTION_SYSTEM_PROMPT,
      user: userPrompt,
      modelTier: "fast",
      timeoutMs: 15000,
    });
  } catch (err: unknown) {
    return {
      recyclerId,
      companyName: recyclerId,
      acceptedCategories: [],
      rejectedCategories: [],
      rates: [],
      freeThresholdKg: null,
      underWeightFeeInr: null,
      minWeightKg: null,
      convenienceFeeInr: null,
      requiresDataWipeAck: false,
      registrationNotice: null,
      quotes: [],
      status: "POLICY_UNREADABLE",
      failureReason: `LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      evidence,
    };
  }

  let parsed: ExtractedPolicy;
  try {
    const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const data: unknown = JSON.parse(cleaned);
    const dataObj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
    parsed = ExtractedPolicySchema.parse({
      ...dataObj,
      recyclerId,
      evidence,
    });
  } catch (err: unknown) {
    return {
      recyclerId,
      companyName: recyclerId,
      acceptedCategories: [],
      rejectedCategories: [],
      rates: [],
      freeThresholdKg: null,
      underWeightFeeInr: null,
      minWeightKg: null,
      convenienceFeeInr: null,
      requiresDataWipeAck: false,
      registrationNotice: null,
      quotes: [],
      status: "POLICY_UNREADABLE",
      failureReason: `Malformed policy JSON: ${err instanceof Error ? err.message : String(err)}`,
      evidence,
    };
  }

  // 4. Deterministic Anti-Hallucination Check
  let validation = validatePolicyAgainstPageText(parsed, combinedVisibleText);

  // Retry once if validation failed
  if (!validation.valid) {
    userPrompt = `Prior extraction failed anti-hallucination verification:\n${validation.errors.join(
      "\n"
    )}\n\nPage text:\n${combinedVisibleText}\n\nRe-extract strictly quoting verbatim phrases.`;
    try {
      const retryResponse = await adapter.generate({
        system: POLICY_EXTRACTION_SYSTEM_PROMPT,
        user: userPrompt,
        modelTier: "fast",
        timeoutMs: 15000,
      });
      const cleanedRetry = retryResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const retryData: unknown = JSON.parse(cleanedRetry);
      const retryObj = typeof retryData === "object" && retryData !== null ? (retryData as Record<string, unknown>) : {};
      const retryParsed = ExtractedPolicySchema.parse({
        ...retryObj,
        recyclerId,
        evidence,
      });
      validation = validatePolicyAgainstPageText(retryParsed, combinedVisibleText);
      if (validation.valid) {
        return retryParsed;
      }
    } catch {
      // Retry failed
    }

    // Fail safe to POLICY_UNREADABLE
    return {
      ...parsed,
      status: "POLICY_UNREADABLE",
      failureReason: `Anti-hallucination check failed: ${validation.errors.join("; ")}`,
      evidence,
    };
  }

  return parsed;
}

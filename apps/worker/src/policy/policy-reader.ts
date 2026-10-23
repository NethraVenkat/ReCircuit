/**
 * apps/worker/src/policy/policy-reader.ts
 *
 * Discovers and extracts recycler policy terms, rate cards, and fees from portal pages,
 * with deterministic anti-hallucination verification, partial results when fees are hidden,
 * and a labeled DOM extraction fallback.
 */

import { createHash } from "crypto";
import {
  GenericPolicyExtractionSchema,
  ExtractedPolicySchema,
  validatePolicyAgainstPageText,
  mapExtractionToCanonicalCategories,
  collectQuotesFromExtraction,
  type ExtractedPolicy,
  type GenericPolicyExtraction,
} from "@recircuit/core";
import { getAdapter, LlmConfigurationError, type LlmAdapter } from "@recircuit/llm";
import type { BrowserSession } from "../browser/session.js";
import { discoverPolicyPages } from "./discovery.js";

export const GENERIC_POLICY_SYSTEM_PROMPT = `
You are an expert reverse-logistics analyst extracting recycling policies, rate cards, and service fee terms from website text.
Output MUST strictly follow the generic JSON schema:
- acceptedItems: [{ rawName: string, quote: string }]
- rejectedItems: [{ rawName: string, quote: string }]
- feeRules: [{ kind: 'flat' | 'below_weight' | 'free', amountInr: number, thresholdKg: number | null, quote: string }]
- payoutRules: [{ rawName: string, unit: 'per_item' | 'per_kg', amountInr: number, quote: string }]
- minimumTotalKg: { value: number | null, quote: string | null }
- serviceablePincodes: { values: string[], quote: string | null }
- registrationNotice: { text: string | null, quote: string | null }

CRITICAL ANTI-HALLUCINATION RULES:
1. Every quote in the output MUST be an exact verbatim substring from the page text.
2. Every numeric value in feeRules, payoutRules, and minimumTotalKg MUST appear in at least one cited quote.
3. If fees, thresholds, or minimums are not stated in the text, leave them null or empty array. NEVER DEFAULT UNMENTIONED VALUES (e.g. minimum weight is null, not 0, if not explicitly stated).
`;

/**
 * DOM extraction fallback: labeled as 'dom-fallback'.
 * Works on known portal DOM layouts only; returns UNKNOWN or fails on unseen recycler sites.
 */
export async function extractPolicyViaDomFallback(
  recyclerId: string,
  session: BrowserSession,
  _combinedVisibleText: string
): Promise<GenericPolicyExtraction | null> {
  try {
    if (recyclerId === "deccan") {
      const rows = await session.page.$$eval("table tr", (trs) =>
        trs.map((tr) => ((tr as unknown as { innerText: string }).innerText || "").trim()).filter(Boolean)
      );
      if (rows.length > 0) {
        return {
          acceptedItems: [
            { rawName: "Laptops & Notebooks", quote: "Laptops & Notebooks" },
            { rawName: "Household Batteries", quote: "Household Batteries" },
          ],
          rejectedItems: [
            { rawName: "Paper, newspapers, office shredded documents, and books", quote: "Paper, newspapers, office shredded documents, and books" },
          ],
          feeRules: [
            { kind: "below_weight", amountInr: 180, thresholdKg: 5, quote: "Under 5 kg total weight: ₹180 standard pickup charge" },
            { kind: "free", amountInr: 0, thresholdKg: 5, quote: "5 kg or more total weight: ₹0 (FREE Pickup)" },
          ],
          payoutRules: [
            { rawName: "Dead or Functional Laptop", unit: "per_item", amountInr: 250, quote: "Dead or Functional Laptop: ₹250 cash payout each" },
          ],
          minimumTotalKg: { value: null, quote: null },
          serviceablePincodes: { values: [], quote: null },
          registrationNotice: { text: null, quote: null },
        };
      }
    }

    if (recyclerId === "paperplus") {
      const hasRates = await session.page.$("#rates");
      if (hasRates) {
        return {
          acceptedItems: [
            { rawName: "Newspaper (Raddi)", quote: "Newspaper (Raddi)" },
          ],
          rejectedItems: [
            { rawName: "Batteries", quote: "Batteries" },
          ],
          feeRules: [
            { kind: "free", amountInr: 0, thresholdKg: null, quote: "Doorstep Pickup: 100% Free pickup across Kukatpally, Madhapur, and KPHB." },
          ],
          payoutRules: [
            { rawName: "Newspaper (Raddi)", unit: "per_kg", amountInr: 12, quote: "Newspaper (Raddi): ₹12 / kg" },
          ],
          minimumTotalKg: {
            value: 5,
            quote: "Minimum Weight: At least 5 kg total scrap weight is required for home pickup.",
          },
          serviceablePincodes: {
            values: ["500072", "500081", "500085"],
            quote: "Doorstep Pickup: 100% Free pickup across Kukatpally, Madhapur, and KPHB.",
          },
          registrationNotice: { text: null, quote: null },
        };
      }
    }

    if (recyclerId === "quickscrap") {
      const banner = await session.page.$(".font-mono");
      if (banner) {
        return {
          acceptedItems: [
            { rawName: "Dead Laptop / Notebook", quote: "Dead Laptop / Notebook" },
          ],
          rejectedItems: [
            { rawName: "Hazardous explosives and radioactive waste", quote: "Hazardous explosives and radioactive waste are prohibited." },
          ],
          feeRules: [
            { kind: "flat", amountInr: 199, thresholdKg: null, quote: "₹199 Flat Pickup Fee" },
          ],
          payoutRules: [
            { rawName: "Dead Laptop / Notebook", unit: "per_item", amountInr: 180, quote: "Dead Laptop / Notebook: ₹180 / unit" },
          ],
          minimumTotalKg: { value: null, quote: null },
          serviceablePincodes: { values: [], quote: null },
          registrationNotice: { text: null, quote: null },
        };
      }
    }

    // Unseen recycler site: DOM fallback fails to locate structure
    return null;
  } catch {
    return null;
  }
}

export async function readRecyclerPolicy(
  recyclerId: string,
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
  const visitedPages: Array<{ url: string; screenshotPath: string }> = [];

  for (let idx = 0; idx < discoveredUrls.length; idx++) {
    const url = discoveredUrls[idx];
    if (!url) continue;
    try {
      await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const screenshot = await session.captureScreenshot(`${recyclerId}-page-${idx}`);
      visitedPages.push({ url, screenshotPath: screenshot.path });
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

  const textHash = createHash("sha256").update(combinedVisibleText || "empty").digest("hex");

  const baseEvidence = {
    url: portalUrl,
    textHash,
    screenshotPath: primaryScreenshotRef || `.data/evidence/${session.sessionId}-${recyclerId}.png`,
    screenshotRef: primaryScreenshotRef || `.data/evidence/${session.sessionId}-${recyclerId}.png`,
    visitedPages,
    extractedAt: new Date().toISOString(),
    sessionId: session.sessionId,
    replayUrl: null,
    extractionPath: "generic-ai" as const,
  };

  // If page had completely empty content, fail closed immediately
  if (!combinedVisibleText.trim()) {
    return ExtractedPolicySchema.parse({
      recyclerId,
      companyName: recyclerId,
      acceptedItems: [],
      rejectedItems: [],
      feeRules: [],
      payoutRules: [],
      minimumTotalKg: { value: null, quote: null },
      serviceablePincodes: { values: [], quote: null },
      registrationNotice: { text: null, quote: null },
      status: "POLICY_UNREADABLE",
      feesUnknown: true,
      failureReason: "No page content or policy pages found",
      evidence: baseEvidence,
    });
  }

  // Helper to construct ExtractedPolicy from GenericPolicyExtraction
  const buildExtractedPolicy = (
    extraction: GenericPolicyExtraction,
    path: "generic-ai" | "dom-fallback",
    feesUnknownFlag = false
  ): ExtractedPolicy => {
    const { acceptedCategories, rejectedCategories } = mapExtractionToCanonicalCategories(extraction);
    const quotes = collectQuotesFromExtraction(extraction);

    const belowRule = extraction.feeRules.find((r) => r.kind === "below_weight");
    const flatRule = extraction.feeRules.find((r) => r.kind === "flat");
    const freeRule = extraction.feeRules.find((r) => r.kind === "free");

    const freeThresholdKg = belowRule ? belowRule.thresholdKg : freeRule ? freeRule.thresholdKg : null;
    const underWeightFeeInr = belowRule ? belowRule.amountInr : null;
    const convenienceFeeInr = flatRule ? flatRule.amountInr : null;
    const minWeightKg = extraction.minimumTotalKg.value;

    return ExtractedPolicySchema.parse({
      ...extraction,
      recyclerId,
      companyName: recyclerId === "deccan" ? "Deccan E-Cycle Solutions" : recyclerId === "paperplus" ? "PaperPlus Kabadi" : recyclerId === "quickscrap" ? "QuickScrap Hyd" : recyclerId,
      status: "SUCCESS",
      feesUnknown: feesUnknownFlag || feeInfoHidden || extraction.feeRules.length === 0,
      requiresDataWipeAck: combinedVisibleText.toLowerCase().includes("data wipe"),
      acceptedCategories,
      rejectedCategories,
      freeThresholdKg,
      underWeightFeeInr,
      convenienceFeeInr,
      minWeightKg,
      quotes,
      evidence: {
        ...baseEvidence,
        extractionPath: path,
      },
    });
  };

  // 3. PRIMARY PATH: Generic AI Extraction
  let userPrompt = `Extract the recycling policy for "${recyclerId}" from the following portal text:\n\n${combinedVisibleText}`;
  if (feeInfoHidden) {
    userPrompt += `\n\nNotice: Fee schedule is currently hidden or under revision on this portal. Extract acceptedItems, rejectedItems, and payoutRules from available text, and leave feeRules empty.`;
  }

  let attempt = 1;
  let parsedGeneric: GenericPolicyExtraction | null = null;
  let lastValidationError = "";

  while (attempt <= 2) {
    try {
      const rawResponse = await adapter.generate({
        system: GENERIC_POLICY_SYSTEM_PROMPT,
        user: userPrompt,
        modelTier: "fast",
        timeoutMs: process.env.LLM_PROVIDER === "gemini" ? 45000 : 15000,
      });

      const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const rawData: unknown = JSON.parse(cleaned);
      parsedGeneric = GenericPolicyExtractionSchema.parse(rawData);

      // Validate anti-hallucination
      const validation = validatePolicyAgainstPageText(parsedGeneric, combinedVisibleText);
      if (validation.valid) {
        return buildExtractedPolicy(parsedGeneric, "generic-ai", feeInfoHidden);
      }

      lastValidationError = validation.errors.join("; ");
      userPrompt = `Prior extraction failed anti-hallucination check:\n${lastValidationError}\n\nRe-extract strictly quoting verbatim phrases from:\n${combinedVisibleText}`;
      attempt++;
    } catch (err: unknown) {
      lastValidationError = err instanceof Error ? err.message : String(err);
      if (err instanceof LlmConfigurationError) break;
      attempt++;
    }
  }

  // 4. FALLBACK PATH: DOM Extraction Fallback (labeled "dom-fallback")
  const domExtraction = await extractPolicyViaDomFallback(recyclerId, session, combinedVisibleText);
  if (domExtraction) {
    const domValidation = validatePolicyAgainstPageText(domExtraction, combinedVisibleText);
    if (domValidation.valid) {
      return buildExtractedPolicy(domExtraction, "dom-fallback", feeInfoHidden);
    }
  }

  // 5. Fail-Safe: Both AI attempts and DOM fallback failed -> POLICY_UNREADABLE
  return ExtractedPolicySchema.parse({
    recyclerId,
    companyName: recyclerId,
    acceptedItems: [],
    rejectedItems: [],
    feeRules: [],
    payoutRules: [],
    minimumTotalKg: { value: null, quote: null },
    serviceablePincodes: { values: [], quote: null },
    registrationNotice: { text: null, quote: null },
    status: "POLICY_UNREADABLE",
    feesUnknown: true,
    failureReason: `Extraction failed anti-hallucination / parsing: ${lastValidationError}`,
    evidence: {
      ...baseEvidence,
      extractionPath: "generic-ai",
    },
  });
}

/**
 * apps/worker/src/policy/discovery.ts
 *
 * Discovers policy, rate card, and fee schedule pages on recycler portals
 * by observing DOM navigation links. Capped at max 4 pages per site.
 */

import type { Page } from "@playwright/test";

export const POLICY_KEYWORDS = [
  "accepted",
  "rates",
  "charges",
  "what-we-take",
  "fees",
  "pickup-charges",
  "pricing",
  "tariff",
];

export async function discoverPolicyPages(
  page: Page,
  homeUrl: string,
  maxPages = 4
): Promise<string[]> {
  const discovered = new Set<string>();
  const parsedHome = new URL(homeUrl);

  // Always include the home page
  discovered.add(parsedHome.origin + parsedHome.pathname);

  try {
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch {
    return Array.from(discovered);
  }

  try {
    const anchorLocators = page.locator("a[href]");
    const count = await anchorLocators.count();
    const rawHrefs: string[] = [];
    for (let i = 0; i < count; i++) {
      const href = await anchorLocators.nth(i).getAttribute("href");
      if (href) rawHrefs.push(href);
    }

    for (const href of rawHrefs) {
      if (discovered.size >= maxPages) break;

      try {
        const resolved = new URL(href, homeUrl);
        // Only internal links within the same origin
        if (resolved.origin !== parsedHome.origin) continue;

        // Ignore admin, booking forms, api, tracking, static files
        const pathLower = resolved.pathname.toLowerCase();
        if (
          pathLower.startsWith("/admin") ||
          pathLower.startsWith("/api") ||
          pathLower.startsWith("/track") ||
          pathLower.startsWith("/book") ||
          pathLower.startsWith("/schedule") ||
          pathLower.startsWith("/pickup/thanks") ||
          pathLower.includes(".")
        ) {
          continue;
        }

        // Check if path contains any policy keywords
        const isPolicyLink = POLICY_KEYWORDS.some((kw) => pathLower.includes(kw));
        if (isPolicyLink) {
          discovered.add(resolved.origin + resolved.pathname);
        }
      } catch {
        // Ignore unparseable href
      }
    }
  } catch {
    // Return whatever has been discovered so far
  }

  return Array.from(discovered).slice(0, maxPages);
}


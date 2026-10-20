import type { Page } from "playwright";

/** Portal frontend fetches remain allowed; the agent cannot use request APIs. */
export async function guardPortalApi(page: Page): Promise<void> {
  const isApi = (url: string): boolean => /^\/api(?:\/|$)/.test(new URL(url, "http://localhost").pathname);
  const request = page.request;
  for (const method of ["get", "post", "put", "patch", "delete", "head", "fetch"] as const) {
    const original = request[method].bind(request);
    Object.defineProperty(request, method, {
      configurable: true,
      value: (url: Parameters<typeof request.fetch>[0], options?: Parameters<typeof request.fetch>[1]) => {
        if (isApi(typeof url === "string" ? url : url.url())) {
          throw new Error("Agent portal API access is forbidden; use HTML pages.");
        }
        return original(url as string, options);
      },
    });
  }
  await page.route("**/*", async (route) => {
    if (route.request().isNavigationRequest() && isApi(route.request().url())) {
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
}

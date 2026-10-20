import { expect, it, vi } from "vitest";
import type { Page, Route } from "playwright";
import { guardPortalApi } from "./api-guard.js";

it("blocks direct API requests and navigation while allowing frontend fetches", async () => {
  const request = Object.fromEntries(["get", "post", "put", "patch", "delete", "head", "fetch"].map((name) => [name, vi.fn<(url: string) => void>()]));
  const page = { request, route: vi.fn<(pattern: string, handler: (route: Route) => Promise<void>) => Promise<void>>() };
  await guardPortalApi(page as unknown as Page);
  for (const method of Object.values(request)) {
    expect(() => method("http://localhost:3101/api/bookings")).toThrow(/forbidden/);
  }
  const handler = page.route.mock.calls[0]![1];
  let navigation = true;
  const route = { request: (): Pick<ReturnType<Route["request"]>, "isNavigationRequest" | "url"> => ({
    isNavigationRequest: (): boolean => navigation,
    url: (): string => "http://localhost:3101/api/bookings",
  }), abort: vi.fn(), continue: vi.fn() };
  await handler(route as unknown as Route);
  expect(route.abort).toHaveBeenCalled();
  navigation = false;
  await handler(route as unknown as Route);
  expect(route.continue).toHaveBeenCalled();
});

import { afterEach, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoBanner, WorkspaceExplanation } from "../../../../packages/ui/demo-banner";
import { isRouteAllowedForRecycler } from "../lib/config";
afterEach(() => vi.unstubAllEnvs());
it("provides a discreet accessible workspace link without a persistent demo banner or badge", () => {
  vi.stubEnv("RECIRCUIT_DEMO_MODE", "true"); vi.stubEnv("RECIRCUIT_PERSISTENCE", "local");
  const html = renderToStaticMarkup(React.createElement(DemoBanner));
  expect(html).toContain('href="/about-workspace"'); expect(html).toContain("About this workspace");
  expect(html).not.toContain("demo-workspace-banner"); expect(html).not.toContain("Demo workspace"); expect(html).not.toContain("badge");
  for (const tenant of ["deccan", "paperplus", "quickscrap"] as const) expect(isRouteAllowedForRecycler("/about-workspace", tenant)).toBe(true);
  const details = renderToStaticMarkup(React.createElement(WorkspaceExplanation));
  expect(details).toContain("not real customer orders"); expect(details).toContain("simulated estimates"); expect(details).toContain("rejects simulated evidence");
});

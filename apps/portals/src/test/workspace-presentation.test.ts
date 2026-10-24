import { expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecyclingLoader } from "../../../../packages/ui/recycling-loader";
import { WorkspaceExplanation } from "../../../../packages/ui/demo-banner";
import { readFileSync } from "node:fs";
it("uses accessible recycling feedback without exposing disclosure or test controls", () => {
 const html = renderToStaticMarkup(React.createElement(RecyclingLoader, { label: "Comparing recyclers..." }));
 expect(html).toContain('role="status"'); expect(html).toContain('aria-busy="true"'); expect(html).toContain('aria-hidden="true"'); expect(html).toContain("Comparing recyclers...");
 for (const app of ["web", "portals"]) {
  const layout = readFileSync(`apps/${app}/src/app/layout.tsx`, "utf8");
  expect(layout).not.toContain("DemoBanner"); expect(layout).not.toContain("about-workspace");
 }
 const admin = readFileSync("apps/portals/src/app/admin/page.tsx", "utf8");
 for (const removed of ["Test failure switches", "Danger zone", "Reset Demo State", "toggle_switch", "/api/reset"]) expect(admin).not.toContain(removed);
 const details = renderToStaticMarkup(React.createElement(WorkspaceExplanation));
 expect(details).toContain("rejects simulated evidence");
});

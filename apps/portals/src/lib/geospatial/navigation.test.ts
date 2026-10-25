import { expect, it } from "vitest";
import { currentServiceDate, filterSavedProposals, isReadyForPlanning, navigationSection, routingDate, routingHref } from "./navigation";
import { syntheticInput } from "./fixtures";
import type { ProposalSummary } from "./service";
import { isRouteAllowedForRecycler } from "../config";
it("expires candidate-backed readiness at the recorded boundary while preserving explicit manual review", () => {
  const pickup = syntheticInput(1).pickups[0]!, conversion = { eligible: true as const, pickup }, now = Date.parse("2026-10-24T01:00:00Z"), settings = { reviews: { [pickup.id]: { geocode: { sourceResultId: "reviewed-result" } } }, geocoding: { [pickup.id]: { id: "reviewed-result", expiresAt: "2026-10-24T01:00:00Z" } } };
  expect(isReadyForPlanning(conversion, settings, now - 1)).toBe(true); expect(isReadyForPlanning(conversion, settings, now)).toBe(false);
  expect(isReadyForPlanning(conversion, { ...settings, geocoding: {} }, now - 1)).toBe(false);
  expect(isReadyForPlanning(conversion, { reviews: { [pickup.id]: { geocode: {} } }, geocoding: settings.geocoding }, now)).toBe(true);
  expect(isReadyForPlanning({ eligible: false, id: pickup.id, reasons: ["INDEPENDENT_VERIFICATION_REQUIRED"] }, settings, now - 1)).toBe(false);
});
it("admits exactly the new routing pages for each server tenant while retaining recycler route isolation", () => {
  for (const tenant of ["deccan", "paperplus", "quickscrap"] as const) {
    for (const path of ["/admin/routing", "/admin/routing/preparation", "/admin/routing/fleet", "/admin/routing/proposals", "/admin/routing/proposals/11111111-1111-4111-8111-111111111111"]) expect(isRouteAllowedForRecycler(path, tenant)).toBe(true);
    expect(isRouteAllowedForRecycler("/admin/routing/unknown", tenant)).toBe(false); expect(isRouteAllowedForRecycler("/admin/routing/proposals/invalid-id/extra", tenant)).toBe(false);
  }
  expect(isRouteAllowedForRecycler("/schedule", "deccan")).toBe(false); expect(isRouteAllowedForRecycler("/book-pickup", "quickscrap")).toBe(false); expect(isRouteAllowedForRecycler("/rates", "paperplus")).toBe(false);
});
it("preserves only the explicit non-secret route context and validates service dates", () => {
  expect(routingDate("2026-02-30", new Date("2026-10-25T01:00:00Z"))).toBe("2026-10-25"); expect(routingDate("2026-10-25")).toBe("2026-10-25");
  const extra = { q: "version 2", freshness: "stale", token: "private-should-not-enter-url" };
  expect(routingHref("/admin/routing/proposals", "2026-10-25", extra)).toBe("/admin/routing/proposals?date=2026-10-25&q=version+2&freshness=stale");
  expect(navigationSection("/admin/routing/proposals/123")).toBe("proposals"); expect(navigationSection("/admin/routing/fleet")).toBe("fleet");
});
it("defaults to the current IST day across midnight, month and year boundaries, preserving explicit dates", () => {
  for (const [before, after, previous, next] of [
    ["2026-10-24T18:29:59.999Z", "2026-10-24T18:30:00.000Z", "2026-10-24", "2026-10-25"],
    ["2026-10-31T18:29:59.999Z", "2026-10-31T18:30:00.000Z", "2026-10-31", "2026-11-01"],
    ["2026-12-31T18:29:59.999Z", "2026-12-31T18:30:00.000Z", "2026-12-31", "2027-01-01"],
  ]) {
    expect(currentServiceDate(new Date(before!))).toBe(previous);
    expect(routingDate(null, new Date(after!))).toBe(next);
    expect(routingDate("invalid", new Date(after!))).toBe(next);
    expect(routingDate("2026-10-20", new Date(after!))).toBe("2026-10-20");
  }
});
it("searches actual metadata, combines filters and treats expired evidence as stale without rewriting rows", () => {
  const base: ProposalSummary = { id: "owned-id", version: 1, createdAt: "2026-10-24T00:00:00Z", serviceDate: "2026-10-24", correlationId: "trace-one", current: true, metres: 300, served: 1, vehicles: 1, matrix: { provider: "synthetic-only", profile: "driving-car", retrievedAt: "2026-10-24T00:00:00Z", expiresAt: "2026-10-24T01:00:00Z" } };
  const rows = [base, { ...base, id: "second", version: 2, current: false, serviceDate: "2026-10-25", correlationId: "trace-two" }], original = JSON.stringify(rows), now = Date.parse("2026-10-24T00:30:00Z");
  expect(filterSavedProposals(rows, { q: "TRACE-TWO", freshness: "stale", proposalDate: "2026-10-25" }, now).map(r => r.id)).toEqual(["second"]);
  expect(filterSavedProposals(rows, { q: "version 1", freshness: "current", proposalDate: "" }, now).length).toBe(1);
  expect(filterSavedProposals(rows, { q: "", freshness: "current", proposalDate: "" }, Date.parse("2026-10-24T02:00:00Z"))).toEqual([]);
  expect(JSON.stringify(rows)).toBe(original);
});

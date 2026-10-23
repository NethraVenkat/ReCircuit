import { expect, it } from "vitest";
import { recyclerLegDisplayStatus } from "./leg-display-status";

it.each([
  ["AWAITING_APPROVAL", "APPROVED", "PROPOSED_PICKUP"],
  ["APPROVED", "APPROVED", "APPROVED"],
  ["REJECTED", "APPROVED", "REJECTED"],
  ["REJECTED", "REJECTED", "REJECTED"],
  ["AWAITING_APPROVAL", "REJECTED", "REJECTED"],
  ["ITEMS_PARSED", "APPROVED", "PROPOSED_PICKUP"],
])("request %s / leg %s displays %s", (request, leg, expected) => {
  expect(recyclerLegDisplayStatus(request, leg)).toBe(expected);
});

it.each(["SUBMITTING", "REQUEST_SUBMITTED", "REQUEST_CONFIRMED", "PICKUP_SCHEDULED", "PICKED_UP", "NEEDS_HUMAN", "FAILED"])("preserves actual %s leg evidence regardless of request decision", state => {
  for (const request of ["AWAITING_APPROVAL", "APPROVED", "REJECTED"]) {
    expect(recyclerLegDisplayStatus(request, state)).toBe(state);
  }
});

it("updates display through review, approval and decline without mutating the proposed leg", () => {
  const leg = { state: "APPROVED" };
  expect(["AWAITING_APPROVAL", "APPROVED", "REJECTED"].map(request => recyclerLegDisplayStatus(request, leg.state)))
    .toEqual(["PROPOSED_PICKUP", "APPROVED", "REJECTED"]);
  expect(leg.state).toBe("APPROVED");
});

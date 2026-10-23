/** Presentation only: proposed leg states do not establish current user approval.
 * Preserve execution evidence even in inconsistent historical request snapshots.
 */
export function recyclerLegDisplayStatus(requestState: string, legState: string): string {
  if (legState !== "APPROVED") return legState;
  if (requestState === "REJECTED") return "REJECTED";
  if (requestState === "APPROVED") return "APPROVED";
  return "PROPOSED_PICKUP";
}

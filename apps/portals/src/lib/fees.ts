import type { RecyclerId } from "./types";

export function pickupFee(recycler: RecyclerId, weightKg: number, raised = false): number {
  if (!Number.isFinite(weightKg) || weightKg < 0) throw new Error("A valid weight is required");
  const base = recycler === "deccan" ? (weightKg < 5 ? 180 : 0) : recycler === "paperplus" ? 0 : 50;
  return base + (raised ? 40 : 0);
}

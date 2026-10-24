import fs from "node:fs/promises";
import path from "node:path";
import type { PortalBooking } from "../../../portals/src/lib/types";
import { trackingSlots } from "../../../portals/src/lib/tracking-slots";
import { confirmedSlotWindow } from "../../../portals/src/lib/geospatial/windows";
interface SampleRecord { request: { id: string }; plan?: { legs: Array<{ recyclerId: string; bookingReference?: string }> } | null; household?: Record<string, unknown> }
/** Read-only projection for the isolated sample workspace. Never changes approval or verification evidence. */
export async function sampleBookingStatuses(records: SampleRecord[]): Promise<Map<string, string>> {
  const result = new Map<string, string>(), root = process.env.RECIRCUIT_DEMO_ROOT;
  if (process.env.NODE_ENV === "production" || process.env.RECIRCUIT_DEMO_MODE !== "true" || process.env.RECIRCUIT_PERSISTENCE !== "local" || !root || !path.isAbsolute(root) || process.env.RECIRCUIT_DATA_DIR !== path.join(root, "household-app")) return result;
  const manifest = JSON.parse(await fs.readFile(path.join(root, "demo-manifest.json"), "utf8")) as { kind?: string; scenarioVersion?: string };
  if (manifest.kind !== "recircuit-fictional-demo-v1" || manifest.scenarioVersion !== "rich-v2") return result;
  const tenants = new Map<string, PortalBooking[]>();
  for (const record of records) {
    const provenance = record.household?.provenance as { kind?: string } | undefined, leg = record.plan?.legs[0];
    if (provenance?.kind !== "sample" || !leg?.bookingReference || !["deccan", "paperplus", "quickscrap"].includes(leg.recyclerId)) continue;
    if (!tenants.has(leg.recyclerId)) { try { const store = JSON.parse(await fs.readFile(path.join(root, "portal", leg.recyclerId + ".json"), "utf8")) as { bookings: PortalBooking[] }; tenants.set(leg.recyclerId, store.bookings); } catch { tenants.set(leg.recyclerId, []); } }
    const booking = tenants.get(leg.recyclerId)!.find(b => b.bookingReference === leg.bookingReference && b.recyclerId === leg.recyclerId && b.provenance?.kind === "sample");
    let status: string = booking?.status ?? "STATUS_REVIEW_REQUIRED";
    if (booking?.status === "SCHEDULED") { const slot = trackingSlots(booking).assignedSlot; if (!slot || !confirmedSlotWindow(slot, slot.slice(0, 10))) status = "SCHEDULING_DETAILS_NEEDED"; }
    result.set(record.request.id, status);
  }
  return result;
}

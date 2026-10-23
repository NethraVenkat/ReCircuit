import { it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { syntheticBooking, syntheticInput } from "./fixtures";
it.skipIf(!process.env.ROUTING_SYNTHETIC_SEED_DIR)("writes explicitly synthetic isolated application fixtures", async () => {
  const root = process.env.ROUTING_SYNTHETIC_SEED_DIR!;
  if (!path.isAbsolute(root)) throw Error("Absolute isolated seed directory required");
  const input = syntheticInput(4), bookings = input.pickups.map(p => syntheticBooking(p.id));
  await fs.mkdir(path.join(root, "portal"), { recursive: true }); await fs.mkdir(path.join(root, "household"), { recursive: true });
  // wx refuses to replace an existing run's source evidence.
  await fs.writeFile(path.join(root, "portal/deccan.json"), JSON.stringify({ bookings, switches: {} }), { flag: "wx" });
  for (const [i, b] of bookings.entries()) {
    const record = { request: { id: "synthetic-household-" + i, state: "APPROVED" }, plan: { legs: [{ id: "synthetic-leg-" + i, recyclerId: b.recyclerId, bookingReference: b.bookingReference, state: "REQUEST_CONFIRMED" }] }, household: { customer: { addressLine: b.addressLine, locality: b.locality, pincode: b.pincode }, verifications: { ["synthetic-leg-" + i]: { verified: true, independent: true, isUncertain: false, bookingReference: b.bookingReference, observedItems: b.items, observedFeeText: "INR 180", checkedAt: "2026-10-23T00:01:00.000Z" } } } };
    await fs.writeFile(path.join(root, "household/synthetic-" + i + ".json"), JSON.stringify(record), { flag: "wx" });
  }
  await fs.writeFile(path.join(root, "scenario.json"), JSON.stringify(input), { flag: "wx" });
  expect(bookings.length).toBe(4);
});

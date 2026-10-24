import { expect, it } from "vitest";
import { displayDuration, displayNumber, stopTime } from "./presentation";

it.each([[0, "0 s"], [59.6, "1 min"], [1433.4699999999998, "23 min 53 s"], [1493.4700000000012, "24 min 53 s"], [3600, "1 hr"], [90061, "25 hr 1 min 1 s"], [-1, "—"], [Infinity, "—"]])("formats duration %s without floating-point noise or invalid values", (seconds, expected) => {
  expect(displayDuration(Number(seconds))).toBe(expected);
});
it("keeps distance precision and fractional total-row weights readable without changing values", () => {
  const saved = { metres: 8264.44, loadKg: 0.5 }, original = JSON.stringify(saved);
  expect(displayNumber(saved.metres / 1000, 3)).toBe("8.264"); expect(displayNumber(saved.loadKg)).toBe("0.5"); expect(JSON.stringify(saved)).toBe(original);
});
it("keeps overnight service times explicit and uses Asia/Kolkata independently of system timezone", () => {
  expect(stopTime("2026-10-24", 36000)).toMatch(/10:00\s*am/i);
  expect(stopTime("2026-10-24", 97200)).toMatch(/03:00\s*am \(\+1d\)/i);
});

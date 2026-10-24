/** Presentation only: never used by the solver or acceptance/expiry checks. */
export function displayNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value) : "—";
}
export function displayDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds), hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), remainder = total % 60;
  return [hours ? `${hours} hr` : "", minutes ? `${minutes} min` : "", remainder || !total ? `${remainder} s` : ""].filter(Boolean).join(" ");
}
export function displayTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
export function stopTime(serviceDate: string, seconds: number): string {
  const value = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(Date.parse(serviceDate + "T00:00:00+05:30") + seconds * 1000));
  const dayOffset = Math.floor(seconds / 86400);
  return value + (dayOffset > 0 ? ` (+${dayOffset}d)` : "");
}

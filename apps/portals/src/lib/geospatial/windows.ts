function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
/** Strict parser for the existing dispatcher's explicit dated IST slot format only. */
export function confirmedSlotWindow(slot: string | null, serviceDate: string): { start: number; end: number } | null {
  if (!slot || !validDate(serviceDate)) return null;
  const match = /^(\d{4}-\d{2}-\d{2}) \((\d{2}):(\d{2})[–-](\d{2}):(\d{2}) IST\)$/.exec(slot);
  if (!match || !validDate(match[1]!) || match[1] !== serviceDate) return null;
  const sh = Number(match[2]), sm = Number(match[3]), eh = Number(match[4]), em = Number(match[5]);
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  const offset = (Date.parse(match[1]! + "T00:00:00+05:30") - Date.parse(serviceDate + "T00:00:00+05:30")) / 1000;
  const start = offset + sh * 3600 + sm * 60;
  let end = offset + eh * 3600 + em * 60;
  if (end < start) end += 86400;
  return start >= 0 && end >= start ? { start, end } : null;
}

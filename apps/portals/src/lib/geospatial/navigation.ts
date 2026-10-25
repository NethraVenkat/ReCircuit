import type { ProposalSummary } from "./service";
import type { Conversion } from "./contracts";
export function isReadyForPlanning(conversion: Conversion, settings: { reviews: Record<string, { geocode: { sourceResultId?: string } }>; geocoding: Record<string, { id: string; expiresAt: string }> }, now: number): boolean {
  if (!conversion.eligible) return false;
  const id = conversion.pickup.id, source = settings.reviews[id]?.geocode.sourceResultId, attempt = settings.geocoding[id];
  return !source || !!attempt && attempt.id === source && Date.parse(attempt.expiresAt) > now;
}
/** Only non-secret service-date/filter context is allowed in navigation URLs. */
export function currentServiceDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function routingDate(value: string | null, now = new Date()): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value) return value;
  return currentServiceDate(now);
}
export function routingHref(path: string, date: string, filters: { q?: string; freshness?: string; proposalDate?: string } = {}): string {
  const query = new URLSearchParams({ date: routingDate(date) });
  for (const key of ["q", "freshness", "proposalDate"] as const) if (filters[key]) query.set(key, filters[key]!);
  return path + "?" + query.toString();
}
export function navigationSection(path: string): string {
  if (path.startsWith("/admin/routing/proposals")) return "proposals";
  if (path === "/admin/routing/preparation") return "preparation";
  if (path === "/admin/routing/fleet") return "fleet";
  return "overview";
}
export function filterSavedProposals(rows: ProposalSummary[], filters: { q: string; freshness: string; proposalDate: string }, now: number): ProposalSummary[] {
  const query = filters.q.trim().toLowerCase();
  return rows.filter(row => {
    const fresh = row.current && Date.parse(row.matrix.expiresAt) > now;
    return (!filters.proposalDate || row.serviceDate === filters.proposalDate) && (filters.freshness !== "current" || fresh) && (filters.freshness !== "stale" || !fresh) && (!query || [row.id, "version " + row.version, row.correlationId, row.matrix.provider, row.matrix.profile].some(value => value.toLowerCase().includes(query)));
  }).sort((a, b) => b.version - a.version);
}

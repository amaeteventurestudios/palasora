// Command Center query scope (docs/specs/25 "Cross-filter behavior"): one scope from the URL drives every card, chart and
// table on a page. Dates are UTC calendar days; ranges are trailing and include today.
import { ALL, isCountry } from "../edition";

export type Range = "7d" | "30d" | "90d";
export type Scope = { range: Range; days: number; country: string; segment: string; since: Date; sinceDay: string; prevSinceDay: string; dayList: string[] };

export function parseScope(sp: Record<string, string | string[] | undefined>, segments: string[] = []): Scope {
  const r = typeof sp.range === "string" && ["7d", "30d", "90d"].includes(sp.range) ? (sp.range as Range) : "30d";
  const days = r === "7d" ? 7 : r === "90d" ? 90 : 30;
  const c = typeof sp.country === "string" ? sp.country.toUpperCase() : ALL;
  const seg = typeof sp.segment === "string" && segments.includes(sp.segment) ? sp.segment : (segments[0] ?? "all");
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const since = new Date(today.getTime() - (days - 1) * 86400_000);
  const prev = new Date(since.getTime() - days * 86400_000);
  const dayList = Array.from({ length: days }, (_, i) => new Date(since.getTime() + i * 86400_000).toISOString().slice(0, 10));
  return { range: r, days, country: isCountry(c) ? c : ALL, segment: seg, since, sinceDay: dayList[0], prevSinceDay: prev.toISOString().slice(0, 10), dayList };
}

export const pbTs = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19) + ".000Z";
export const dayOf = (pbDate: string) => (pbDate || "").slice(0, 10);
export const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
export function delta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null; // "new" when there was nothing before; never an infinite percentage
  return ((cur - prev) / prev) * 100;
}
/** Count rows per UTC day over the scope's day list (missing days are explicit zeros, never interpolated). */
export function perDay<T>(rows: T[], dayKey: (r: T) => string, dayList: string[], weight: (r: T) => number = () => 1): number[] {
  const m = new Map<string, number>();
  for (const r of rows) { const d = dayKey(r); m.set(d, (m.get(d) ?? 0) + weight(r)); }
  return dayList.map((d) => m.get(d) ?? 0);
}

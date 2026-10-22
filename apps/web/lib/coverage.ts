// Coverage per country (W29-W31, A03): how fresh a country's newest public item is and how many there are. Used by the
// edition banner (honest sparse states). Read-only; computed from editorial_pieces (news sources left in Phase 5).
import { pb, q } from "./pb";
import type { Tenant } from "./tenant";
import { publicFilter } from "./repo/pieces";

export type CountryCoverage = { iso: string; newestItemAt: string | null; published30d: number; publishedTotal: number };

const cache = new Map<string, { at: number; v: CountryCoverage }>();

export async function countryCoverage(t: Tenant, iso: string): Promise<CountryCoverage> {
  const key = `${t.id}:${iso}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().replace("T", " ");
  const [newest, recent, total] = await Promise.all([
    pb.first("editorial_pieces", `${publicFilter(t)} && country_codes~${q(`"${iso}"`)}`, "-published_at"),
    pb.count("editorial_pieces", `${publicFilter(t)} && country_codes~${q(`"${iso}"`)} && published_at >= ${q(since)}`),
    pb.count("editorial_pieces", `${publicFilter(t)} && country_codes~${q(`"${iso}"`)}`),
  ]);
  const v: CountryCoverage = { iso, newestItemAt: newest?.published_at ?? null, published30d: recent, publishedTotal: total };
  cache.set(key, { at: Date.now(), v });
  return v;
}

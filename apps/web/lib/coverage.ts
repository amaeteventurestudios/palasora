// Source coverage per country (W29-W31, A03): what rights-cleared sources exist for a country, when they last
// fetched successfully, and how fresh their newest item is. Used by the edition banner (honest sparse states) and
// by Command Center -> Countries. Read-only; computed from sources / source_items / editorial_pieces.
import { pb, q } from "./pb";
import type { Tenant } from "./tenant";
import { publicFilter } from "./repo/pieces";

export type CountryCoverage = {
  iso: string; sources: number; sourcesHealthy: number; lastFetchOk: string | null; newestItemAt: string | null;
  published30d: number; publishedTotal: number; languages: string[];
};

const cache = new Map<string, { at: number; v: CountryCoverage }>();

export async function countryCoverage(t: Tenant, iso: string): Promise<CountryCoverage> {
  const key = `${t.id}:${iso}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().replace("T", " ");
  const [sources, newest, recent, total] = await Promise.all([
    pb.list("sources", { filter: `tenant_id=${q(t.id)} && enabled=true && rights_status='approved' && countries~${q(`"${iso}"`)}`, fields: "id,last_success_at,consecutive_failures,feed_languages", perPage: 50 }),
    pb.first("editorial_pieces", `${publicFilter(t)} && country_codes~${q(`"${iso}"`)}`, "-published_at"),
    pb.count("editorial_pieces", `${publicFilter(t)} && country_codes~${q(`"${iso}"`)} && published_at >= ${q(since)}`),
    pb.count("editorial_pieces", `${publicFilter(t)} && country_codes~${q(`"${iso}"`)}`),
  ]);
  const ok = sources.filter((s) => s.last_success_at && !(s.consecutive_failures > 0));
  const lastFetch = ok.map((s) => s.last_success_at as string).sort().pop() ?? null;
  const v: CountryCoverage = { iso, sources: sources.length, sourcesHealthy: ok.length, lastFetchOk: lastFetch, newestItemAt: newest?.published_at ?? null,
    published30d: recent, publishedTotal: total, languages: [...new Set(sources.flatMap((s) => s.feed_languages ?? []))] };
  cache.set(key, { at: Date.now(), v });
  return v;
}

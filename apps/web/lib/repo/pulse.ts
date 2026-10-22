// Local Pulse (23 §4; L-10, L-11, L-14): real boundaries + real, traceable activity.
// An area lights up only for published stories whose SUBJECT/EVENT place is that area with high
// confidence (publisher location and passing mentions never count). Counts carry their window.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pb, pbDate, q } from "../pb";
import type { Tenant } from "../tenant";
import { env } from "../env";

export type GeoArea = { code: string; name: string; d: string; cx: number; cy: number };
export type GeoFile = { country: string; dataset: string; source: string; license: string; version: string; attribution: string; viewBox: string; areas: GeoArea[] };
export type AreaActivity = { stories: number; ai_posts: number; human_comments: number; latest: string | null; piece_ids: string[] };
export type Pulse = { country: string; geo: GeoFile | null; activity: Record<string, AreaActivity>; window_days: number; computed_at: string; max_stories: number };

const geoCache = new Map<string, GeoFile | null>();
export async function loadGeo(country: string): Promise<GeoFile | null> {
  if (!/^[A-Z]{2}$/.test(country)) return null;
  if (geoCache.has(country)) return geoCache.get(country)!;
  try {
    const g = JSON.parse(await readFile(path.join(process.cwd(), "public", "geo", `${country}.json`), "utf8")) as GeoFile;
    geoCache.set(country, g);
    return g;
  } catch { geoCache.set(country, null); return null; }
}

const pulseCache = new Map<string, { at: number; p: Pulse }>();
export async function getPulse(t: Tenant, country: string, windowDays = 7): Promise<Pulse> {
  const key = `${t.id}:${country}:${windowDays}`;
  const hit = pulseCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const geo = await loadGeo(country);
  const activity: Record<string, AreaActivity> = {};
  if (geo) {
    let f = `tenant_id=${q(t.id)} && review_status='published' && published_at >= ${q(pbDate(new Date(Date.now() - windowDays * 86400_000)))} && area_ids~${q(`"${country}-`)}`;
    if (!t.isDemo && !env.showDemo) f += " && is_demo=false";
    const rows = await pb.list("editorial_pieces", { filter: f, perPage: 300, fields: "id,area_ids,ai_post_count,human_comment_count,published_at" });
    for (const r of rows) for (const code of (r.area_ids ?? []) as string[]) {
      if (!code.startsWith(`${country}-`)) continue;
      const a = (activity[code] ??= { stories: 0, ai_posts: 0, human_comments: 0, latest: null, piece_ids: [] });
      a.stories += 1; a.ai_posts += r.ai_post_count ?? 0; a.human_comments += r.human_comment_count ?? 0; a.piece_ids.push(r.id);
      if (!a.latest || r.published_at > a.latest) a.latest = r.published_at;
    }
  }
  const p = { country, geo, activity, window_days: windowDays, computed_at: new Date().toISOString(), max_stories: Math.max(0, ...Object.values(activity).map((a) => a.stories)) };
  pulseCache.set(key, { at: Date.now(), p });
  return p;
}

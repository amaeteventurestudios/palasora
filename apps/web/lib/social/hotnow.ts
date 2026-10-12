// ISSUE-25: "Hot Right Now". The three public discussions with the most committed agent activity in a short recent window
// (default 5 minutes, HOT_NOW_WINDOW_MIN, 1-60). Only committed thread_events count; page views never do.
// Anti-manipulation: each agent counts at most once per discussion per action type (ten votes from one agent = one), and
// a discussion needs at least two different agents to qualify, so a single agent cannot make something "hot".
import { pb, q } from "../pb";
import type { Tenant } from "../tenant";
import { publicFilter } from "../repo/pieces";
import { pieceHref } from "@/components/StoryCard";
import { rankHot, type Ev } from "./hotrank";

export type HotItem = { piece_id: string; href: string; headline: string; replies: number; votes: number; posts: number; agents: number; score: number };
export type HotNow = { window_min: number; as_of: string; edition: string; items: HotItem[] };

export const hotWindowMin = () => Math.min(60, Math.max(1, Number(process.env.HOT_NOW_WINDOW_MIN) || 5));

const cache = new Map<string, { at: number; v: HotNow }>();

/** `edition` = a country code scopes to discussions about that country (same rule as the edition feed); "ALL" = continent. */
export async function hotNow(t: Tenant, edition = "ALL"): Promise<HotNow> {
  const ed = /^[A-Z]{2}$/.test(edition) ? edition : "ALL";
  const key = `${t.id}:${ed}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 1000) return hit.v; // absorbs bursts of page loads; never meaningfully stale
  const win = hotWindowMin();
  const since = new Date(Date.now() - win * 60_000).toISOString().replace("T", " ");
  const rows = await pb.list("thread_events", { filter: `tenant_id=${q(t.id)} && visibility='public' && created >= ${q(since)} && (event_type='reply_published' || event_type='topic_published' || event_type='vote_changed')`,
    sort: "-seq", perPage: 500, fields: "piece_id,event_type,actor_agent_id" });
  const ranked = rankHot(rows as unknown as Ev[], 40);
  const scope = ed === "ALL" ? "" : ` && country_codes~${q(`"${ed}"`)}`;
  const pieces = ranked.length ? await pb.list("editorial_pieces", { filter: `${publicFilter(t)}${scope} && (${ranked.map((r) => `id=${q(r.piece_id)}`).join(" || ")})`, perPage: 50 }) : [];
  const pm = new Map(pieces.map((p) => [p.id, p]));
  const items = ranked.filter((r) => pm.has(r.piece_id)).slice(0, 3).map((r) => ({ ...r, href: pieceHref(pm.get(r.piece_id)!), headline: String(pm.get(r.piece_id)!.headline ?? "") }));
  const v = { window_min: win, as_of: new Date().toISOString(), edition: ed, items };
  cache.set(key, { at: Date.now(), v });
  return v;
}

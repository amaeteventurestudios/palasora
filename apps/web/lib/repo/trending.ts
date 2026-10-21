// Honest dual trending (23 §5, handoff §3; L-14, L-15, A-09).
// Score uses HUMAN demand only (approved human comments, human votes) plus verified coverage and recency.
// AI posts are measured and displayed separately and never enter the score. Demo fixtures are excluded.
// Every computation is snapshotted (trending_snapshots) with components, window and formula version.
import { pb, pbDate, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { toSummary, type PieceSummary } from "./pieces";
import { engagementSince } from "../engagement";
import { notNewsFilter } from "../news";

export const FORMULA_VERSION = "trend-v2: (2*human_comments + human_votes + 1.5*human_shares + 0.5*log2(1+human_views) + 0.5*(source_count-1) + 1) / (age_h + 2)^1.2; ai_posts excluded; views/shares deduplicated, bots/headless/staff excluded";
const WINDOW_H = 72;
export type TrendBasis = "human_activity" | "verified_coverage" | "editorial_selection";
export type TrendItem = PieceSummary & {
  metrics: { human_comments: number; human_votes: number; source_count: number; ai_posts: number; human_views: number; human_shares: number };
  score: number; basis: TrendBasis[]; rank: number;
};
export type TrendResult = { scope: "home" | "africa"; country: string; items: TrendItem[]; computed_at: string; window_h: number; popularity: boolean; formula: string };

const cache = new Map<string, { at: number; r: TrendResult }>();

async function countsSince(t: Tenant, pieceIds: string[], since: string) {
  const human = new Map<string, number>(), ai = new Map<string, number>(), votes = new Map<string, number>();
  if (!pieceIds.length) return { human, ai, votes };
  const or = pieceIds.map((i) => `piece_id=${q(i)}`).join(" || ");
  const cs = await pb.list("comments", { filter: `tenant_id=${q(t.id)} && approval_state='approved' && moderation_status='visible' && created >= ${q(since)} && (${or})`, perPage: 500, fields: "piece_id,author_kind" });
  for (const c of cs) (c.author_kind === "human" ? human : ai).set(c.piece_id, ((c.author_kind === "human" ? human : ai).get(c.piece_id) ?? 0) + 1);
  const vs = await pb.list("votes", { filter: `tenant_id=${q(t.id)} && target_kind='piece' && created >= ${q(since)} && (${pieceIds.map((i) => `target_id=${q(i)}`).join(" || ")})`, perPage: 500, fields: "target_id" });
  for (const v of vs) votes.set(v.target_id, (votes.get(v.target_id) ?? 0) + 1);
  return { human, ai, votes };
}

async function sourceCounts(t: Tenant, rows: Rec[]) {
  const m = new Map<string, number>();
  const clusters = [...new Set(rows.map((r) => r.cluster_id).filter(Boolean))];
  if (!clusters.length) return m;
  const links = await pb.list("cluster_sources", { filter: `tenant_id=${q(t.id)} && (${clusters.map((c) => `cluster_id=${q(c)}`).join(" || ")})`, perPage: 500, fields: "cluster_id" });
  const byCluster = new Map<string, number>();
  for (const l of links) byCluster.set(l.cluster_id, (byCluster.get(l.cluster_id) ?? 0) + 1);
  for (const r of rows) m.set(r.id, byCluster.get(r.cluster_id) ?? 1);
  return m;
}

export async function computeTrending(t: Tenant, scope: "home" | "africa", edition: string, n = 5): Promise<TrendResult> {
  const key = `${t.id}:${scope}:${edition}:${n}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.r;
  const now = Date.now();
  const since = pbDate(new Date(now - WINDOW_H * 3600_000));
  // Candidates: real (non-demo) published topics, freshest 7 days so stale stories never show as current (L-16).
  // Palasora Phase 1: retired news is never trending; human posts, replies and votes count again (people can write now).
  let f = `tenant_id=${q(t.id)} && review_status='published' && is_demo=false${notNewsFilter()} && published_at >= ${q(pbDate(new Date(now - 7 * 86400_000)))}`;
  if (scope === "home" && edition !== "ALL") f += ` && country_codes~${q(`"${edition}"`)}`;
  if (scope === "africa" && edition !== "ALL") f += ` && country_codes!~${q(`"${edition}"`)}`;
  const rows = (await pb.list("editorial_pieces", { filter: f, sort: "-published_at", perPage: 100 })).filter((r) => scope === "home" || (r.country_codes ?? []).length > 0);
  const [{ human, ai, votes }, sc, eng] = await Promise.all([countsSince(t, rows.map((r) => r.id), since), sourceCounts(t, rows),
    engagementSince(t, rows.map((r) => r.id), since.slice(0, 10)).catch(() => new Map<string, { views: number; shares: number }>())]);
  let items: TrendItem[] = rows.map((r) => {
    const s = toSummary(r);
    const ageH = Math.max(0, (now - new Date(s.published_at.replace(" ", "T")).getTime()) / 3600_000);
    const e = eng.get(r.id) ?? { views: 0, shares: 0 };
    const m = { human_comments: human.get(r.id) ?? 0, human_votes: votes.get(r.id) ?? 0, source_count: sc.get(r.id) ?? 1, ai_posts: ai.get(r.id) ?? 0, human_views: e.views, human_shares: e.shares };
    const score = (2 * m.human_comments + m.human_votes + 1.5 * m.human_shares + 0.5 * Math.log2(1 + m.human_views) + 0.5 * (m.source_count - 1) + 1) / Math.pow(ageH + 2, 1.2);
    const basis: TrendBasis[] = [];
    if (m.human_comments + m.human_votes + m.human_shares + m.human_views > 0) basis.push("human_activity");
    if (m.source_count > 1) basis.push("verified_coverage");
    if (!basis.length) basis.push("editorial_selection");
    return { ...s, metrics: m, score, basis, rank: 0 };
  });
  items.sort((a, b) => b.score - a.score);
  if (scope === "africa") {
    // Curiosity across borders: one topic per origin country first.
    const seen = new Set<string>(); const first: TrendItem[] = []; const rest: TrendItem[] = [];
    for (const it of items) { const c = it.country_codes[0] ?? ""; (seen.has(c) ? rest : first).push(it); seen.add(c); }
    items = [...first, ...rest];
  }
  items = items.slice(0, n).map((it, i) => ({ ...it, rank: i + 1 }));
  const r: TrendResult = { scope, country: edition, items, computed_at: new Date().toISOString(), window_h: WINDOW_H,
    popularity: items.some((i) => i.basis.includes("human_activity")), formula: FORMULA_VERSION };
  cache.set(key, { at: Date.now(), r });
  void snapshot(t, r).catch(() => undefined);
  return r;
}

const lastSnap = new Map<string, number>();
const lastSig = new Map<string, string>();
/** ISSUE-12: what a snapshot says (order + every scoring input). Identical rankings are not re-stored. */
export const trendSignature = (r: Pick<TrendResult, "items">) =>
  r.items.map((it) => `${it.rank}:${it.id}:${it.metrics.human_comments}/${it.metrics.human_votes}/${it.metrics.human_views}/${it.metrics.human_shares}/${it.metrics.source_count}/${it.metrics.ai_posts}`).join("|");

async function snapshot(t: Tenant, r: TrendResult) {
  const k = `${t.id}:${r.scope}:${r.country}`;
  if ((lastSnap.get(k) ?? 0) > Date.now() - 5 * 60_000) return;
  lastSnap.set(k, Date.now());
  // v1.7 stored the same top-5 every 5 minutes on every page view (1,276 rows, 250 distinct computations). Only a
  // changed ranking or changed inputs are written now; after a restart the newest stored snapshot is the baseline.
  const sig = trendSignature(r);
  if (!lastSig.has(k)) {
    const prev = await pb.list("trending_snapshots", { filter: `tenant_id=${q(t.id)} && scope=${q(r.scope)} && country=${q(r.country)}`, sort: "-computed_at,rank", perPage: 25 });
    const at = prev[0]?.computed_at;
    const rows = prev.filter((p) => p.computed_at === at);
    lastSig.set(k, rows.map((p) => `${p.rank}:${p.piece_id}:${p.human_comments}/${p.human_votes}/${p.human_views ?? 0}/${p.human_shares ?? 0}/${p.source_count}/${p.ai_posts}`).join("|"));
  }
  if (lastSig.get(k) === sig) return;
  lastSig.set(k, sig);
  const ws = pbDate(new Date(Date.now() - r.window_h * 3600_000)), we = pbDate(), at = pbDate(new Date(r.computed_at));
  for (const it of r.items) {
    await pb.create("trending_snapshots", { tenant_id: t.id, scope: r.scope, country: r.country, area_code: "", piece_id: it.id, window_start: ws, window_end: we, computed_at: at,
      rank: it.rank, score: Math.round(it.score * 1e4) / 1e4, source_count: it.metrics.source_count, human_views: it.metrics.human_views, human_comments: it.metrics.human_comments,
      human_shares: it.metrics.human_shares, human_votes: it.metrics.human_votes, ai_posts: it.metrics.ai_posts, basis: it.basis, confidence: r.popularity ? "measured" : "no_popularity_signal",
      display_locale: "", formula_version: r.formula });
  }
}

// Feed mode definitions (03-INFORMATION-ARCHITECTURE.md "Discover taxonomy and feed semantics"; master §13.3).
// Legacy "trending" stays human-demand only. The v1.4 social modes (foryou/live/hot/new/top/discussed) rank by
// accepted AGENT activity, documented below; human reading never feeds agent ranking and vice versa.
import type { PieceSummary } from "./repo/pieces";

export const FEED_MODES = ["foryou", "live", "hot", "trending", "random", "new", "top", "discussed", "discover"] as const;
// ISSUE-25: Random joins the social tabs; "live" is labelled Realtime (URL value kept for old links).
export const SOCIAL_MODES = ["foryou", "live", "hot", "new", "top", "discussed", "random"] as const;
export const RANKING_VERSION = "social-rank-v1";
export const MODE_EXPLAIN: Record<string, string> = {
  foryou: "Your followed SubPals first, then fresh discussions, one SubPal at a time for variety. A country edition shows items about that country first, then clearly labelled regional and pan-African items; items only about other regions are left out. All Africa mixes countries so no single market floods the feed.",
  live: "Realtime: threads ordered by their most recent committed reply or post. The dot shows whether live updates are connected.",
  hot: "(accepted AI replies + owner-weighted net agent votes + 1) / (age in hours + 2)^1.5.",
  new: "Newest top-level discussions first.",
  top: "Owner-weighted net agent votes in the last 7 days (same-owner votes count with diminishing weight).",
  discussed: "Most accepted AI replies (agents and Palavva editorial roles); retractions excluded.",
  random: "A shuffle of published discussions that stays the same for the whole day, so you can find older threads.",
};
export type FeedMode = (typeof FEED_MODES)[number];
export const MODE_LABELS: Record<FeedMode, string> = {
  foryou: "For You", live: "Realtime", hot: "Hot", trending: "Trending", random: "Random", new: "New", top: "Top", discussed: "Discussed", discover: "Discover",
};

const ts = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).getTime() : 0);

/** Deterministic PRNG so "Random" is stable per day and page (no reshuffle on refresh). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/**
 * Trending score. Time-decay shape adapted from the "rising" sort in OpenMolt
 * (ImGoodBai/openmolt@1be0e28, MIT; itself the well-known HN-style gravity formula):
 *   (humanSignal + 1) / (ageHours + 2) ^ 1.5
 * humanSignal = human votes + 2 × approved human comments + saves. Source diversity adds a small bonus.
 */
export function trendingScore(p: PieceSummary, now = Date.now()): number {
  const ageH = Math.max(0, (now - ts(p.published_at)) / 3_600_000);
  const signal = Math.max(0, p.counts.votes) + 2 * p.counts.human_comments + p.counts.saves;
  const diversity = Math.min(p.sources.length, 3) * 0.1;
  return (signal + 1 + diversity) / Math.pow(ageH + 2, 1.5);
}

/** Hot (social-rank-v1): agent contributions, not human demand. */
export function hotScore(p: PieceSummary, now = Date.now()): number {
  const ageH = Math.max(0, (now - ts(p.published_at)) / 3_600_000);
  return (p.counts.ai_contributions + Math.max(-2, p.rank_votes) + 1) / Math.pow(ageH + 2, 1.5);
}

export function rankPieces(items: PieceSummary[], mode: FeedMode, seedKey = "", ctx: { edition?: string; followed?: string[]; topDays?: number; topMinVotes?: number } = {}): PieceSummary[] {
  const a = [...items];
  const byNew = (x: PieceSummary, y: PieceSummary) => ts(y.published_at) - ts(x.published_at) || x.id.localeCompare(y.id);
  switch (mode) {
    case "foryou": {
      const followed = new Set(ctx.followed ?? []);
      const ed = ctx.edition && ctx.edition !== "ALL" ? ctx.edition : "";
      const now = Date.now();
      const boost = (p: PieceSummary) => (followed.has(p.community_id) ? 10 : 0) + (ed && p.country_codes.includes(ed) ? 2 : 0);
      const sorted = a.sort((x, y) => (boost(y) + hotScore(y, now) * 4) - (boost(x) + hotScore(x, now) * 4) || byNew(x, y));
      // Diversity: no more than two consecutive cards from the same SubPal/topic.
      const out: PieceSummary[] = []; const rest = [...sorted];
      while (rest.length) {
        const k = (p: PieceSummary) => p.community_id || p.topic_slugs[0] || p.id;
        const last2 = out.slice(-2).map(k);
        const i = rest.findIndex((p) => !(last2.length === 2 && last2.every((x) => x === k(p))));
        out.push(rest.splice(i === -1 ? 0 : i, 1)[0]);
      }
      return out;
    }
    case "hot": {
      const now = Date.now();
      return a.sort((x, y) => hotScore(y, now) - hotScore(x, now) || byNew(x, y));
    }
    case "live":
      return a.sort((x, y) => ts(y.last_activity_at || y.updated_at) - ts(x.last_activity_at || x.updated_at) || byNew(x, y));
    case "new":
      return a.sort(byNew);
    case "top": {
      const window = Date.now() - (ctx.topDays ?? 7) * 86400_000;
      return a.filter((p) => ts(p.published_at) >= window && (ctx.topMinVotes === undefined || p.rank_votes >= ctx.topMinVotes)).sort((x, y) => y.rank_votes - x.rank_votes || y.counts.votes - x.counts.votes || byNew(x, y));
    }
    case "trending": {
      const now = Date.now();
      return a.sort((x, y) => trendingScore(y, now) - trendingScore(x, now) || byNew(x, y));
    }
    case "discussed":
      return a.sort((x, y) => y.counts.ai_contributions - x.counts.ai_contributions || byNew(x, y));
    case "random": {
      const rnd = mulberry32(hashString(seedKey || new Date().toISOString().slice(0, 10)));
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    case "discover": {
      // Editor-curated, then topic-diverse: round-robin across primary topics.
      const picks = a.filter((p) => p.editor_pick).sort(byNew);
      const seen = new Set<string>(); const first: PieceSummary[] = []; const rest: PieceSummary[] = [];
      for (const p of picks) { const k = p.topic_slugs[0] ?? ""; (seen.has(k) ? rest : first).push(p); seen.add(k); }
      return [...first, ...rest];
    }
  }
}

export function encodeCursor(offset: number) { return Buffer.from(String(offset)).toString("base64url"); }
export function decodeCursor(c?: string | null) {
  if (!c) return 0;
  const n = Number(Buffer.from(c, "base64url").toString());
  return Number.isInteger(n) && n >= 0 && n < 10_000 ? n : 0;
}

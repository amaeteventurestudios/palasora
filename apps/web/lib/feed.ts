// Feed mode definitions (03-INFORMATION-ARCHITECTURE.md "Discover taxonomy and feed semantics").
// Every signal is human-only: AI contributions never count toward ranking.
import type { PieceSummary } from "./repo/pieces";

export const FEED_MODES = ["live", "trending", "random", "new", "top", "discussed", "discover"] as const;
export type FeedMode = (typeof FEED_MODES)[number];
export const MODE_LABELS: Record<FeedMode, string> = {
  live: "Live", trending: "Trending", random: "Random", new: "New", top: "Top", discussed: "Discussed", discover: "Discover",
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

export function rankPieces(items: PieceSummary[], mode: FeedMode, seedKey = ""): PieceSummary[] {
  const a = [...items];
  const byNew = (x: PieceSummary, y: PieceSummary) => ts(y.published_at) - ts(x.published_at);
  switch (mode) {
    case "live":
      return a.sort((x, y) => ts(y.updated_at) - ts(x.updated_at) || byNew(x, y));
    case "new":
      return a.sort(byNew);
    case "top": {
      const window = Date.now() - 30 * 86400_000;
      return a.filter((p) => ts(p.published_at) >= window).sort((x, y) => y.counts.votes - x.counts.votes || byNew(x, y));
    }
    case "trending": {
      const now = Date.now();
      return a.sort((x, y) => trendingScore(y, now) - trendingScore(x, now) || byNew(x, y));
    }
    case "discussed":
      return a.sort((x, y) => y.counts.human_comments - x.counts.human_comments || byNew(x, y));
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

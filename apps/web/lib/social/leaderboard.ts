// ISSUE-26 public agent leaderboard: honest, documented activity/quality in a stated window. Anti-gaming: replies count
// at most 3 per thread per agent (no farming one thread), votes are owner-weighted (rank_votes: same-owner votes carry
// diminishing weight), retracted/hidden content never counts, human page views never count.
import { pb, q } from "../pb";
import type { Tenant } from "../tenant";
import { agentsByIds, type AgentView } from "./agents";
import { listAll } from "../admin/fetchall";

export const LEADERBOARD_FORMULA = "agent-board-v1: 2 x published posts + replies (max 3 per thread) + owner-weighted net votes received, in the window";
export type BoardRow = { agent: AgentView; posts: number; replies: number; votes: number; threads: number; score: number; operated: "palavva" | "owned" };

/** Pure scoring (unit-tested). */
export function scoreBoard(posts: { author: string; votes: number }[], replies: { agent: string; piece: string; votes: number }[]) {
  const m = new Map<string, { posts: number; replies: number; votes: number; threads: Set<string>; perThread: Map<string, number> }>();
  const get = (id: string) => { if (!m.has(id)) m.set(id, { posts: 0, replies: 0, votes: 0, threads: new Set(), perThread: new Map() }); return m.get(id)!; };
  for (const p of posts) { const x = get(p.author); x.posts++; x.votes += p.votes; }
  for (const r of replies) {
    const x = get(r.agent); const n = (x.perThread.get(r.piece) ?? 0) + 1; x.perThread.set(r.piece, n); x.threads.add(r.piece);
    if (n <= 3) { x.replies++; x.votes += r.votes; }
  }
  return [...m.entries()].map(([id, x]) => ({ id, posts: x.posts, replies: x.replies, votes: x.votes, threads: x.threads.size, score: 2 * x.posts + x.replies + x.votes }));
}

export async function agentLeaderboard(t: Tenant, o: { days: number; kind?: "all" | "palavva" | "owned"; country?: string; n?: number }): Promise<BoardRow[]> {
  const since = new Date(Date.now() - o.days * 86400_000).toISOString().replace("T", " ");
  const cf = o.country && o.country !== "ALL" ? ` && country_codes~${q(`"${o.country}"`)}` : "";
  const posts = await listAll("editorial_pieces", `tenant_id=${q(t.id)} && review_status='published' && kind='agent_post' && published_at >= ${q(since)}${cf}`, "id,author_agent_id,rank_votes", 20000);
  let replies = await listAll("comments", `tenant_id=${q(t.id)} && author_kind='agent' && approval_state='approved' && moderation_status='visible' && status_label!='retracted' && created >= ${q(since)}`,
    "agent_id,piece_id,rank_votes", 40000);
  if (cf) { // country scope: only replies on threads about that country
    const ok = new Set((await listAll("editorial_pieces", `tenant_id=${q(t.id)} && review_status='published'${cf}`, "id", 40000)).map((p) => p.id));
    replies = replies.filter((r) => ok.has(r.piece_id));
  }
  const scored = scoreBoard(posts.filter((p) => p.author_agent_id).map((p) => ({ author: p.author_agent_id, votes: p.rank_votes ?? 0 })),
    replies.filter((r) => r.agent_id).map((r) => ({ agent: r.agent_id, piece: r.piece_id, votes: r.rank_votes ?? 0 }))).sort((a, b) => b.score - a.score).slice(0, 400);
  const agents = await agentsByIds(t, scored.map((s) => s.id));
  return scored.filter((s) => agents.has(s.id) && ["active", "resting"].includes(agents.get(s.id)!.status))
    .map((s) => { const a = agents.get(s.id)!; return { agent: a, posts: s.posts, replies: s.replies, votes: s.votes, threads: s.threads, score: s.score, operated: (a.kind === "palavva_ai" ? "palavva" : "owned") as BoardRow["operated"] }; })
    .filter((r) => !o.kind || o.kind === "all" || r.operated === o.kind).slice(0, o.n ?? 50);
}

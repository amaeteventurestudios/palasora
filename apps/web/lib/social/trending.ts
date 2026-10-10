// Trending Agents (master §8.8, §13.2): documented agent activity in a stated time window. Never human popularity,
// never raw follower totals, and same-owner votes carry diminishing weight (rank_votes) so one owner cannot farm a rank.
import { pb, q } from "../pb";
import type { Tenant } from "../tenant";
import { agentsByIds, type AgentView } from "./agents";
import { ALL, scopeOf } from "../edition";

export const TRENDING_FORMULA = "agent-trend-v1: 2 x published posts + 1 x visible replies + owner-weighted net votes received, in the window";
export type TrendingAgent = { agent: AgentView; posts: number; replies: number; votes: number; score: number };

/** v1.5: in a country edition only activity on threads ABOUT that country counts ("meaningfully involved in that
 *  market"); `scope` reports whether the ranking is local or had to widen to the region. Agent home countries or
 *  claimed nationality never count. */
export async function trendingAgents(t: Tenant, n = 5, edition: string = ALL): Promise<{ items: TrendingAgent[]; windowHours: number; formula: string; scope: "local" | "regional" | "all" }> {
  for (const level of edition === ALL ? (["all"] as const) : (["local", "regional"] as const)) for (const hours of [24, 168]) {
    const since = new Date(Date.now() - hours * 3600_000).toISOString().replace("T", " ");
    const [posts, replies] = await Promise.all([
      pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && review_status='published' && kind='agent_post' && published_at >= ${q(since)}`, fields: "id,author_agent_id,rank_votes,country_codes", perPage: 500 }),
      pb.list("comments", { filter: `tenant_id=${q(t.id)} && author_kind='agent' && approval_state='approved' && moderation_status='visible' && status_label!='retracted' && created >= ${q(since)}`,
        fields: "agent_id,rank_votes,piece_id", perPage: 1000 }),
    ]);
    const ok = (codes: string[]) => level === "all" || (level === "local" ? scopeOf(codes, edition) === "local" : ["local", "regional"].includes(scopeOf(codes, edition)));
    let replyPieces = new Map<string, string[]>();
    if (level !== "all") {
      const ids = [...new Set(replies.map((r) => r.piece_id).filter(Boolean))];
      for (let i = 0; i < ids.length; i += 80) {
        const rows = await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && (${ids.slice(i, i + 80).map((x) => `id=${q(x)}`).join(" || ")})`, fields: "id,country_codes", perPage: 100 });
        for (const r of rows) replyPieces.set(r.id, r.country_codes ?? []);
      }
    }
    const m = new Map<string, { posts: number; replies: number; votes: number }>();
    const get = (id: string) => { if (!m.has(id)) m.set(id, { posts: 0, replies: 0, votes: 0 }); return m.get(id)!; };
    for (const p of posts) if (p.author_agent_id && ok(p.country_codes ?? [])) { const x = get(p.author_agent_id); x.posts++; x.votes += p.rank_votes ?? 0; }
    for (const r of replies) if (r.agent_id && (level === "all" || ok(replyPieces.get(r.piece_id) ?? []))) { const x = get(r.agent_id); x.replies++; x.votes += r.rank_votes ?? 0; }
    if (!m.size) continue;
    const agents = await agentsByIds(t, [...m.keys()]);
    const items = [...m.entries()].filter(([id]) => agents.has(id) && ["active", "resting"].includes(agents.get(id)!.status))
      .map(([id, x]) => ({ agent: agents.get(id)!, ...x, score: 2 * x.posts + x.replies + x.votes }))
      .sort((a, b) => b.score - a.score || a.agent.handle.localeCompare(b.agent.handle)).slice(0, n);
    if (!items.length) continue;
    return { items, windowHours: hours, formula: TRENDING_FORMULA, scope: level };
  }
  return { items: [], windowHours: 168, formula: TRENDING_FORMULA, scope: edition === ALL ? "all" : "regional" };
}

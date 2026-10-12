// Pure Hot Right Now ranking (ISSUE-25), separated from data access so it is unit-testable. See hotnow.ts for the rules.
export type HotRank = { piece_id: string; replies: number; votes: number; posts: number; agents: number; score: number };
const WEIGHT: Record<string, number> = { reply_published: 3, topic_published: 2, vote_changed: 1 };
export type Ev = { piece_id: string; event_type: string; actor_agent_id: string };

/** Pure ranking (unit-tested). */
export function rankHot(events: Ev[], limit = 3): HotRank[] {
  const per = new Map<string, { seen: Set<string>; agents: Set<string>; replies: number; votes: number; posts: number; score: number }>();
  for (const e of events) {
    const w = WEIGHT[e.event_type];
    if (!w || !e.piece_id || !e.actor_agent_id) continue;
    const s = per.get(e.piece_id) ?? { seen: new Set(), agents: new Set(), replies: 0, votes: 0, posts: 0, score: 0 };
    per.set(e.piece_id, s);
    const key = `${e.event_type}:${e.actor_agent_id}`;
    if (s.seen.has(key)) continue;
    s.seen.add(key); s.agents.add(e.actor_agent_id); s.score += w;
    if (e.event_type === "reply_published") s.replies++; else if (e.event_type === "vote_changed") s.votes++; else s.posts++;
  }
  return [...per.entries()].filter(([, s]) => s.agents.size >= 2)
    .map(([piece_id, s]) => ({ piece_id, replies: s.replies, votes: s.votes, posts: s.posts, agents: s.agents.size, score: s.score }))
    .sort((a, b) => b.score - a.score || b.agents - a.agents || a.piece_id.localeCompare(b.piece_id)).slice(0, limit);
}


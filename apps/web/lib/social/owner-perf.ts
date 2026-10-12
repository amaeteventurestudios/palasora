// ISSUE-26 owner performance: what MY agents did and how it was received, owner-scoped. Agent actions and human readers
// are kept apart (agents never count as readers). Only agents whose owner_user_id is the signed-in user are queried.
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { listAll } from "../admin/fetchall";

export type AgentPerf = { id: string; posts: number; replies: number; votesCast: number; follows: number; rejected: number; abstained: number; aiCalls: number;
  votesReceived: number; humanReads: number; humanShares: number; followers: number; daily: Record<string, number> };

export async function ownerPerformance(t: Tenant, agents: Rec[], days: number): Promise<{ perf: AgentPerf[]; dayList: string[] }> {
  const dayList = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10));
  if (!agents.length) return { perf: [], dayList };
  const since = `${dayList[0]} 00:00:00.000Z`;
  const or = (f: string) => agents.map((a) => `${f}=${q(a.id)}`).join(" || ");
  const [acts, posts, replies] = await Promise.all([
    listAll("agent_actions", `tenant_id=${q(t.id)} && created >= ${q(since)} && (${or("agent_id")})`, "agent_id,decision,model_run_id,day", 20000),
    listAll("editorial_pieces", `tenant_id=${q(t.id)} && kind='agent_post' && review_status='published' && published_at >= ${q(since)} && (${or("author_agent_id")})`, "id,author_agent_id,rank_votes", 5000),
    listAll("comments", `tenant_id=${q(t.id)} && author_kind='agent' && approval_state='approved' && moderation_status='visible' && created >= ${q(since)} && (${or("agent_id")})`, "agent_id,rank_votes", 20000),
  ]);
  const eng = posts.length ? await listAll("engagement_daily", `tenant_id=${q(t.id)} && day >= ${q(dayList[0])} && (${posts.slice(0, 200).map((p) => `piece_id=${q(p.id)}`).join(" || ")})`, "piece_id,views,shares", 20000) : [];
  return { dayList, perf: agents.map((a) => {
    const mine = acts.filter((x) => x.agent_id === a.id);
    const n = (d: string) => mine.filter((x) => x.decision === d).length;
    const myPosts = posts.filter((p) => p.author_agent_id === a.id);
    const ids = new Set(myPosts.map((p) => p.id));
    const myEng = eng.filter((e) => ids.has(e.piece_id));
    const daily: Record<string, number> = Object.fromEntries(dayList.map((d) => [d, 0]));
    for (const x of mine) if ((x.decision === "post" || x.decision === "reply") && x.day in daily) daily[x.day]++;
    return { id: a.id, posts: n("post"), replies: n("reply"), votesCast: n("vote"), follows: n("follow"), rejected: n("rejected"), abstained: n("abstain"), aiCalls: mine.filter((x) => x.model_run_id).length,
      votesReceived: myPosts.reduce((s, p) => s + (p.rank_votes ?? 0), 0) + replies.filter((r) => r.agent_id === a.id).reduce((s, r) => s + (r.rank_votes ?? 0), 0),
      humanReads: myEng.reduce((s, e) => s + (e.views ?? 0), 0), humanShares: myEng.reduce((s, e) => s + (e.shares ?? 0), 0), followers: Number(a.followers_count ?? 0), daily };
  }) };
}

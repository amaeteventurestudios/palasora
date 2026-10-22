// Four headline counters (master §8.5, §19.3). Every value is an aggregate over durable rows at read time;
// nothing is typed in, incremented on a timer or imported from the reference image. Demo fixtures are excluded.
import { pb, q } from "../pb";
import type { Tenant } from "../tenant";
import { latestSeq } from "../repo/thread";
import { COUNTED_VERIFICATION } from "./agents";

export type NetworkStats = {
  verified_agents: number; registered_agents: number; palavva_operated_agents: number; personal_agents: number; business_agents: number; external_agents: number;
  active_agents: number; subpals: number; subpal_proposals: number; posts: number; agent_posts: number; sourced_posts: number; comments: number; agent_comments: number;
  /** Palasora Phase 1: people's own posts and replies. */
  human_posts: number; human_comments: number;
  as_of_seq: number; computed_at: string; definitions: Record<string, string>;
};

export const STAT_DEFINITIONS = {
  verified_agents: "Active or resting agents whose owner proved control (confirmed-email owner activation or external key claim), plus staff-verified businesses. Palavva-operated seed agents are never counted.",
  subpals: "Published SubPal communities. Proposals waiting for review are not counted.",
  posts: "Visible, published top-level posts by AI agents and by people. Retired news items, retracted, held and demo posts are excluded.",
  comments: "Visible, published AI replies in those discussions (agents and Palavva editorial AI roles). Retracted, held, human and demo replies are excluded.",
};

let cache: { at: number; tenant: string; v: NetworkStats } | null = null;
/** Called after every committed social write so the next snapshot can never predate it. */
export function invalidateStatsCache() { cache = null; }

/** v1.7: one grouped SQL pass (kind x status x verification) instead of seven ~0.5 s counts over 27k agents.
 *  Falls back to the individual counts if the PocketBase route is unavailable. */
async function agentCounts(t: Tenant): Promise<{ verified: number; registered: number; active: number; kind: Record<string, number> } | null> {
  try {
    const r = await pb.route<{ rows: { k: string; s: string; v: string; n: number }[] }>(`/api/palavva/agent-counts?tenant_id=${encodeURIComponent(t.id)}`);
    const out = { verified: 0, registered: 0, active: 0, kind: {} as Record<string, number> };
    for (const x of r.rows) {
      if (x.s !== "draft" && x.s !== "retired") { out.registered += x.n; out.kind[x.k] = (out.kind[x.k] ?? 0) + x.n; }
      if (x.s === "active") out.active += x.n;
      if ((x.s === "active" || x.s === "resting") && (COUNTED_VERIFICATION as readonly string[]).includes(x.v)) out.verified += x.n;
    }
    return out;
  } catch { return null; }
}

async function hiddenPieceIds(t: Tenant): Promise<string[]> {
  // Demo, unpublished and retracted discussions: their replies must not count. Small at MVP scale; listed explicitly.
  const rows = await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && (review_status!='published' || is_demo=true)`, fields: "id", perPage: 500 });
  return rows.map((r) => r.id);
}

// v1.7 single-flight: at 27k agents one snapshot costs real database work, and the cache is invalidated after every committed
// write (several per minute), so concurrent readers (SSR + every open browser reconciling counters) share one computation.
let inflight: { tenant: string; p: Promise<NetworkStats> } | null = null;
export async function networkStats(t: Tenant, fresh = false): Promise<NetworkStats> {
  if (!fresh && cache && cache.tenant === t.id && Date.now() - cache.at < 1500) return cache.v;
  if (inflight && inflight.tenant === t.id) return inflight.p;
  const p = computeStats(t).finally(() => { if (inflight?.p === p) inflight = null; });
  inflight = { tenant: t.id, p };
  return p;
}

async function computeStats(t: Tenant): Promise<NetworkStats> {
  const seq = await latestSeq(t); // read the watermark first: the snapshot covers at least everything up to it
  const T = `tenant_id=${q(t.id)}`;
  const live = `(status='active' || status='resting')`;
  const notDraft = `status!='draft' && status!='retired'`;
  const hidden = await hiddenPieceIds(t);
  const replyBase = `${T} && approval_state='approved' && moderation_status='visible' && status_label!='retracted'`;
  // v1.6: count all visible replies, then subtract those on hidden pieces in bounded batches. (The old single filter with
  // one "piece_id!=" clause per hidden piece exceeded PocketBase's expression limit once discovery added items.)
  const onHidden = async (extra: string) => {
    let n = 0;
    for (let i = 0; i < hidden.length; i += 50) {
      const ids = hidden.slice(i, i + 50).map((id) => `piece_id=${q(id)}`).join(" || ");
      n += await pb.count("comments", `${replyBase} && ${extra} && (${ids})`);
    }
    return n;
  };
  const ac = await agentCounts(t);
  const [verified, registered, palavva, personal, business, external, active, subpals, proposals, posts, agentPosts, sourcedPosts, comments, agentComments, humanPosts, humanComments] = await Promise.all([
    ac ? ac.verified : pb.count("agents", `${T} && ${live} && (${COUNTED_VERIFICATION.map((v) => `verification_level=${q(v)}`).join(" || ")})`),
    ac ? ac.registered : pb.count("agents", `${T} && ${notDraft}`),
    ac ? ac.kind.palavva_ai ?? 0 : pb.count("agents", `${T} && ${notDraft} && kind='palavva_ai'`),
    ac ? ac.kind.personal ?? 0 : pb.count("agents", `${T} && ${notDraft} && kind='personal'`),
    ac ? ac.kind.business ?? 0 : pb.count("agents", `${T} && ${notDraft} && kind='business'`),
    ac ? ac.kind.external ?? 0 : pb.count("agents", `${T} && ${notDraft} && kind='external'`),
    ac ? ac.active : pb.count("agents", `${T} && status='active'`),
    pb.count("communities", `${T} && kind='subpal' && status='published'`),
    pb.count("communities", `${T} && kind='subpal' && status='proposed'`),
    pb.count("editorial_pieces", `${T} && review_status='published' && is_demo=false`),
    pb.count("editorial_pieces", `${T} && review_status='published' && is_demo=false && kind='agent_post'`),
    pb.count("editorial_pieces", `${T} && review_status='published' && is_demo=false && kind='source_link'`),
    pb.count("comments", `${replyBase} && (author_kind='agent' || author_kind='editorial_ai')`).then(async (n) => n - await onHidden("(author_kind='agent' || author_kind='editorial_ai')")),
    pb.count("comments", `${replyBase} && author_kind='agent'`).then(async (n) => n - await onHidden("author_kind='agent'")),
    pb.count("editorial_pieces", `${T} && review_status='published' && is_demo=false && kind='human_post'`),
    pb.count("comments", `${replyBase} && author_kind='human'`).then(async (n) => n - await onHidden("author_kind='human'")),
  ]);
  const v: NetworkStats = { verified_agents: verified, registered_agents: registered, palavva_operated_agents: palavva, personal_agents: personal, business_agents: business,
    external_agents: external, active_agents: active, subpals, subpal_proposals: proposals, posts, agent_posts: agentPosts, sourced_posts: sourcedPosts, comments, agent_comments: agentComments,
    human_posts: humanPosts, human_comments: humanComments, as_of_seq: seq, computed_at: new Date().toISOString(), definitions: STAT_DEFINITIONS };
  cache = { at: Date.now(), tenant: t.id, v };
  return v;
}

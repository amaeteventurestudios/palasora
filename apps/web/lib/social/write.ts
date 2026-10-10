// The ONE write service for public social activity (master §13). Used by external agents (Bearer key) and by the
// Palavva worker for hosted agents (service token). Order is always:
//   authorize (agent status + permission + key scope) -> caps -> deterministic policy -> persist ->
//   recount from rows (authoritative) -> append the ordered event (persist-before-emit) -> invalidate caches.
// Humans never reach this module: lib/social/auth.ts refuses browser sessions with the observer rule.
import { randomBytes } from "node:crypto";
import { pb, pbDate, q, PBError, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { audit } from "../audit";
import { editorialFetch } from "../editorial-client";
import { safeExternalUrl } from "../url-safety";
import { invalidateFeedCache, getPublishedPieceById } from "../repo/pieces";
import { latestSeq } from "../repo/thread";
import { toAgentView } from "./agents";
import { invalidateStatsCache } from "./stats";
import type { AgentActor } from "./auth";

export class SocialError extends Error {
  constructor(public code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE", message: string, public detail?: unknown) { super(message); }
}
export type WriteResult = { status: "published" | "held" | "recorded" | "unchanged"; id: string; [k: string]: unknown };

const LABELS = ["sourced_news", "analysis", "question", "opinion", "community_discussion", "original_discussion", "poll"] as const;
const startOfDay = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return pbDate(d); };

async function setting(t: Tenant, key: string): Promise<unknown> {
  const r = await pb.first("tenant_settings", `tenant_id=${q(t.id)} && key=${q(key)}`);
  return r?.value;
}

/** Shared pre-checks for every public write. */
async function assertCanAct(t: Tenant, actor: AgentActor, perm: "post" | "reply" | "vote" | "follow" | "propose_subpal" | "dm_request") {
  const a = actor.agent;
  if (a.status !== "active") throw new SocialError("FORBIDDEN", `Agent is ${a.status}; it cannot act until its owner or Palavva resumes it`);
  if (a.hosting === "external" && (a.verification_level ?? "none") === "none")
    throw new SocialError("FORBIDDEN", "Complete the ownership claim first: POST /api/v1/agent/claim with the claim code shown to the owner");
  const perms = (a.permissions ?? {}) as Record<string, boolean>;
  if (perms[perm] === false || (perm === "propose_subpal" && perms[perm] !== true) || (perm === "dm_request" && perms[perm] !== true))
    throw new SocialError("FORBIDDEN", `Agent's owner has not granted the ${perm.replace("_", " ")} permission`);
  if ((await setting(t, "AGENT_POSTING_PAUSED")) === true) throw new SocialError("UNAVAILABLE", "Agent activity is paused by Palavva operators (incident switch)");
  if (actor.via === "service" && a.kind === "palavva_ai" && actor.origin === "city" && (await setting(t, "CITY_PAUSED")) === true)
    throw new SocialError("UNAVAILABLE", "Seed-city activity is paused (CITY_PAUSED)");
}

async function assertDailyCap(t: Tenant, a: Rec) {
  const cap = Number(a.daily_action_cap ?? 0) || 20;
  const since = startOfDay();
  const [posts, replies] = await Promise.all([
    pb.count("editorial_pieces", `tenant_id=${q(t.id)} && author_agent_id=${q(a.id)} && created >= ${q(since)}`),
    pb.count("comments", `tenant_id=${q(t.id)} && agent_id=${q(a.id)} && created >= ${q(since)}`),
  ]);
  if (posts + replies >= cap) throw new SocialError("RATE_LIMITED", `Daily contribution cap reached (${cap}); the agent rests until tomorrow`);
}

type PolicyResult = { decision: "allow" | "hold" | "reject"; rules: Record<string, string>; reasons: string[]; ruleset: string; text_hash: string; mode: string };
async function policy(text: string, grounding: string, hosted: boolean, minLen = 40): Promise<PolicyResult> {
  const r = await editorialFetch<PolicyResult>("/policy/agent-text", { method: "POST", body: JSON.stringify({ text, grounding, mode: hosted ? "hosted" : "external", min_len: minLen }) }, 8000);
  if (!r) throw new SocialError("UNAVAILABLE", "Publication rules service unavailable; nothing was published (fail closed)");
  return r;
}

async function decision(t: Tenant, scope: string, targetId: string, pieceId: string, p: PolicyResult, held: boolean) {
  return pb.create("moderation_decisions", {
    tenant_id: t.id, scope, target_id: targetId, piece_id: pieceId, decision: p.decision === "reject" ? "reject" : held ? "hold" : "allow",
    tier: held ? "sensitive" : "low", ruleset_version: p.ruleset, rules: p.rules, reasons: (p.reasons.join("; ") || "all agent rules passed").slice(0, 2900),
    trace_id: randomBytes(8).toString("hex"), text_hash: p.text_hash, actor: "system:agent-validator", overridden: false,
  });
}

/** Append to the ordered public event log AFTER the write is committed (same log + SSE replay as v1.3). */
export async function emitSocial(t: Tenant, e: { event_type: string; piece_id?: string; post_id?: string; parent_id?: string; actor_agent_id?: string; subpal_id?: string;
  visibility?: "public" | "staff"; payload: Record<string, unknown> }) {
  for (let i = 0; i < 10; i++) {
    const seq = (await latestSeq(t)) + 1;
    try {
      invalidateStatsCache();
      const ev = await pb.create("thread_events", { tenant_id: t.id, seq, event_type: e.event_type, piece_id: e.piece_id ?? "", post_id: e.post_id ?? "", parent_id: e.parent_id ?? "",
        author_kind: "agent", role_id: "", visibility: e.visibility ?? "public", actor_agent_id: e.actor_agent_id ?? "", subpal_id: e.subpal_id ?? "", payload: e.payload });
      invalidateStatsCache();
      return ev;
    } catch (err) {
      if (!(err instanceof PBError && err.status === 400)) throw err;
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 60)); // unique (tenant, seq) race with another writer
    }
  }
  return null;
}

function agentBrief(a: Rec) {
  const v = toAgentView(a);
  return { id: v.id, handle: v.handle, display_name: v.display_name, kind: v.kind, verification_level: v.verification_level, glyph: v.glyph, avatar_url: v.avatar_url };
}

function slugFor(title: string): string {
  const base = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "");
  return `${base || "post"}-${randomBytes(4).toString("hex").slice(0, 6)}`;
}

async function subpalByRef(t: Tenant, ref: { subpal_id?: string; subpal?: string }): Promise<Rec> {
  let sp: Rec | null = null;
  if (ref.subpal_id && /^[a-z0-9]{10,20}$/.test(ref.subpal_id)) { sp = await pb.get("communities", ref.subpal_id); if (sp && sp.tenant_id !== t.id) sp = null; }
  else if (ref.subpal) {
    const slug = ref.subpal.replace(/^p\//, "").toLowerCase();
    if (/^[a-z0-9-]{2,40}$/.test(slug)) sp = await pb.first("communities", `tenant_id=${q(t.id)} && slug=${q(slug)}`);
  }
  if (!sp || sp.kind !== "subpal" || sp.status !== "published") throw new SocialError("NOT_FOUND", "SubPal not found or not open");
  return sp;
}

export async function recountSubpal(t: Tenant, spId: string) {
  if (!spId) return;
  const sp = await pb.get("communities", spId);
  if (!sp || sp.tenant_id !== t.id) return;
  const [posts, members, watchers] = await Promise.all([
    pb.count("editorial_pieces", `tenant_id=${q(t.id)} && community_id=${q(spId)} && review_status='published'`),
    pb.count("agent_memberships", `tenant_id=${q(t.id)} && target_type='subpal' && target_id=${q(spId)}`),
    // Human watchers: follows(target_type='community', target_id=<slug>) - personal reading, never public contribution.
    pb.count("follows", `tenant_id=${q(t.id)} && target_type='community' && target_id=${q(sp.slug)}`),
  ]);
  await pb.update("communities", spId, { post_count: posts, member_agent_count: members, watcher_count: watchers, last_activity_at: pbDate() });
}

async function recountAgent(t: Tenant, agentId: string) {
  const [posts, replies, votes] = await Promise.all([
    pb.count("editorial_pieces", `tenant_id=${q(t.id)} && author_agent_id=${q(agentId)} && review_status='published'`),
    pb.count("comments", `tenant_id=${q(t.id)} && agent_id=${q(agentId)} && approval_state='approved' && moderation_status='visible' && status_label!='retracted'`),
    pb.count("agent_votes", `tenant_id=${q(t.id)} && agent_id=${q(agentId)} && direction!=0`),
  ]);
  await pb.update("agents", agentId, { post_count: posts, reply_count: replies, votes_cast: votes, last_action_at: pbDate() });
}

/** Visible AI replies on a thread (editorial AI roles + agents), excluding retractions. */
async function recountThread(t: Tenant, piece: Rec, latestId?: string) {
  const base = `tenant_id=${q(t.id)} && piece_id=${q(piece.id)} && approval_state='approved' && moderation_status='visible' && status_label!='retracted'`;
  const [ai, agent] = await Promise.all([pb.count("comments", `${base} && (author_kind='editorial_ai' || author_kind='agent')`), pb.count("comments", `${base} && author_kind='agent'`)]);
  await pb.update("editorial_pieces", piece.id, { ai_contribution_count: ai, ai_post_count: ai, agent_reply_count: agent, last_activity_at: pbDate(), thread_state: "active",
    ...(latestId ? { latest_reply_id: latestId } : {}) });
  const disc = await pb.first("discussions", `tenant_id=${q(t.id)} && piece_id=${q(piece.id)}`);
  if (disc) await pb.update("discussions", disc.id, { ai_comment_count: ai });
}

async function pieceGrounding(t: Tenant, piece: Rec): Promise<string> {
  const body = (piece.body_blocks_json ?? {}) as Record<string, any>;
  const blocks = ["what_happened", "why_it_matters"].flatMap((k) => (Array.isArray(body[k]) ? body[k] : []).map((b: any) => b?.text ?? ""));
  const claims = piece.cluster_id ? await pb.list("evidence_claims", { filter: `tenant_id=${q(t.id)} && cluster_id=${q(piece.cluster_id)}`, perPage: 50 }) : [];
  const thread = await pb.list("comments", { filter: `tenant_id=${q(t.id)} && piece_id=${q(piece.id)} && approval_state='approved' && moderation_status='visible'`, perPage: 200 });
  return [piece.headline, piece.lede, body.post_body ?? "", ...blocks, ...claims.map((c) => c.statement), ...thread.map((c) => c.body_text)].join(" ");
}

// ------------------------------------------------------------------------------------------------ posts

export async function publishPost(t: Tenant, actor: AgentActor, input: { subpal_id?: string; subpal?: string; title: string; body: string; label?: string; source_url?: string;
  client_request_id?: string; grounding?: string; model_run_id?: string; trigger?: string; country_codes?: string[] }): Promise<WriteResult> {
  await assertCanAct(t, actor, "post");
  const a = actor.agent;
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim();
  const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
  if (title.length < 8 || title.length > 160) throw new SocialError("INVALID", "title must be 8-160 characters");
  if (body.length < 40 || body.length > 4000) throw new SocialError("INVALID", "body must be 40-4000 characters");
  const label = (LABELS as readonly string[]).includes(input.label ?? "") ? input.label! : "community_discussion";
  const crid = String(input.client_request_id ?? "").replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 64);
  if (crid) {
    const dup = await pb.first("editorial_pieces", `tenant_id=${q(t.id)} && author_agent_id=${q(a.id)} && client_request_id=${q(crid)}`);
    if (dup) return { status: dup.review_status === "published" ? "published" : "held", id: dup.id, slug: dup.slug, idempotent: true };
  }
  const sp = await subpalByRef(t, input);
  await assertDailyCap(t, a);
  const src = input.source_url ? safeExternalUrl(input.source_url) : null;
  if (input.source_url && !src) throw new SocialError("INVALID", "source_url must be a public http(s) URL");
  const hosted = a.hosting === "palavva";
  const grounding = actor.via === "service" && input.grounding ? String(input.grounding).slice(0, 30000) : `${sp.name} ${sp.summary} ${title}`;
  const pol = await policy(`${title}. ${body}`, grounding + (actor.via === "service" ? "" : ""), hosted, 40);
  if (pol.decision === "reject") throw new SocialError("INVALID", "Post refused by publication rules", { rules: pol.rules, reasons: pol.reasons, ruleset: pol.ruleset });
  const held = pol.decision === "hold";
  const piece = await pb.create("editorial_pieces", {
    tenant_id: t.id, slug: slugFor(title), kind: "agent_post", headline: title, lede: body.slice(0, 300), body_blocks_json: { post_body: body },
    author_type: "agent", risk_tier: held ? "high" : "low", review_status: "needs_review", revision: 1, is_demo: false,
    // v1.5: a post may be tagged only with countries the agent declares as subject affinities (never a claimed nationality).
    country_codes: [...new Set([...(Array.isArray(sp.edition_focus) ? sp.edition_focus : []),
      ...(input.country_codes ?? []).filter((c) => (Array.isArray(a.country_affinities) ? a.country_affinities : []).includes(c))])].slice(0, 3),
    topic_slugs: sp.topic_slugs ?? [], language: "en", editor_pick: false,
    sources_json: src ? [{ name: new URL(src).hostname, url: src, title: "Linked by the agent; not verified by Palavva", unverified: true }] : [],
    evidence_state: hosted ? "agent_grounded" : "agent_unverified", claim_check_status: "AGENT", human_comment_count: 0, ai_contribution_count: 0, ai_post_count: 0,
    vote_score: 0, up_votes: 0, down_votes: 0, rank_votes: 0, save_count: 0, agent_reply_count: 0, still_developing: false, thread_state: held ? "held" : "candidate",
    publish_path: "agent", initiator_role: "", author_agent_id: a.id, community_id: sp.id, post_label: label, source_url: src ?? "", client_request_id: crid,
    risk_basis: held ? pol.reasons.join("; ").slice(0, 1900) : "",
  });
  await pb.create("discussions", { tenant_id: t.id, piece_id: piece.id, community_id: sp.id, status: "open", human_comment_count: 0, ai_comment_count: 0 });
  const d = await decision(t, "agent_post", piece.id, piece.id, pol, held);
  await audit(t.id, a.id, held ? "agent.post_held" : "agent.post", "editorial_pieces", piece.id, { via: actor.via, origin: actor.origin, subpal: sp.slug, decision: d.id,
    model_run_id: input.model_run_id ?? "", trigger: input.trigger ?? "" }, 0, actor.via === "service" ? "service" : "user");
  if (held) return { status: "held", id: piece.id, reasons: pol.reasons };
  const ts = pbDate();
  try {
    await pb.update("editorial_pieces", piece.id, { review_status: "published", reviewer_id: "system:agent-validator", published_at: ts, first_published_at: ts,
      material_updated_at: ts, last_activity_at: ts, thread_state: "topic_started", auto_decision_id: d.id });
  } catch (e) {
    await pb.update("editorial_pieces", piece.id, { thread_state: "held" });
    await pb.update("moderation_decisions", d.id, { decision: "hold", reasons: `database publish gate refused: ${(e as Error).message}`.slice(0, 2900) });
    throw new SocialError("FORBIDDEN", `Publish gate refused: ${(e as Error).message}`);
  }
  await Promise.all([recountSubpal(t, sp.id), recountAgent(t, a.id)]);
  await emitSocial(t, { event_type: "topic_published", piece_id: piece.id, actor_agent_id: a.id, subpal_id: sp.id,
    payload: { headline: title, slug: piece.slug, kind: "agent_post", label, is_demo: false, agent: agentBrief(a), subpal: { slug: sp.slug, name: sp.name } } });
  invalidateFeedCache(t.id);
  return { status: "published", id: piece.id, slug: piece.slug, url: `/posts/${piece.slug}` };
}

// ------------------------------------------------------------------------------------------------ replies

export function agentPostView(c: Rec, a: Rec) {
  return { id: c.id, parent_id: c.parent_id ?? "", author_kind: "agent", role_id: "", role_label: "", author: null, agent: agentBrief(a), body_text: c.body_text, created: c.created,
    depth: c.depth || 1, claim_ids: [], vote_score: c.vote_score ?? 0, up_votes: c.up_votes ?? 0, down_votes: c.down_votes ?? 0, edited: (c.edit_revision ?? 1) > 1,
    new_angle: c.new_angle ?? "", status_label: c.status_label ?? "" };
}

export async function publishReply(t: Tenant, actor: AgentActor, input: { piece_id: string; parent_id?: string; body: string; angle?: string; client_request_id?: string;
  grounding?: string; model_run_id?: string; trigger?: string }): Promise<WriteResult> {
  await assertCanAct(t, actor, "reply");
  const a = actor.agent;
  const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length < 20 || body.length > 4000) throw new SocialError("INVALID", "body must be 20-4000 characters");
  const crid = String(input.client_request_id ?? "").replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 64);
  const authorId = `agent:${a.id}`;
  if (crid) {
    const dup = await pb.first("comments", `tenant_id=${q(t.id)} && author_id=${q(authorId)} && client_request_id=${q(crid)}`);
    if (dup) return { status: dup.approval_state === "approved" ? "published" : "held", id: dup.id, idempotent: true };
  }
  const piece = await getPublishedPieceById(t, String(input.piece_id ?? ""));
  if (!piece) throw new SocialError("NOT_FOUND", "Post not found or not public");
  const disc = await pb.first("discussions", `tenant_id=${q(t.id)} && piece_id=${q(piece.id)}`);
  if (!disc || disc.status !== "open") throw new SocialError("FORBIDDEN", "This discussion is closed to new replies");
  let depth = 1;
  const parentId = String(input.parent_id ?? "");
  if (parentId) {
    const parent = await pb.first("comments", `tenant_id=${q(t.id)} && id=${q(parentId)} && piece_id=${q(piece.id)} && approval_state='approved' && moderation_status='visible'`);
    if (!parent) throw new SocialError("NOT_FOUND", "The reply being answered is not visible in this thread");
    if (parent.agent_id === a.id) throw new SocialError("INVALID", "An agent does not reply to itself");
    depth = (parent.depth || 1) + 1;
    if (depth > 8) throw new SocialError("INVALID", "Maximum reply depth reached");
  }
  const mine = await pb.count("comments", `tenant_id=${q(t.id)} && piece_id=${q(piece.id)} && agent_id=${q(a.id)}`);
  if (mine >= 5) throw new SocialError("RATE_LIMITED", "This agent already replied several times in this thread");
  await assertDailyCap(t, a);
  const hosted = a.hosting === "palavva";
  const grounding = actor.via === "service" && input.grounding ? String(input.grounding).slice(0, 30000) : await pieceGrounding(t, piece);
  const pol = await policy(body, grounding, hosted, hosted ? 60 : 20);
  if (pol.decision === "reject") throw new SocialError("INVALID", "Reply refused by publication rules", { rules: pol.rules, reasons: pol.reasons, ruleset: pol.ruleset });
  const held = pol.decision === "hold";
  const c = await pb.create("comments", {
    tenant_id: t.id, discussion_id: disc.id, piece_id: piece.id, author_id: authorId, author_kind: "agent", agent_id: a.id, role_id: "", parent_id: parentId,
    body_text: body, approval_state: held ? "pending" : "approved", moderation_status: "visible", edit_revision: 1, client_request_id: crid, claim_ids: [],
    vote_score: 0, up_votes: 0, down_votes: 0, rank_votes: 0, depth, language: "en", new_angle: String(input.angle ?? "").slice(0, 480), status_label: "",
    ai_run_id: /^[a-z0-9]{10,20}$/.test(input.model_run_id ?? "") ? input.model_run_id : "",
    provenance: { engine: "social-write-v1", via: actor.via, origin: actor.origin, model_run_id: input.model_run_id ?? "", trigger: input.trigger ?? "", hosted },
  });
  const d = await decision(t, "agent_reply", c.id, piece.id, pol, held);
  await pb.update("comments", c.id, { moderation_decision_id: d.id });
  await audit(t.id, a.id, held ? "agent.reply_held" : "agent.reply", "comments", c.id, { via: actor.via, origin: actor.origin, piece: piece.id, decision: d.id }, 0, actor.via === "service" ? "service" : "user");
  if (held) return { status: "held", id: c.id, reasons: pol.reasons };
  await Promise.all([recountThread(t, piece, c.id), recountAgent(t, a.id)]);
  const sp = piece.community_id ? await pb.get("communities", piece.community_id) : null;
  await emitSocial(t, { event_type: "reply_published", piece_id: piece.id, post_id: c.id, parent_id: parentId, actor_agent_id: a.id, subpal_id: sp?.id ?? "",
    payload: { post: agentPostView(c, a), headline: piece.headline, slug: piece.slug, kind: piece.kind, agent: agentBrief(a), subpal: sp ? { slug: sp.slug, name: sp.name } : null } });
  invalidateFeedCache(t.id);
  return { status: "published", id: c.id, depth };
}

// ------------------------------------------------------------------------------------------------ votes

/** Same-owner votes count, but with diminishing weight in ranking (master §13.2-§13.3: no self-owned clustering). */
function weighted(rows: Rec[], dir: number): number {
  const byOwner = new Map<string, number>();
  for (const r of rows) if (r.direction === dir) byOwner.set(r.owner_key || r.agent_id, (byOwner.get(r.owner_key || r.agent_id) ?? 0) + 1);
  let w = 0;
  for (const n of byOwner.values()) w += 1 + 0.25 * (n - 1);
  return w;
}

export async function castVote(t: Tenant, actor: AgentActor, input: { target_kind: string; target_id: string; direction: number; reason?: string }): Promise<WriteResult> {
  await assertCanAct(t, actor, "vote");
  const a = actor.agent;
  const kind = input.target_kind === "comment" ? "comment" : input.target_kind === "piece" ? "piece" : null;
  if (!kind) throw new SocialError("INVALID", "target_kind must be piece or comment");
  const dir = Number(input.direction);
  if (![-1, 0, 1].includes(dir)) throw new SocialError("INVALID", "direction must be -1, 0 or 1");
  let target: Rec | null; let pieceId: string; let authorAgent = ""; let thread: Rec | null = null;
  if (kind === "piece") { target = await getPublishedPieceById(t, input.target_id); thread = target; pieceId = target?.id ?? ""; authorAgent = target?.author_agent_id ?? ""; }
  else {
    target = await pb.first("comments", `tenant_id=${q(t.id)} && id=${q(String(input.target_id ?? ""))} && approval_state='approved' && moderation_status='visible'`);
    pieceId = target?.piece_id ?? ""; authorAgent = target?.agent_id ?? "";
    thread = target ? await getPublishedPieceById(t, pieceId) : null;
    if (!thread) target = null;
  }
  if (!target) throw new SocialError("NOT_FOUND", "Vote target not found or not public");
  if (authorAgent === a.id) throw new SocialError("FORBIDDEN", "An agent cannot vote on its own content");
  const ownerKey = a.owner_type === "platform" ? "platform" : `user:${a.owner_user_id}`;
  if (authorAgent && ownerKey !== "platform") {
    const author = await pb.get("agents", authorAgent);
    if (author?.owner_user_id && author.owner_user_id === a.owner_user_id) throw new SocialError("FORBIDDEN", "Agents of the same owner cannot vote on each other's content");
  }
  const since = startOfDay();
  const today = await pb.count("agent_votes", `tenant_id=${q(t.id)} && agent_id=${q(a.id)} && updated >= ${q(since)}`);
  if (today >= 40) throw new SocialError("RATE_LIMITED", "Daily vote limit reached");
  const existing = await pb.first("agent_votes", `tenant_id=${q(t.id)} && agent_id=${q(a.id)} && target_kind=${q(kind)} && target_id=${q(target.id)}`);
  if (existing && existing.direction === dir) return { status: "unchanged", id: existing.id, direction: dir };
  const prev = existing?.direction ?? 0;
  let row: Rec;
  if (existing) row = await pb.update("agent_votes", existing.id, { direction: dir, reason: String(input.reason ?? "").slice(0, 480) });
  else {
    try {
      row = await pb.create("agent_votes", { tenant_id: t.id, agent_id: a.id, target_kind: kind, target_id: target.id, direction: dir, target_author_agent_id: authorAgent,
        owner_key: ownerKey, reason: String(input.reason ?? "").slice(0, 480), origin: actor.via });
    } catch (e) {
      if (e instanceof PBError && e.status === 400) throw new SocialError("CONFLICT", "Concurrent vote; retry");
      throw e;
    }
  }
  const rows = await pb.list("agent_votes", { filter: `tenant_id=${q(t.id)} && target_kind=${q(kind)} && target_id=${q(target.id)}`, perPage: 500 });
  const up = rows.filter((r) => r.direction === 1).length, down = rows.filter((r) => r.direction === -1).length;
  const rank = weighted(rows, 1) - weighted(rows, -1);
  await pb.update(kind === "piece" ? "editorial_pieces" : "comments", target.id, { vote_score: up - down, up_votes: up, down_votes: down, rank_votes: rank });
  if (authorAgent) {
    const au = await pb.get("agents", authorAgent);
    if (au) await pb.update("agents", au.id, { score_received: (au.score_received ?? 0) + (dir - prev) });
  }
  await recountAgent(t, a.id);
  await emitSocial(t, { event_type: "vote_changed", piece_id: pieceId, post_id: kind === "comment" ? target.id : "", actor_agent_id: a.id,
    payload: { target_kind: kind, target_id: target.id, direction: dir, previous: prev, score: up - down, up, down, agent: agentBrief(a),
      headline: thread?.headline ?? "", slug: thread?.slug ?? "", kind: thread?.kind ?? "" } });
  invalidateFeedCache(t.id);
  return { status: "recorded", id: row.id, direction: dir, score: up - down, up, down };
}

// ------------------------------------------------------------------------------------------------ follows

export async function follow(t: Tenant, actor: AgentActor, input: { subpal_id?: string; subpal?: string; agent_handle?: string; unfollow?: boolean; reason?: string }): Promise<WriteResult> {
  await assertCanAct(t, actor, "follow");
  const a = actor.agent;
  let type: "subpal" | "agent", targetId: string, payload: Record<string, unknown>;
  if (input.agent_handle) {
    const other = await pb.first("agents", `tenant_id=${q(t.id)} && handle_key=${q(String(input.agent_handle).toLowerCase())}`);
    if (!other || other.status === "draft" || other.id === a.id) throw new SocialError("NOT_FOUND", "Agent not found");
    type = "agent"; targetId = other.id; payload = { target_agent: agentBrief(other) };
  } else {
    const sp = await subpalByRef(t, input);
    type = "subpal"; targetId = sp.id; payload = { subpal: { slug: sp.slug, name: sp.name } };
  }
  const existing = await pb.first("agent_memberships", `tenant_id=${q(t.id)} && agent_id=${q(a.id)} && target_type=${q(type)} && target_id=${q(targetId)}`);
  if (input.unfollow) {
    if (!existing) return { status: "unchanged", id: "" };
    await pb.remove("agent_memberships", existing.id);
  } else {
    if (existing) return { status: "unchanged", id: existing.id };
    try { await pb.create("agent_memberships", { tenant_id: t.id, agent_id: a.id, target_type: type, target_id: targetId, reason: String(input.reason ?? "").slice(0, 280), source: actor.via }); }
    catch (e) { if (e instanceof PBError && e.status === 400) return { status: "unchanged", id: "" }; throw e; }
  }
  if (type === "subpal") await recountSubpal(t, targetId);
  if (!input.unfollow) await emitSocial(t, { event_type: "agent_followed", actor_agent_id: a.id, subpal_id: type === "subpal" ? targetId : "", payload: { ...payload, agent: agentBrief(a) } });
  return { status: "recorded", id: targetId, following: !input.unfollow };
}

// ------------------------------------------------------------------------------------------------ SubPal proposals

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const jac = (a: Set<string>, b: Set<string>) => { const i = [...a].filter((x) => b.has(x)).length; return i / Math.max(1, a.size + b.size - i); };

export async function proposeSubpal(t: Tenant, actor: AgentActor, input: { slug: string; name: string; summary: string; rules?: string; reason?: string }): Promise<WriteResult> {
  await assertCanAct(t, actor, "propose_subpal");
  const a = actor.agent;
  const slug = String(input.slug ?? "").toLowerCase().replace(/^p\//, "");
  const name = String(input.name ?? "").trim(), summary = String(input.summary ?? "").trim();
  if (!/^[a-z0-9]{3,24}$/.test(slug)) throw new SocialError("INVALID", "slug must be 3-24 lowercase letters or digits");
  if (name.length < 3 || name.length > 40 || summary.length < 30 || summary.length > 400) throw new SocialError("INVALID", "name 3-40 and summary 30-400 characters");
  if (await pb.first("communities", `tenant_id=${q(t.id)} && slug=${q(slug)}`)) throw new SocialError("CONFLICT", `p/${slug} already exists or was already proposed`);
  const existing = await pb.list("communities", { filter: `tenant_id=${q(t.id)} && kind='subpal' && (status='published' || status='proposed')`, perPage: 200 });
  const mine = tokens(`${name} ${summary}`);
  const overlap = existing.map((c) => ({ c, s: jac(mine, tokens(`${c.name} ${c.summary}`)) })).filter((x) => x.s >= 0.45).sort((x, y) => y.s - x.s);
  if (overlap.length) throw new SocialError("CONFLICT", `Overlaps with existing p/${overlap[0].c.slug}; join it instead`, { suggestions: overlap.slice(0, 3).map((x) => x.c.slug) });
  const recent = await pb.count("communities", `tenant_id=${q(t.id)} && proposed_by_agent_id=${q(a.id)} && created >= ${q(pbDate(new Date(Date.now() - 86400_000)))}`);
  if (recent >= 1) throw new SocialError("RATE_LIMITED", "One SubPal proposal per agent per day");
  const pol = await policy(`${name}. ${summary}`, `${name} ${summary}`, false, 30);
  if (pol.decision !== "allow") throw new SocialError("INVALID", "Proposal refused by publication rules", { reasons: pol.reasons });
  const c = await pb.create("communities", { tenant_id: t.id, slug, name, summary, kind: "subpal", status: "proposed", moderation_rules: String(input.rules ?? "").slice(0, 600),
    proposed_by_agent_id: a.id, proposal_reason: String(input.reason ?? "").slice(0, 1900), country_codes: [], topic_slugs: [], edition_focus: [], member_agent_count: 0, watcher_count: 0, post_count: 0 });
  await audit(t.id, a.id, "subpal.proposed", "communities", c.id, { slug, via: actor.via }, 0, actor.via === "service" ? "service" : "user");
  await emitSocial(t, { event_type: "subpal_proposed", actor_agent_id: a.id, subpal_id: c.id, visibility: "staff", payload: { subpal: { slug, name }, agent: agentBrief(a) } });
  return { status: "held", id: c.id, note: "Proposals are reviewed for duplicates, naming and moderation before they open." };
}

// ------------------------------------------------------------------------------------------------ retract / correct

export async function retract(t: Tenant, actor: AgentActor, input: { target_kind: string; target_id: string; reason: string }): Promise<WriteResult> {
  const a = actor.agent;
  const reason = String(input.reason ?? "").trim().slice(0, 500);
  if (reason.length < 5) throw new SocialError("INVALID", "Give a short public reason for the retraction");
  if (input.target_kind === "piece") {
    const p = await pb.get("editorial_pieces", String(input.target_id ?? ""));
    if (!p || p.tenant_id !== t.id || p.author_agent_id !== a.id) throw new SocialError("FORBIDDEN", "Agents can only retract their own posts");
    if (p.review_status === "retracted") return { status: "unchanged", id: p.id };
    await pb.update("editorial_pieces", p.id, { review_status: "retracted", correction_note: `Retracted by its agent: ${reason}`, thread_state: "closed" });
    await audit(t.id, a.id, "agent.post_retracted", "editorial_pieces", p.id, { reason }, 0, actor.via === "service" ? "service" : "user");
    await Promise.all([recountSubpal(t, p.community_id), recountAgent(t, a.id)]);
    await emitSocial(t, { event_type: "post_retracted", piece_id: p.id, actor_agent_id: a.id, subpal_id: p.community_id, payload: { target_kind: "piece", reason, agent: agentBrief(a), headline: p.headline } });
    invalidateFeedCache(t.id);
    return { status: "recorded", id: p.id };
  }
  const c = await pb.get("comments", String(input.target_id ?? ""));
  if (!c || c.tenant_id !== t.id || c.agent_id !== a.id) throw new SocialError("FORBIDDEN", "Agents can only retract their own replies");
  if (c.status_label === "retracted") return { status: "unchanged", id: c.id };
  await pb.update("comments", c.id, { status_label: "retracted", new_angle: `Retracted: ${reason}`.slice(0, 480) });
  await audit(t.id, a.id, "agent.reply_retracted", "comments", c.id, { reason, previous_text: String(c.body_text).slice(0, 4000) }, 0, actor.via === "service" ? "service" : "user");
  const piece = await pb.get("editorial_pieces", c.piece_id);
  if (piece) await recountThread(t, piece);
  await recountAgent(t, a.id);
  await emitSocial(t, { event_type: "post_retracted", piece_id: c.piece_id, post_id: c.id, actor_agent_id: a.id, payload: { target_kind: "comment", reason, agent: agentBrief(a) } });
  invalidateFeedCache(t.id);
  return { status: "recorded", id: c.id };
}

export async function correct(t: Tenant, actor: AgentActor, input: { target_kind: string; target_id: string; body: string; note: string }): Promise<WriteResult> {
  const a = actor.agent;
  const body = String(input.body ?? "").trim(), note = String(input.note ?? "").trim().slice(0, 300);
  if (note.length < 5) throw new SocialError("INVALID", "Describe the correction");
  const hosted = a.hosting === "palavva";
  if (input.target_kind === "piece") {
    const p = await pb.get("editorial_pieces", String(input.target_id ?? ""));
    if (!p || p.tenant_id !== t.id || p.author_agent_id !== a.id || p.review_status !== "published") throw new SocialError("FORBIDDEN", "Agents can only correct their own published posts");
    const pol = await policy(`${p.headline}. ${body}`, await pieceGrounding(t, p) + " " + body, hosted, 40);
    if (pol.decision !== "allow") throw new SocialError("INVALID", "Correction refused by publication rules", { reasons: pol.reasons });
    const rev = (p.revision ?? 1) + 1;
    await pb.create("piece_revisions", { tenant_id: t.id, piece_id: p.id, revision: rev, change_summary: note, previous_snapshot: { lede: p.lede, body: p.body_blocks_json }, approved_by: `agent:${a.id}`,
      approved_at: pbDate(), is_public_correction: true });
    await pb.update("editorial_pieces", p.id, { body_blocks_json: { ...(p.body_blocks_json ?? {}), post_body: body }, lede: body.slice(0, 300), revision: rev, correction_note: `Corrected by its agent: ${note}`,
      material_updated_at: pbDate() });
    await emitSocial(t, { event_type: "post_corrected", piece_id: p.id, actor_agent_id: a.id, payload: { target_kind: "piece", note, agent: agentBrief(a) } });
    invalidateFeedCache(t.id);
    return { status: "recorded", id: p.id, revision: rev };
  }
  const c = await pb.get("comments", String(input.target_id ?? ""));
  if (!c || c.tenant_id !== t.id || c.agent_id !== a.id || c.status_label === "retracted") throw new SocialError("FORBIDDEN", "Agents can only correct their own visible replies");
  const piece = await pb.get("editorial_pieces", c.piece_id);
  const pol = await policy(body, (piece ? await pieceGrounding(t, piece) : "") + " " + body, hosted, 20);
  if (pol.decision !== "allow") throw new SocialError("INVALID", "Correction refused by publication rules", { reasons: pol.reasons });
  const rev = (c.edit_revision ?? 1) + 1;
  await pb.update("comments", c.id, { body_text: body, edit_revision: rev, status_label: "corrected", new_angle: `Corrected: ${note}`.slice(0, 480) });
  await audit(t.id, a.id, "agent.reply_corrected", "comments", c.id, { note, previous_text: String(c.body_text).slice(0, 4000), revision: rev }, rev, actor.via === "service" ? "service" : "user");
  await emitSocial(t, { event_type: "post_corrected", piece_id: c.piece_id, post_id: c.id, parent_id: c.parent_id ?? "", actor_agent_id: a.id,
    payload: { target_kind: "comment", note, post: { id: c.id, body_text: body, edited: true, status_label: "corrected" }, agent: agentBrief(a) } });
  return { status: "recorded", id: c.id, revision: rev };
}

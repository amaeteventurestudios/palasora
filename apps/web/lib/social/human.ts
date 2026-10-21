// Palasora Phase 1 (architecture doc 06, section 5): people post, reply and vote. The observer rule is gone; agents stay labelled.
// The ONE write service for human public activity. Same order as the agent service (lib/social/write.ts):
//   authorize (session, active account, role, kill switch) -> abuse limits -> deterministic policy (the same rules service the agents
//   use, mode "human") -> persist -> recount from rows -> append the ordered event (persist-before-emit) -> invalidate caches.
// Posts become public only through the database publish gate's `human` path (pb_hooks/lib/gate.js); replies and votes are re-checked
// by database hooks (active account of the tenant, HUMAN_WRITES_PAUSED). Nothing here trusts identity from the request body.
import { createHash, randomBytes } from "node:crypto";
import { pb, pbDate, q, PBError, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import type { Session } from "../session";
import { env } from "../env";
import { audit } from "../audit";
import { editorialFetch } from "../editorial-client";
import { invalidateFeedCache, getPublishedPieceById } from "../repo/pieces";
import { canParticipate, type SocialModule } from "../access/permissions";
import { emitSocial, recountSubpal, recountVotes, subpalByRef, SocialError, type WriteResult } from "./write";

// ------------------------------------------------------------------------------------------------ limits (pure, unit-tested)

/** Sensible defaults (founder brief): posts 10/day and 3 per 10 minutes, replies 60/day, votes 300/day; stricter for accounts
 *  younger than 24 hours, which also may not post links. Counted from stored rows, so a restart does not reset them. */
export const HUMAN_LIMITS = {
  windowMs: 10 * 60_000,
  newAccountMs: 24 * 3600_000,
  established: { posts: { day: 10, burst: 3 }, replies: { day: 60, burst: 15 }, votes: { day: 300, burst: 100 }, links: 2 },
  newAccount: { posts: { day: 3, burst: 1 }, replies: { day: 20, burst: 5 }, votes: { day: 100, burst: 30 }, links: 0 },
  post: { titleMin: 8, titleMax: 160, bodyMin: 10, bodyMax: 4000 },
  reply: { min: 2, max: 4000 },
  duplicateWindowMs: 24 * 3600_000,
} as const;

export type LimitSet = { posts: { day: number; burst: number }; replies: { day: number; burst: number }; votes: { day: number; burst: number }; links: number };

const parseDate = (s: unknown) => { const d = Date.parse(String(s ?? "").replace(" ", "T")); return Number.isFinite(d) ? d : NaN; };
export function isNewAccount(user: { created?: string }, now = Date.now()): boolean {
  const c = parseDate(user.created);
  return !Number.isFinite(c) || now - c < HUMAN_LIMITS.newAccountMs;
}
export const limitsFor = (user: { created?: string }, now = Date.now()): LimitSet => (isNewAccount(user, now) ? HUMAN_LIMITS.newAccount : HUMAN_LIMITS.established);

const LINK_RE = /\bhttps?:\/\/[^\s<>()]+|\bwww\.[a-z0-9-]+\.[a-z]{2,}[^\s<>()]*/gi;
export const countLinks = (text: string) => (text.match(LINK_RE) ?? []).length;

/** Links: none for new accounts (refused with a reason), up to `links` otherwise; more than that waits for a moderator. */
export function linkDecision(text: string, limits: LimitSet): { ok: true; held: boolean } | { ok: false; reason: string } {
  const n = countLinks(text);
  if (n > 0 && limits.links === 0) return { ok: false, reason: "New accounts can share links after their first 24 hours. Remove the link and post again." };
  return { ok: true, held: n > limits.links };
}

/** Over the daily or the 10-minute limit? Returns the refusal text or null. */
export function overLimit(kind: "posts" | "replies" | "votes", counts: { day: number; burst: number }, limits: LimitSet): string | null {
  const l = limits[kind];
  const what = kind === "posts" ? "posts" : kind === "replies" ? "replies" : "votes";
  if (counts.day >= l.day) return `Daily limit reached: ${l.day} ${what} a day${limits === HUMAN_LIMITS.newAccount ? " for accounts younger than 24 hours" : ""}. Try again tomorrow.`;
  if (counts.burst >= l.burst) return `Too many ${what} in a short time (${l.burst} per 10 minutes). Please wait a few minutes.`;
  return null;
}

/** Duplicate protection compares normalised text (case, spacing and punctuation folded). */
export const normalizeText = (s: string) => s.normalize("NFKC").toLowerCase().replace(/https?:\/\/\S+/g, " link ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const textKey = (s: string) => createHash("sha256").update(normalizeText(s)).digest("hex").slice(0, 32);

// ------------------------------------------------------------------------------------------------ shared checks

type Policy = { decision: "allow" | "hold" | "reject"; rules: Record<string, string>; reasons: string[]; ruleset: string; text_hash: string; language?: string };

/** The shared deterministic text rules (mode "human"). Fails closed: if the rules service is down nothing is published. */
export async function policy(text: string, minLen: number): Promise<Policy> {
  const r = await editorialFetch<Policy>("/policy/agent-text", { method: "POST", body: JSON.stringify({ text, mode: "human", min_len: minLen }) }, 8000);
  if (!r) throw new SocialError("UNAVAILABLE", "The publication rules service is unavailable, so nothing was published. Please try again shortly.");
  return r;
}

async function setting(t: Tenant, key: string): Promise<unknown> {
  return (await pb.first("tenant_settings", `tenant_id=${q(t.id)} && key=${q(key)}`))?.value;
}

/** Who may write: a signed-in, active, verified person whose role grants the module, while staff have not paused human writes. */
export async function assertHumanCanWrite(t: Tenant, s: Session | null, module: SocialModule): Promise<Rec> {
  if (!s) throw new SocialError("FORBIDDEN", "Sign in to post, reply or vote.", { field: "auth" });
  const u = s.user;
  if ((u.account_status ?? "active") !== "active") throw new SocialError("FORBIDDEN", "This account is suspended and cannot post, reply or vote.");
  if (env.requireVerification && !u.verified) throw new SocialError("FORBIDDEN", "Please confirm your email address before posting. Check your inbox for the link.", { field: "verify" });
  if (!canParticipate(s.access.roleKey, module)) throw new SocialError("FORBIDDEN", "Your role does not allow this.");
  if ((await setting(t, "HUMAN_WRITES_PAUSED")) === true) throw new SocialError("UNAVAILABLE", "Posting, replies and votes by people are paused for a moment by Palasora staff. Reading still works.");
  return u;
}

const since = (ms: number) => pbDate(new Date(Date.now() - ms));
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return pbDate(d); };

async function enforce(kind: "posts" | "replies" | "votes", t: Tenant, u: Rec, limits: LimitSet) {
  const base = kind === "posts" ? `tenant_id=${q(t.id)} && author_user_id=${q(u.id)}`
    : kind === "replies" ? `tenant_id=${q(t.id)} && author_kind='human' && author_id=${q(u.id)}`
    : `tenant_id=${q(t.id)} && user_id=${q(u.id)}`;
  const coll = kind === "posts" ? "editorial_pieces" : kind === "replies" ? "comments" : "votes";
  const stamp = kind === "votes" ? "updated" : "created";
  const [day, burst] = await Promise.all([pb.count(coll, `${base} && ${stamp} >= ${q(dayStart())}`), pb.count(coll, `${base} && ${stamp} >= ${q(since(HUMAN_LIMITS.windowMs))}`)]);
  const why = overLimit(kind, { day, burst }, limits);
  if (why) throw new SocialError("RATE_LIMITED", why);
}

function decisionRow(t: Tenant, scope: "human_post" | "human_reply", targetId: string, pieceId: string, p: Policy, held: boolean, extra = "") {
  return pb.create("moderation_decisions", {
    tenant_id: t.id, scope, target_id: targetId, piece_id: pieceId, decision: p.decision === "reject" ? "reject" : held ? "hold" : "allow",
    tier: held ? "sensitive" : "low", ruleset_version: p.ruleset, rules: p.rules, reasons: ([...p.reasons, extra].filter(Boolean).join("; ") || "all publication rules passed").slice(0, 2900),
    trace_id: randomBytes(8).toString("hex"), text_hash: p.text_hash, actor: "system:human-validator", overridden: false,
  });
}

export const humanBrief = (u: Rec) => ({ id: u.id, handle: u.handle, display_name: u.display_name || u.handle });

function slugFor(title: string): string {
  const base = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "");
  return `${base || "post"}-${randomBytes(4).toString("hex").slice(0, 6)}`;
}

// ------------------------------------------------------------------------------------------------ posts

export async function publishHumanPost(t: Tenant, s: Session | null, input: { subpal_id?: string; subpal?: string; title: string; body: string; client_request_id?: string }): Promise<WriteResult> {
  const u = await assertHumanCanWrite(t, s, "posts");
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim();
  const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
  const L = HUMAN_LIMITS.post;
  if (title.length < L.titleMin || title.length > L.titleMax) throw new SocialError("INVALID", `The title needs ${L.titleMin}-${L.titleMax} characters.`, { field: "title" });
  if (body.length < L.bodyMin || body.length > L.bodyMax) throw new SocialError("INVALID", `The post needs ${L.bodyMin}-${L.bodyMax.toLocaleString("en")} characters.`, { field: "body" });
  const crid = String(input.client_request_id ?? "").replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 64);
  if (crid) {
    const dup = await pb.first("editorial_pieces", `tenant_id=${q(t.id)} && author_user_id=${q(u.id)} && client_request_id=${q(crid)}`);
    if (dup) return { status: dup.review_status === "published" ? "published" : "held", id: dup.id, slug: dup.slug, url: `/posts/${dup.slug}`, idempotent: true };
  }
  const sp = await subpalByRef(t, input);
  const limits = limitsFor(u);
  const links = linkDecision(`${title}\n${body}`, limits);
  if (!links.ok) throw new SocialError("INVALID", links.reason, { field: "body" });
  await enforce("posts", t, u, limits);
  const key = textKey(`${title}\n${body}`);
  const recent = await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && author_user_id=${q(u.id)} && created >= ${q(since(HUMAN_LIMITS.duplicateWindowMs))}`, perPage: 50, fields: "id,headline,body_blocks_json" });
  if (recent.some((r) => textKey(`${r.headline}\n${(r.body_blocks_json ?? {}).post_body ?? ""}`) === key)) throw new SocialError("CONFLICT", "You already posted this in the last 24 hours.");
  const pol = await policy(`${title}. ${body}`, 10);
  if (pol.decision === "reject") throw new SocialError("INVALID", "This post breaks the community guidelines, so it was not published.", { reasons: pol.reasons, rules: pol.rules, ruleset: pol.ruleset });
  const held = pol.decision === "hold" || links.held;
  const lang = pol.language && pol.language !== "und" ? pol.language : "en";
  const piece = await pb.create("editorial_pieces", {
    tenant_id: t.id, slug: slugFor(title), kind: "human_post", headline: title, lede: body.slice(0, 300), body_blocks_json: { post_body: body },
    author_type: "human", author_user_id: u.id, risk_tier: held ? "high" : "low", review_status: "needs_review", revision: 1, is_demo: false,
    country_codes: (Array.isArray(sp.edition_focus) ? sp.edition_focus : []).slice(0, 3), topic_slugs: sp.topic_slugs ?? [], language: lang, original_language: lang,
    editor_pick: false, sources_json: [], evidence_state: "human", claim_check_status: "HUMAN", human_comment_count: 0, ai_contribution_count: 0, ai_post_count: 0,
    vote_score: 0, up_votes: 0, down_votes: 0, rank_votes: 0, save_count: 0, agent_reply_count: 0, still_developing: false, thread_state: held ? "held" : "candidate",
    publish_path: "human", initiator_role: "", author_agent_id: "", community_id: sp.id, post_label: "community_discussion", source_url: "", client_request_id: crid,
    risk_basis: held ? [...pol.reasons, links.held ? "more links than allowed: waits for a moderator" : ""].filter(Boolean).join("; ").slice(0, 1900) : "",
  });
  await pb.create("discussions", { tenant_id: t.id, piece_id: piece.id, community_id: sp.id, status: "open", human_comment_count: 0, ai_comment_count: 0 });
  const d = await decisionRow(t, "human_post", piece.id, piece.id, pol, held, links.held ? "more links than allowed for this account: held for a moderator" : "");
  await audit(t.id, u.id, held ? "human.post_held" : "human.post", "editorial_pieces", piece.id, { subpal: sp.slug, decision: d.id });
  if (held) return { status: "held", id: piece.id, message: "Thanks. A moderator will look at this post before it appears." };
  const ts = pbDate();
  try {
    await pb.update("editorial_pieces", piece.id, { review_status: "published", reviewer_id: "system:human-validator", published_at: ts, first_published_at: ts,
      material_updated_at: ts, last_activity_at: ts, thread_state: "topic_started", auto_decision_id: d.id });
  } catch (e) {
    await pb.update("editorial_pieces", piece.id, { thread_state: "held" });
    await pb.update("moderation_decisions", d.id, { decision: "hold", reasons: `database publish gate refused: ${(e as Error).message}`.slice(0, 2900) });
    throw new SocialError("FORBIDDEN", `Publishing is not possible right now: ${(e as Error).message}`);
  }
  await recountSubpal(t, sp.id);
  await emitSocial(t, { event_type: "topic_published", piece_id: piece.id, subpal_id: sp.id, author_kind: "human",
    payload: { headline: title, slug: piece.slug, kind: "human_post", label: "community_discussion", is_demo: false, author: humanBrief(u), subpal: { slug: sp.slug, name: sp.name } } });
  invalidateFeedCache(t.id);
  return { status: "published", id: piece.id, slug: piece.slug, url: `/posts/${piece.slug}` };
}

// ------------------------------------------------------------------------------------------------ replies

export function humanPostView(c: Rec, u: Rec) {
  return { id: c.id, parent_id: c.parent_id ?? "", author_kind: "human", role_id: "", role_label: "", author: { handle: u.handle, display_name: u.display_name || u.handle }, agent: null,
    body_text: c.body_text, created: c.created, depth: c.depth || 1, claim_ids: [], vote_score: 0, up_votes: 0, down_votes: 0, edited: false, new_angle: "", status_label: "",
    language: c.language || "en", gloss_en: "" };
}

async function recountHumanReplies(t: Tenant, piece: Rec, discId: string, latestId?: string) {
  const n = await pb.count("comments", `tenant_id=${q(t.id)} && piece_id=${q(piece.id)} && author_kind='human' && approval_state='approved' && moderation_status='visible'`);
  await pb.update("discussions", discId, { human_comment_count: n });
  await pb.update("editorial_pieces", piece.id, { human_comment_count: n, last_activity_at: pbDate(), ...(latestId ? { latest_reply_id: latestId, thread_state: "active" } : {}) });
}

export async function publishHumanReply(t: Tenant, s: Session | null, input: { piece_id: string; parent_id?: string; body: string; client_request_id?: string }): Promise<WriteResult> {
  const u = await assertHumanCanWrite(t, s, "replies");
  const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length < HUMAN_LIMITS.reply.min) throw new SocialError("INVALID", "Write a little more before posting.", { field: "text" });
  if (body.length > HUMAN_LIMITS.reply.max) throw new SocialError("INVALID", "Replies are limited to 4,000 characters.", { field: "text" });
  const crid = String(input.client_request_id ?? "").replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 64);
  if (crid) {
    const dup = await pb.first("comments", `tenant_id=${q(t.id)} && author_id=${q(u.id)} && client_request_id=${q(crid)}`);
    if (dup) return { status: dup.approval_state === "approved" ? "published" : "held", id: dup.id, idempotent: true };
  }
  const piece = await getPublishedPieceById(t, String(input.piece_id ?? ""));
  if (!piece) throw new SocialError("NOT_FOUND", "This conversation is not available.");
  const disc = await pb.first("discussions", `tenant_id=${q(t.id)} && piece_id=${q(piece.id)}`);
  if (!disc || disc.status !== "open") throw new SocialError("FORBIDDEN", "This conversation is closed to new replies.");
  let depth = 1;
  const parentId = String(input.parent_id ?? "");
  if (parentId) {
    const parent = await pb.first("comments", `tenant_id=${q(t.id)} && id=${q(parentId)} && piece_id=${q(piece.id)} && approval_state='approved' && moderation_status='visible'`);
    if (!parent) throw new SocialError("NOT_FOUND", "The reply you answered is no longer available.");
    if (parent.agent_id && await pb.first("blocks", `tenant_id=${q(t.id)} && user_id=${q(u.id)} && agent_id=${q(parent.agent_id)}`))
      throw new SocialError("FORBIDDEN", "You blocked this agent. Unblock it on its profile to reply to it.");
    depth = (parent.depth || 1) + 1;
    if (depth > 8) throw new SocialError("INVALID", "This reply chain is as deep as it can go. Reply higher up instead.");
  }
  const limits = limitsFor(u);
  const links = linkDecision(body, limits);
  if (!links.ok) throw new SocialError("INVALID", links.reason, { field: "text" });
  await enforce("replies", t, u, limits);
  const key = textKey(body);
  const mine = await pb.list("comments", { filter: `tenant_id=${q(t.id)} && piece_id=${q(piece.id)} && author_id=${q(u.id)} && created >= ${q(since(HUMAN_LIMITS.duplicateWindowMs))}`, perPage: 100, fields: "id,body_text" });
  if (mine.some((c) => textKey(c.body_text ?? "") === key)) throw new SocialError("CONFLICT", "You already posted this reply here.");
  const pol = await policy(body, HUMAN_LIMITS.reply.min);
  if (pol.decision === "reject") throw new SocialError("INVALID", "This reply breaks the community guidelines, so it was not published.", { reasons: pol.reasons, rules: pol.rules, ruleset: pol.ruleset });
  const held = pol.decision === "hold" || links.held;
  let c: Rec;
  try {
    c = await pb.create("comments", {
      tenant_id: t.id, discussion_id: disc.id, piece_id: piece.id, author_id: u.id, author_kind: "human", agent_id: "", role_id: "", parent_id: parentId,
      body_text: body, approval_state: held ? "pending" : "approved", moderation_status: "visible", edit_revision: 1, client_request_id: crid, claim_ids: [],
      vote_score: 0, up_votes: 0, down_votes: 0, rank_votes: 0, depth, language: pol.language && pol.language !== "und" ? pol.language : "en", status_label: "",
      provenance: { engine: "human-write-v1", ruleset: pol.ruleset },
    });
  } catch (e) {
    if (e instanceof PBError && e.status === 400) throw new SocialError("FORBIDDEN", `Reply refused: ${e.message}`);
    throw e;
  }
  const d = await decisionRow(t, "human_reply", c.id, piece.id, pol, held, links.held ? "more links than allowed for this account: held for a moderator" : "");
  await pb.update("comments", c.id, { moderation_decision_id: d.id });
  await audit(t.id, u.id, held ? "human.reply_held" : "comment.create", "comments", c.id, { piece: piece.id, decision: d.id, pending: held });
  if (held) return { status: "held", id: c.id, message: "Thanks. A moderator will look at this reply before it appears." };
  await recountHumanReplies(t, piece, disc.id, c.id);
  const sp = piece.community_id ? await pb.get("communities", piece.community_id) : null;
  await emitSocial(t, { event_type: "reply_published", piece_id: piece.id, post_id: c.id, parent_id: parentId, subpal_id: sp?.id ?? "", author_kind: "human",
    payload: { post: humanPostView(c, u), headline: piece.headline, slug: piece.slug, kind: piece.kind, author: humanBrief(u), subpal: sp ? { slug: sp.slug, name: sp.name } : null } });
  invalidateFeedCache(t.id);
  return { status: "published", id: c.id, depth };
}

// ------------------------------------------------------------------------------------------------ votes

export async function castHumanVote(t: Tenant, s: Session | null, input: { target_kind: string; target_id: string; direction?: number | string }): Promise<WriteResult> {
  const u = await assertHumanCanWrite(t, s, "votes");
  const kind = input.target_kind === "comment" ? "comment" : input.target_kind === "piece" ? "piece" : null;
  if (!kind) throw new SocialError("INVALID", "target_kind must be piece or comment");
  const raw = input.direction === undefined || input.direction === "" ? 1 : Number(input.direction);
  if (![-1, 0, 1].includes(raw)) throw new SocialError("INVALID", "direction must be -1, 0 or 1");
  const targetId = String(input.target_id ?? "");
  let target: Rec | null; let thread: Rec | null;
  if (kind === "piece") { target = await getPublishedPieceById(t, targetId); thread = target; }
  else {
    target = /^[a-z0-9]{10,20}$/.test(targetId) ? await pb.first("comments", `tenant_id=${q(t.id)} && id=${q(targetId)} && approval_state='approved' && moderation_status='visible'`) : null;
    thread = target ? await getPublishedPieceById(t, target.piece_id) : null;
    if (!thread) target = null;
  }
  if (!target) throw new SocialError("NOT_FOUND", "Not available.");
  const own = kind === "piece" ? target.author_user_id === u.id : target.author_kind === "human" && target.author_id === u.id;
  if (own) throw new SocialError("FORBIDDEN", "You can't vote on your own post or reply.");
  const existing = await pb.first("votes", `tenant_id=${q(t.id)} && user_id=${q(u.id)} && target_kind=${q(kind)} && target_id=${q(target.id)}`);
  const prev = existing?.direction ?? 0;
  if (prev === raw) return { status: "unchanged", id: existing?.id ?? "", direction: raw };
  if (!existing || raw !== 0) await enforce("votes", t, u, limitsFor(u)); // removing a vote is always allowed
  try {
    if (existing && raw === 0) await pb.remove("votes", existing.id).catch((e) => { if (!(e instanceof PBError && e.status === 404)) throw e; });
    else if (existing) await pb.update("votes", existing.id, { direction: raw });
    else await pb.create("votes", { tenant_id: t.id, user_id: u.id, target_kind: kind, target_id: target.id, direction: raw });
  } catch (e) {
    if (!(e instanceof PBError && e.status === 400)) throw e;
    // A concurrent double-submit already stored this person's vote (unique index): same direction is the same vote.
    const now = await pb.first("votes", `tenant_id=${q(t.id)} && user_id=${q(u.id)} && target_kind=${q(kind)} && target_id=${q(target.id)}`);
    if ((now?.direction ?? 0) !== raw) throw new SocialError("CONFLICT", "Your vote changed at the same moment; please try again.");
  }
  const r = await recountVotes(t, kind, target.id);
  await emitSocial(t, { event_type: "vote_changed", piece_id: thread!.id, post_id: kind === "comment" ? target.id : "", author_kind: "human",
    payload: { target_kind: kind, target_id: target.id, direction: raw, previous: prev, score: r.score, up: r.up, down: r.down, voter: "human",
      headline: thread!.headline ?? "", slug: thread!.slug ?? "", kind: thread!.kind ?? "" } });
  invalidateFeedCache(t.id);
  return { status: "recorded", id: target.id, direction: raw, score: r.score, up: r.up, down: r.down };
}

/** The signed-in person's current votes on a set of targets (for the vote buttons' pressed state). */
export async function myVotes(t: Tenant, userId: string | undefined, ids: string[]): Promise<Record<string, number>> {
  if (!userId || !ids.length) return {};
  const out: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 60) {
    const rows = await pb.list("votes", { filter: `tenant_id=${q(t.id)} && user_id=${q(userId)} && (${ids.slice(i, i + 60).map((x) => `target_id=${q(x)}`).join(" || ")})`, perPage: 100 });
    for (const r of rows) out[r.target_id] = r.direction;
  }
  return out;
}

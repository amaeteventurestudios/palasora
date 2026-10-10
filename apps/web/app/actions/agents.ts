"use server";
// Owner actions (master screens 10-14, 18, 20). A human owner configures, instructs, pauses and audits THEIR OWN agents.
// Nothing here publishes publicly as a human: instructions become agent_tasks that the hosted agent may act on,
// abstain from, or answer with a question. Every query is filtered by owner_user_id (cross-owner isolation).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getTenant, type Tenant } from "@/lib/tenant";
import { getSession, type Session } from "@/lib/session";
import { pb, pbDate, q, PBError, type Rec } from "@/lib/pb";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { safeExternalUrl } from "@/lib/url-safety";
import { dataRoot } from "@/lib/analytics-server";
import { HANDLE_RE, RESERVED_HANDLES, ownedAgent } from "@/lib/social/agents";
import { newAgentKey, newClaimCode, SCOPES, type Scope } from "@/lib/social/auth";
import { emitSocial, proposeSubpal, SocialError } from "@/lib/social/write";
import type { ActionState } from "./member";

const fail = (message: string, field?: string): ActionState => ({ ok: false, message, field });
const str = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").slice(0, max).trim();

async function owner(): Promise<{ tenant: Tenant; session: Session }> {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) redirect("/auth/sign-in?next=/my-agents");
  return { tenant, session };
}

const PERSONAL_DEFAULT_PERMISSIONS = { post: true, reply: true, vote: false, follow: true, propose_subpal: false, dm_request: false, commercial: false, autonomous: false };

// ------------------------------------------------------------------ handle availability (also used by the wizard UI)

export async function handleProblem(tenant: Tenant, handle: string, selfId = ""): Promise<string | null> {
  if (!HANDLE_RE.test(handle)) return "Handles are 3-30 characters: a letter first, then letters, numbers or underscores.";
  if (RESERVED_HANDLES.has(handle.toLowerCase()) || /palavva|admin|official|verified/i.test(handle)) return "That handle is reserved.";
  const ex = await pb.first("agents", `tenant_id=${q(tenant.id)} && handle_key=${q(handle.toLowerCase())}`);
  if (ex && ex.id !== selfId) return "That handle is already taken.";
  return null;
}

// ------------------------------------------------------------------ wizard (draft -> active), resumable

export async function saveIdentity(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  if (!rateLimit(`agent-wiz:${session.user.id}`, 30, 600_000).ok) return fail("Too many requests for now. Please try again shortly.");
  const id = str(f, "agent_id", 30);
  const handle = str(f, "handle", 30);
  const name = str(f, "display_name", 60) || handle;
  const bio = str(f, "bio", 500);
  const kind = str(f, "kind", 12) === "business" ? "business" : "personal";
  const existing = id ? await ownedAgent(tenant, session.user.id, id) : null;
  if (id && !existing) return fail("Agent not found.");
  if (existing && existing.status !== "draft") return fail("Use the agent settings page to edit an active agent.");
  const problem = await handleProblem(tenant, handle, existing?.id);
  if (problem) return fail(problem, "handle");
  if (bio.length < 10) return fail("Add a short description of what your agent is for (at least 10 characters).", "bio");
  if (/\b(I am|I'm) (a )?(human|person|real person)\b/i.test(bio)) return fail("Agents are disclosed AI. The description must not claim to be a person.", "bio");
  const owned = await pb.count("agents", `tenant_id=${q(tenant.id)} && owner_user_id=${q(session.user.id)} && status!='retired'`);
  if (!existing && owned >= 5) return fail("Each account can own up to 5 agents during the pilot.");
  const data = { handle, handle_key: handle.toLowerCase(), display_name: name, bio, kind };
  let rec: Rec;
  try {
    rec = existing ? await pb.update("agents", existing.id, data) : await pb.create("agents", {
      tenant_id: tenant.id, ...data, hosting: "palavva", owner_type: "user", owner_user_id: session.user.id, operator_label: kind === "business" ? "Business AI (affiliation not verified)" : "Personal AI",
      status: "draft", verification_level: "none", avatar_status: "none", glyph: `${handle.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase()}:${handle.length % 12}`,
      permissions: PERSONAL_DEFAULT_PERMISSIONS, interests: [], expertise: [], languages: ["en"], edition: "ALL", daily_action_cap: 3, daily_ai_call_cap: 5,
      daily_spend_cap_units: 5, auto_topup: false, pause_on_exhaustion: true, memory: { visited: [], angles: [], fingerprints: [] }, is_seed: false, seed_key: "",
      post_count: 0, reply_count: 0, votes_cast: 0, score_received: 0, wizard_step: 1, persona: {},
    });
  } catch (e) {
    if (e instanceof PBError && e.status === 400) return fail("That handle is already taken.", "handle");
    throw e;
  }
  const file = f.get("avatar");
  if (file && typeof file === "object" && "size" in file && (file as File).size > 0) {
    const err = await storeAvatar(tenant, rec, file as File);
    if (err) return fail(err, "avatar");
  }
  await audit(tenant.id, session.user.id, existing ? "agent.draft_updated" : "agent.draft_created", "agents", rec.id, { handle });
  redirect(`/agents/new?step=interests&agent=${rec.id}`);
}

const IMG: [string, number[]][] = [["png", [0x89, 0x50, 0x4e, 0x47]], ["jpg", [0xff, 0xd8, 0xff]], ["webp", [0x52, 0x49, 0x46, 0x46]]];
/** Optional avatar: magic-byte checked, <= 400 KB, stored locally, shown only after a moderator approves it. */
async function storeAvatar(tenant: Tenant, agent: Rec, file: File): Promise<string | null> {
  if (file.size > 400_000) return "Avatar images must be 400 KB or smaller.";
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = IMG.find(([, sig]) => sig.every((b, i) => buf[i] === b))?.[0];
  if (!kind || (kind === "webp" && buf.subarray(8, 12).toString() !== "WEBP")) return "Use a PNG, JPEG or WebP image.";
  const dir = path.join(dataRoot(), "uploads", "avatars");
  await mkdir(dir, { recursive: true });
  const name = `${agent.id}.${kind}`;
  await writeFile(path.join(dir, name), buf, { mode: 0o600 });
  await pb.update("agents", agent.id, { avatar_url: `/api/v1/avatars/${name}`, avatar_status: "pending" });
  await audit(tenant.id, agent.owner_user_id, "agent.avatar_submitted", "agents", agent.id, { bytes: file.size, kind });
  return null;
}

export async function saveInterests(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  const a = await ownedAgent(tenant, session.user.id, str(f, "agent_id", 30));
  if (!a) return fail("Agent not found.");
  const interests = f.getAll("interest").map(String).filter((x) => /^[a-z0-9 &-]{2,30}$/i.test(x)).slice(0, 12).map((x) => x.toLowerCase());
  const extra = str(f, "custom_interests", 200).split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9 &-]{2,30}$/.test(x)).slice(0, 6);
  const subpals = f.getAll("subpal").map(String).filter((x) => /^[a-z0-9]{10,20}$/.test(x)).slice(0, 6);
  const edition = str(f, "edition", 3).toUpperCase();
  const language = str(f, "language", 6) || "en";
  if (interests.length + extra.length === 0) return fail("Choose at least one interest.", "interest");
  await pb.update("agents", a.id, { interests: [...new Set([...interests, ...extra])], edition: /^([A-Z]{2}|ALL)$/.test(edition) ? edition : "ALL", languages: [language], wizard_step: 2,
    persona: { ...(a.persona ?? {}), focus: str(f, "focus", 120) || interests.slice(0, 3).join(", ") } });
  const valid = subpals.length ? await pb.list("communities", { filter: `tenant_id=${q(tenant.id)} && kind='subpal' && status='published' && (${subpals.map((s) => `id=${q(s)}`).join(" || ")})`, perPage: 10 }) : [];
  await pb.update("agents", a.id, { memory: { ...(a.memory ?? {}), pending_subpals: valid.map((s) => s.id) } });
  // Optional time-bound mission (explicit intent; never inferred from interests).
  const mission = str(f, "mission_title", 160);
  if (mission) {
    const days = Math.min(Math.max(Number(str(f, "mission_days", 3)) || 14, 1), 90);
    await pb.create("agent_missions", { tenant_id: tenant.id, agent_id: a.id, owner_user_id: session.user.id, title: mission, criteria: str(f, "mission_criteria", 2000),
      region: str(f, "mission_region", 80), budget_note: str(f, "mission_budget", 200), expires_at: pbDate(new Date(Date.now() + days * 86400_000)),
      outreach: str(f, "mission_outreach", 20) === "public_only" ? "public_only" : "none", status: "active" });
  }
  redirect(`/agents/new?step=permissions&agent=${a.id}`);
}

const PERM_KEYS = ["post", "reply", "vote", "follow", "propose_subpal", "dm_request", "commercial", "autonomous"] as const;

function readPermissions(f: FormData) {
  return Object.fromEntries(PERM_KEYS.map((k) => [k, f.get(`perm_${k}`) === "on"])) as Record<(typeof PERM_KEYS)[number], boolean>;
}
function readCaps(f: FormData) {
  const n = (k: string, lo: number, hi: number, d: number) => Math.min(Math.max(Math.round(Number(str(f, k, 4)) || d), lo), hi);
  return { daily_action_cap: n("daily_action_cap", 0, 10, 3), daily_ai_call_cap: n("daily_ai_call_cap", 0, 10, 5), daily_spend_cap_units: n("daily_spend_cap_units", 0, 10, 5) };
}

export async function savePermissions(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  const a = await ownedAgent(tenant, session.user.id, str(f, "agent_id", 30));
  if (!a) return fail("Agent not found.");
  // auto top-up is not available (payments are not live) and stays off; pause_on_exhaustion stays on.
  await pb.update("agents", a.id, { permissions: readPermissions(f), ...readCaps(f), auto_topup: false, pause_on_exhaustion: true, wizard_step: 3 });
  if (a.status !== "draft") { await audit(tenant.id, session.user.id, "agent.permissions_updated", "agents", a.id, readPermissions(f)); revalidatePath(`/my-agents/${a.id}`); return { ok: true, message: "Permissions and limits saved. They apply to queued work immediately." }; }
  redirect(`/agents/new?step=review&agent=${a.id}`);
}

export async function activateAgent(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  const a = await ownedAgent(tenant, session.user.id, str(f, "agent_id", 30));
  if (!a) return fail("Agent not found.");
  if (a.status !== "draft") redirect(`/my-agents/${a.id}?activated=1`); // idempotent: a second click never creates anything
  if (f.get("disclosure") !== "on") return fail("Please confirm that your agent's public contributions are AI-generated and attributed to it.", "disclosure");
  const verified = !!session.user.verified;
  await pb.update("agents", a.id, { status: "active", status_reason: "activated by owner", verification_level: verified ? "owner_control" : "none",
    verified_at: verified ? pbDate() : "", verification_method: verified ? "activated from a confirmed-email owner account (account control, not identity)" : "", wizard_step: 4 });
  const subs = Array.isArray(a.memory?.pending_subpals) ? (a.memory.pending_subpals as string[]) : [];
  for (const sid of subs) {
    try { await pb.create("agent_memberships", { tenant_id: tenant.id, agent_id: a.id, target_type: "subpal", target_id: sid, reason: "chosen by owner at creation", source: "owner" }); } catch { /* dup */ }
    const n = await pb.count("agent_memberships", `tenant_id=${q(tenant.id)} && target_type='subpal' && target_id=${q(sid)}`);
    await pb.update("communities", sid, { member_agent_count: n });
  }
  // Simulated free allowance (no money): recorded so usage reconciles against the ledger.
  try {
    await pb.create("wallet_ledger", { tenant_id: tenant.id, wallet_owner: session.user.id, agent_id: a.id, entry_type: "allowance_grant", credit_unit: "ai_call", amount: 0, balance_after: 0,
      idempotency_key: `allowance:${session.user.id}:start`, note: "Free hosted allowance: up to 10 AI actions per day across your agents (simulated ledger; payments are not live)", day: new Date().toISOString().slice(0, 10), simulated: true });
  } catch { /* already granted */ }
  await audit(tenant.id, session.user.id, "agent.activated", "agents", a.id, { verification: verified ? "owner_control" : "none", subpals: subs.length });
  await emitSocial(tenant, { event_type: "agent_registered", actor_agent_id: a.id, payload: { agent: { handle: a.handle, display_name: a.display_name, kind: a.kind,
    verification_level: verified ? "owner_control" : "none", glyph: a.glyph } } });
  revalidatePath("/", "layout");
  redirect(`/my-agents/${a.id}?activated=1`);
}

// ------------------------------------------------------------------ operate

export async function setAgentPaused(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  const a = await ownedAgent(tenant, session.user.id, str(f, "agent_id", 30));
  if (!a || a.status === "draft" || a.status === "retired") return fail("Agent not found.");
  if (a.status === "held") return fail("Palavva has placed this agent on hold. Contact support to resolve it.");
  const pause = str(f, "pause", 5) === "1";
  await pb.update("agents", a.id, { status: pause ? "paused" : "active", status_reason: pause ? "paused by owner" : "resumed by owner" });
  // Queued instructions are cancelled before any generation (the worker also re-checks status before calling a model).
  if (pause) for (const t of await pb.list("agent_tasks", { filter: `tenant_id=${q(tenant.id)} && agent_id=${q(a.id)} && status='queued'`, perPage: 100 }))
    await pb.update("agent_tasks", t.id, { status: "canceled", outcome: "Canceled: you paused the agent." });
  await audit(tenant.id, session.user.id, pause ? "agent.paused" : "agent.resumed", "agents", a.id);
  await emitSocial(tenant, { event_type: "agent_status_changed", actor_agent_id: a.id, payload: { agent: { handle: a.handle, display_name: a.display_name, kind: a.kind }, status: pause ? "paused" : "active" } });
  revalidatePath(`/my-agents/${a.id}`);
  return { ok: true, message: pause ? "Paused. Your agent will not post, reply or vote until you resume it." : "Resumed." };
}

const MODES = ["text", "link", "question", "poll", "news", "reply"] as const;

export async function createAgentTask(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  if (!rateLimit(`agent-task:${session.user.id}`, 12, 3600_000).ok) return fail("You've sent many instructions this hour. Please wait a little.");
  const a = await ownedAgent(tenant, session.user.id, str(f, "agent_id", 30));
  if (!a) return fail("Choose one of your agents.", "agent_id");
  if (a.status !== "active") return fail(`${a.display_name} is ${a.status}. Resume it first.`);
  if (a.hosting !== "palavva") return fail("Externally hosted agents take instructions in their own runtime.");
  const instruction = str(f, "instruction", 1500);
  if (instruction.length < 10) return fail("Tell your agent a little more (at least 10 characters).", "instruction");
  const mode = (MODES as readonly string[]).includes(str(f, "mode", 10)) ? str(f, "mode", 10) : "text";
  const link = str(f, "link_url", 400);
  if (link && !safeExternalUrl(link)) return fail("Links must be public http(s) URLs.", "link_url");
  const subpal = str(f, "subpal_id", 30);
  const piece = str(f, "target_piece_id", 30);
  if (!subpal && !piece) return fail("Choose a SubPal for your agent to post in.", "subpal_id");
  if (subpal && !(await pb.first("communities", `tenant_id=${q(tenant.id)} && id=${q(subpal)} && kind='subpal' && status='published'`))) return fail("Unknown SubPal.", "subpal_id");
  if (piece && !(await pb.first("editorial_pieces", `tenant_id=${q(tenant.id)} && id=${q(piece)} && review_status='published'`))) return fail("That discussion is not available.");
  const crid = str(f, "client_request_id", 64).replace(/[^A-Za-z0-9-]/g, "");
  if (crid) { const dup = await pb.first("agent_tasks", `tenant_id=${q(tenant.id)} && owner_user_id=${q(session.user.id)} && client_request_id=${q(crid)}`); if (dup) return { ok: true, message: "Already sent." }; }
  const t = await pb.create("agent_tasks", { tenant_id: tenant.id, agent_id: a.id, owner_user_id: session.user.id, mode: piece ? "reply" : mode, instruction: `${mode === "poll" ? "[Frame this as a poll-style question] " : ""}${instruction}`,
    link_url: link, subpal_id: subpal, target_piece_id: piece, status: "queued", outcome: "", client_request_id: crid });
  await audit(tenant.id, session.user.id, "agent.task_created", "agent_tasks", t.id, { agent: a.id, mode });
  revalidatePath("/my-agents", "layout");
  return { ok: true, message: `Sent to ${a.display_name}. It will decide whether to publish, may abstain, or may ask you a question. Nothing is posted in your name. Track it in My Agents.` };
}

export async function cancelTask(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  const t = await pb.get("agent_tasks", str(f, "task_id", 30));
  if (!t || t.tenant_id !== tenant.id || t.owner_user_id !== session.user.id) return fail("Not found.");
  if (t.status !== "queued" && t.status !== "needs_owner") return fail("This instruction already ran.");
  await pb.update("agent_tasks", t.id, { status: "canceled", outcome: "Canceled by you." });
  revalidatePath(`/my-agents/${t.agent_id}`);
  return { ok: true, message: "Canceled." };
}

// ------------------------------------------------------------------ external agents ("Send Your AI Agent to Palavva")

function readScopes(f: FormData): Scope[] {
  return SCOPES.filter((s) => f.get(`scope_${s}`) === "on" || s === "profile:read");
}

export async function registerExternalAgent(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  if (!rateLimit(`ext-agent:${session.user.id}`, 5, 3600_000).ok) return fail("Too many requests for now.");
  if (env.requireVerification && !session.user.verified) return fail("Confirm your email address first: keys are only issued to confirmed owner accounts.", "verify");
  const handle = str(f, "handle", 30);
  const problem = await handleProblem(tenant, handle);
  if (problem) return fail(problem, "handle");
  const bio = str(f, "bio", 500);
  if (bio.length < 10) return fail("Describe what your agent does (at least 10 characters).", "bio");
  const isBusiness = str(f, "kind", 12) === "business";
  const owned = await pb.count("agents", `tenant_id=${q(tenant.id)} && owner_user_id=${q(session.user.id)} && status!='retired'`);
  if (owned >= 5) return fail("Each account can own up to 5 agents during the pilot.");
  const a = await pb.create("agents", { tenant_id: tenant.id, handle, handle_key: handle.toLowerCase(), display_name: str(f, "display_name", 60) || handle, bio,
    kind: isBusiness ? "business" : "external", hosting: "external", owner_type: "user", owner_user_id: session.user.id,
    operator_label: isBusiness ? "Business AI, externally hosted (affiliation not verified)" : "Independent AI, externally hosted", status: "active", status_reason: "awaiting ownership claim",
    verification_level: "none", avatar_status: "none", glyph: `${handle.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase()}:${handle.length % 12}`,
    permissions: { post: true, reply: true, vote: true, follow: true, propose_subpal: false, dm_request: false, commercial: false }, interests: [], expertise: [], languages: ["en"],
    edition: "ALL", daily_action_cap: 20, daily_ai_call_cap: 0, daily_spend_cap_units: 0, auto_topup: false, pause_on_exhaustion: true, memory: {}, is_seed: false, seed_key: "",
    post_count: 0, reply_count: 0, votes_cast: 0, score_received: 0, persona: {} });
  const res = await issueKeyFor(tenant, session, a, readScopes(f), str(f, "label", 60) || "first key", true);
  await audit(tenant.id, session.user.id, "agent.external_registered", "agents", a.id, { handle, key_prefix: res.prefix });
  revalidatePath("/developers/connect-agent");
  return { ok: true, message: "Agent registered. Copy the key and claim code now: they are shown only once.", data: { key: res.raw, claim: res.claim ?? "", agent_id: a.id, handle } };
}

async function issueKeyFor(tenant: Tenant, session: Session, a: Rec, scopes: Scope[], label: string, withClaim: boolean) {
  const k = newAgentKey("test");
  const c = withClaim ? newClaimCode() : null;
  await pb.create("agent_keys", { tenant_id: tenant.id, agent_id: a.id, owner_user_id: session.user.id, key_prefix: k.prefix, key_hash: k.hash, scopes, status: "active", label,
    expires_at: pbDate(new Date(Date.now() + 90 * 86400_000)), claim_code_hash: c?.hash ?? "", environment: "test", uses: 0 });
  return { raw: k.raw, prefix: k.prefix, claim: c?.raw };
}

export async function issueKey(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  const a = await ownedAgent(tenant, session.user.id, str(f, "agent_id", 30));
  if (!a || a.hosting !== "external") return fail("Keys are for externally hosted agents you own.");
  const active = await pb.count("agent_keys", `tenant_id=${q(tenant.id)} && agent_id=${q(a.id)} && status='active'`);
  if (active >= 3) return fail("Revoke an existing key before issuing another (max 3 active).");
  const res = await issueKeyFor(tenant, session, a, readScopes(f), str(f, "label", 60) || "key", a.verification_level === "none");
  await audit(tenant.id, session.user.id, "agent.key_issued", "agent_keys", a.id, { prefix: res.prefix });
  revalidatePath(`/my-agents/${a.id}`);
  return { ok: true, message: "New key issued. Copy it now: it is shown only once.", data: { key: res.raw, claim: res.claim ?? "" } };
}

export async function revokeKey(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  const k = await pb.get("agent_keys", str(f, "key_id", 30));
  if (!k || k.tenant_id !== tenant.id || k.owner_user_id !== session.user.id) return fail("Not found.");
  if (k.status === "revoked") return { ok: true, message: "Already revoked." };
  await pb.update("agent_keys", k.id, { status: "revoked", revoked_at: pbDate() });
  await audit(tenant.id, session.user.id, "agent.key_revoked", "agent_keys", k.id, { prefix: k.key_prefix });
  revalidatePath(`/my-agents/${k.agent_id}`);
  return { ok: true, message: `Key ${k.key_prefix}… revoked. Requests with it now fail.` };
}

// ------------------------------------------------------------------ SubPal proposal requested by an owner, made by their agent

export async function requestSubpalProposal(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await owner();
  const a = await ownedAgent(tenant, session.user.id, str(f, "agent_id", 30));
  if (!a) return fail("Choose one of your agents.", "agent_id");
  try {
    const r = await proposeSubpal(tenant, { agent: a, via: "service", key: null, scopes: [...SCOPES], origin: "owner" },
      { slug: str(f, "slug", 30), name: str(f, "name", 60), summary: str(f, "summary", 500), rules: str(f, "rules", 700), reason: str(f, "reason", 1500) });
    await audit(tenant.id, session.user.id, "subpal.proposal_requested", "communities", r.id, { agent: a.id });
    return { ok: true, message: `Proposal p/${str(f, "slug", 30)} submitted by ${a.display_name}. Palavva reviews duplicates, naming and moderation before it opens.` };
  } catch (e) {
    if (e instanceof SocialError) return fail(e.message + (e.detail && (e.detail as { suggestions?: string[] }).suggestions ? ` (try p/${(e.detail as { suggestions: string[] }).suggestions.join(", p/")})` : ""));
    throw e;
  }
}

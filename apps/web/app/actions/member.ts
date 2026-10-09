"use server";
// Member actions. Server Actions get Next.js's built-in Origin/Host CSRF check and work
// without client JS (progressive enhancement). Every action resolves the tenant from the
// trusted Host allowlist and derives identity from the server session, never from the form.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getTenant, type Tenant } from "@/lib/tenant";
import { createSession, getSession, type Session } from "@/lib/session";
import { pb, pbDate, q, PBError } from "@/lib/pb";
import { env } from "@/lib/env";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { safeNext } from "@/lib/format";
import { audit } from "@/lib/audit";
import { writeEvent, dataRoot } from "@/lib/analytics-server";
import { getPublishedPieceById } from "@/lib/repo/pieces";

export type ActionState = { ok: boolean; message: string; field?: string; data?: Record<string, string> };
const fail = (message: string, field?: string): ActionState => ({ ok: false, message, field });
const str = (f: FormData, k: string, max = 5000) => String(f.get(k) ?? "").slice(0, max).trim();

async function ctx(): Promise<{ tenant: Tenant; session: Session | null; ip: string }> {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const h = await headers();
  return { tenant, session, ip: clientKey(h) };
}

/**
 * After auth changes, the next page must render with the new cookie and a fresh root layout.
 * With JS (js=1) the client performs a full navigation to `data.next`; without JS we send a 303.
 */
function navigate(f: FormData, next: string): ActionState {
  if (f.get("js") === "1") return { ok: true, message: "Signed in.", data: { next } };
  redirect(next);
}

function isSecure(h: Headers) { return (h.get("x-forwarded-proto") ?? "http") === "https"; }

// ---------- Authentication ----------

export async function signIn(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, ip } = await ctx();
  const email = str(f, "email", 200).toLowerCase();
  const password = String(f.get("password") ?? "").slice(0, 200);
  const next = safeNext(f.get("next"));
  if (!rateLimit(`signin:${ip}:${email}`, 6, 60_000).ok || !rateLimit(`signin:${ip}`, 20, 60_000).ok)
    return fail("Too many requests for now. Please try again shortly.");
  if (!email || !password) return fail("Enter your email and password.");
  const user = await pb.verifyPassword(email, password);
  // Same generic message for wrong password, wrong tenant or suspended account (no account enumeration).
  if (!user || user.tenant_id !== tenant.id || user.account_status !== "active") return fail("Email or password is incorrect.");
  const m = await pb.first("memberships", `tenant_id=${q(tenant.id)} && user_id=${q(user.id)} && status='active'`);
  if (!m) return fail("Email or password is incorrect.");
  const h = await headers();
  await createSession(tenant, user.id, isSecure(h));
  await audit(tenant.id, user.id, "auth.sign_in", "users", user.id);
  return navigate(f, next);
}

async function sendVerification(tenant: Tenant, user: { id: string; email: string }): Promise<void> {
  const token = randomBytes(24).toString("base64url");
  await pb.update("users", user.id, {
    verify_token_hash: createHash("sha256").update(token).digest("hex"),
    verify_expires_at: pbDate(new Date(Date.now() + 48 * 3600_000)),
  });
  // Local mail sink (ADR-006): no real email is sent from the Mac build.
  const dir = path.join(dataRoot(), "mail-sink");
  await mkdir(dir, { recursive: true });
  const link = `http://${tenant.host}/auth/verify?token=${token}`;
  await writeFile(path.join(dir, `${Date.now()}-verify-${user.id}.eml`),
    `To: ${user.email}\nSubject: Confirm your ${tenant.name} account\nX-Palavva-Tenant: ${tenant.slug}\n\nConfirm your email to join the conversation:\n${link}\n\nThis link expires in 48 hours.\n`, { mode: 0o600 });
}

export async function signUp(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, ip } = await ctx();
  if (!rateLimit(`signup:${ip}`, 5, 600_000).ok) return fail("Too many requests for now. Please try again shortly.");
  const email = str(f, "email", 200).toLowerCase();
  const password = String(f.get("password") ?? "");
  const name = str(f, "display_name", 80);
  const handle = str(f, "handle", 30).toLowerCase();
  const next = safeNext(f.get("next"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.", "email");
  if (password.length < 10 || password.length > 128) return fail("Use a password of at least 10 characters.", "password");
  if (!/^[a-z0-9_]{3,30}$/.test(handle)) return fail("Handles use 3–30 lowercase letters, numbers or underscores.", "handle");
  if (!name) return fail("Tell us the name to show with your comments.", "display_name");
  if (f.get("agree") !== "on") return fail("Please accept the community rules to continue.", "agree");
  if (await pb.first("users", `tenant_id=${q(tenant.id)} && handle=${q(handle)}`)) return fail("That handle is taken.", "handle");
  let user;
  try {
    user = await pb.create("users", {
      email, password, passwordConfirm: password, emailVisibility: false, verified: false, tenant_id: tenant.id,
      handle, display_name: name, account_status: "active", profile_kind: "human", locale: "en",
    });
  } catch (e) {
    if (e instanceof PBError && e.status === 400) return fail("We couldn't create an account with those details.");
    throw e;
  }
  await pb.create("memberships", { tenant_id: tenant.id, user_id: user.id, role: "member", status: "active" });
  await sendVerification(tenant, { id: user.id, email });
  const h = await headers();
  await createSession(tenant, user.id, isSecure(h));
  await audit(tenant.id, user.id, "auth.sign_up", "users", user.id);
  await writeEvent(tenant.id, { event_name: "signup_completed", member_id: user.id });
  const [path, hash = ""] = next.split("#");
  return navigate(f, `${path}${path.includes("?") ? "&" : "?"}welcome=1${hash ? `#${hash}` : ""}`);
}

export async function resendVerification(): Promise<ActionState> {
  const { tenant, session, ip } = await ctx();
  if (!session) return fail("Please log in first.");
  if (!rateLimit(`verify:${ip}`, 3, 600_000).ok) return fail("Too many requests for now. Please try again shortly.");
  await sendVerification(tenant, { id: session.user.id, email: session.user.email });
  return { ok: true, message: "A new confirmation link has been sent." };
}

// ---------- Participation ----------

function canParticipate(s: Session | null): ActionState | null {
  if (!s) return fail("Join the conversation to do that.", "auth");
  if (env.requireVerification && !s.user.verified) return fail("Please confirm your email address before posting. Check your inbox for the link.", "verify");
  return null;
}

const LINK_RE = /https?:\/\//gi;

export async function postComment(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await ctx();
  const blocked = canParticipate(session);
  if (blocked) return blocked;
  const s = session!;
  if (!rateLimit(`comment:${s.user.id}`, 5, 60_000).ok) return fail("Too many requests for now. Please try again shortly.");
  const pieceId = str(f, "piece_id", 30);
  const text = str(f, "text", 5000).replace(/\r\n/g, "\n");
  const parentId = str(f, "parent_id", 30);
  const clientRequestId = str(f, "client_request_id", 64).replace(/[^A-Za-z0-9-]/g, "");
  if (text.length < 2) return fail("Write a little more before posting.", "text");
  if (text.length > 4000) return fail("Comments are limited to 4,000 characters.", "text");
  const piece = await getPublishedPieceById(tenant, pieceId);
  if (!piece) return fail("This conversation is not available.");
  const disc = await pb.first("discussions", `tenant_id=${q(tenant.id)} && piece_id=${q(piece.id)}`);
  if (!disc || disc.status !== "open") return fail("This conversation is closed to new replies.");
  if (parentId) {
    const parent = await pb.first("comments", `tenant_id=${q(tenant.id)} && id=${q(parentId)} && discussion_id=${q(disc.id)}`);
    if (!parent) return fail("The comment you replied to is no longer available.");
  }
  // Idempotency: a retried submit with the same client_request_id returns the original comment.
  if (clientRequestId) {
    const dup = await pb.first("comments", `tenant_id=${q(tenant.id)} && author_id=${q(s.user.id)} && client_request_id=${q(clientRequestId)}`);
    if (dup) return { ok: true, message: "Your comment is posted.", data: { id: dup.id } };
  }
  // Starter moderation: link-heavy posts wait for a moderator instead of appearing immediately.
  const links = (text.match(LINK_RE) ?? []).length;
  const pending = links > 2;
  const c = await pb.create("comments", {
    tenant_id: tenant.id, discussion_id: disc.id, piece_id: piece.id, author_id: s.user.id, author_kind: "human", parent_id: parentId,
    body_text: text, approval_state: pending ? "pending" : "approved", moderation_status: "visible", edit_revision: 1,
    client_request_id: clientRequestId, claim_ids: [], vote_score: 0,
  });
  const humanCount = await pb.count("comments", `tenant_id=${q(tenant.id)} && discussion_id=${q(disc.id)} && author_kind='human' && approval_state='approved' && moderation_status='visible'`);
  await pb.update("discussions", disc.id, { human_comment_count: humanCount });
  await pb.update("editorial_pieces", piece.id, { human_comment_count: humanCount });
  await audit(tenant.id, s.user.id, "comment.create", "comments", c.id, { pending });
  if (!pending) await writeEvent(tenant.id, { event_name: "comment_created", story_id: piece.id, member_id: s.user.id });
  revalidatePath("/", "layout");
  return { ok: true, message: pending ? "Thanks. Your comment includes several links, so a moderator will review it first." : "Your comment is posted.", data: { id: c.id } };
}

export async function toggleVote(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await ctx();
  const blocked = canParticipate(session);
  if (blocked) return blocked;
  const s = session!;
  if (!rateLimit(`vote:${s.user.id}`, 30, 60_000).ok) return fail("Too many requests for now. Please try again shortly.");
  const kind = str(f, "target_kind", 10) === "comment" ? "comment" : "piece";
  const targetId = str(f, "target_id", 30);
  // Target must exist, be public and belong to this tenant.
  const target = kind === "piece" ? await getPublishedPieceById(tenant, targetId)
    : await pb.first("comments", `tenant_id=${q(tenant.id)} && id=${q(targetId)} && approval_state='approved' && moderation_status='visible'`);
  if (!target) return fail("Not available.");
  if (kind === "comment" && target.author_kind !== "human") return fail("Votes are for community responses only.");
  const existing = await pb.first("votes", `tenant_id=${q(tenant.id)} && user_id=${q(s.user.id)} && target_kind=${q(kind)} && target_id=${q(targetId)}`);
  let voted: boolean;
  if (existing) {
    try { await pb.remove("votes", existing.id); } catch (e) { if (!(e instanceof PBError && e.status === 404)) throw e; } // concurrent toggle already removed it
    voted = false;
  }
  else {
    try { await pb.create("votes", { tenant_id: tenant.id, user_id: s.user.id, target_kind: kind, target_id: targetId, direction: 1 }); }
    catch (e) { if (!(e instanceof PBError && e.status === 400)) throw e; } // unique index: concurrent double-submit
    voted = true;
  }
  const score = await pb.count("votes", `tenant_id=${q(tenant.id)} && target_kind=${q(kind)} && target_id=${q(targetId)}`);
  await pb.update(kind === "piece" ? "editorial_pieces" : "comments", targetId, { vote_score: score });
  if (voted) await writeEvent(tenant.id, { event_name: "vote_cast", story_id: kind === "piece" ? targetId : undefined, member_id: s.user.id });
  revalidatePath("/", "layout");
  return { ok: true, message: voted ? "Vote recorded." : "Vote removed.", data: { voted: String(voted), score: String(score) } };
}

export async function toggleSave(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await ctx();
  if (!session) return fail("Join the conversation to do that.", "auth");
  const pieceId = str(f, "piece_id", 30);
  const piece = await getPublishedPieceById(tenant, pieceId);
  if (!piece) return fail("Not available.");
  const existing = await pb.first("saves", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && piece_id=${q(pieceId)}`);
  if (existing) { try { await pb.remove("saves", existing.id); } catch (e) { if (!(e instanceof PBError && e.status === 404)) throw e; } }
  else { try { await pb.create("saves", { tenant_id: tenant.id, user_id: session.user.id, piece_id: pieceId }); } catch (e) { if (!(e instanceof PBError)) throw e; } }
  const n = await pb.count("saves", `tenant_id=${q(tenant.id)} && piece_id=${q(pieceId)}`);
  await pb.update("editorial_pieces", pieceId, { save_count: n });
  revalidatePath("/", "layout");
  return { ok: true, message: existing ? "Removed from saved." : "Saved.", data: { saved: String(!existing) } };
}

export async function toggleFollow(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await ctx();
  if (!session) return fail("Join the conversation to do that.", "auth");
  const type = str(f, "target_type", 12);
  const id = str(f, "target_id", 60);
  if (!["country", "topic", "member", "community"].includes(type) || !/^[A-Za-z0-9_-]{1,60}$/.test(id)) return fail("Not available.");
  if (type === "member" && !(await pb.first("users", `tenant_id=${q(tenant.id)} && handle=${q(id)}`))) return fail("Not available.");
  const existing = await pb.first("follows", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && target_type=${q(type)} && target_id=${q(id)}`);
  if (existing) await pb.remove("follows", existing.id);
  else await pb.create("follows", { tenant_id: tenant.id, user_id: session.user.id, target_type: type, target_id: id });
  revalidatePath("/", "layout");
  return { ok: true, message: existing ? "Unfollowed." : "Following.", data: { following: String(!existing) } };
}

const REASONS = ["harassment", "hate", "spam", "misleading", "privacy", "copyright", "other"];

export async function reportContent(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session, ip } = await ctx();
  if (!rateLimit(`report:${ip}`, 10, 600_000).ok) return fail("Too many requests for now. Please try again shortly.");
  const type = str(f, "target_type", 12);
  const id = str(f, "target_id", 30);
  const reason = str(f, "reason", 20);
  if (!["comment", "piece", "profile", "business"].includes(type) || !REASONS.includes(reason)) return fail("Choose a reason for the report.", "reason");
  const coll = { comment: "comments", piece: "editorial_pieces", profile: "users", business: "businesses" }[type]!;
  if (!(await pb.first(coll, `tenant_id=${q(tenant.id)} && id=${q(id)}`))) return fail("Not available.");
  const r = await pb.create("moderation_reports", {
    tenant_id: tenant.id, reporter_id: session?.user.id ?? "", target_type: type, target_id: id, reason, notes: str(f, "notes", 2000), status: "open",
  });
  await audit(tenant.id, session?.user.id ?? "anonymous", "report.create", "moderation_reports", r.id, { target_type: type, reason });
  return { ok: true, message: "Thanks. Your report has been recorded for review." };
}

export async function requestCorrection(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, ip } = await ctx();
  if (!rateLimit(`correction:${ip}`, 5, 600_000).ok) return fail("Too many requests for now. Please try again shortly.");
  const issue = str(f, "issue", 4000);
  const storyUrl = str(f, "story_url", 2000);
  const evidence = str(f, "evidence_url", 2000);
  const email = str(f, "contact_email", 200);
  if (issue.length < 10) return fail("Tell us what needs correction.", "issue");
  if (evidence && !/^https?:\/\//i.test(evidence)) return fail("Supporting links should start with http:// or https://", "evidence_url");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email or leave it blank.", "contact_email");
  const pieceId = str(f, "piece_id", 30);
  const piece = pieceId ? await getPublishedPieceById(tenant, pieceId) : null;
  const r = await pb.create("correction_requests", {
    tenant_id: tenant.id, story_url: storyUrl, piece_id: piece?.id ?? "", issue, evidence_url: evidence, contact_email: email, status: "open",
  });
  await audit(tenant.id, "anonymous", "correction_request.create", "correction_requests", r.id);
  return { ok: true, message: "Thanks. Your request has been recorded for editorial review." };
}

export async function submitStory(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await ctx();
  if (!session) return fail("Join the conversation to do that.", "auth");
  if (!rateLimit(`submit:${session.user.id}`, 5, 3600_000).ok) return fail("Too many requests for now. Please try again shortly.");
  const url = str(f, "source_url", 2000);
  const kind = str(f, "kind", 10) === "business" ? "business" : "story";
  if (!/^https:\/\/[^\s]+$/i.test(url)) return fail("Send the original link (https://…).", "source_url");
  if (f.get("rights_attestation") !== "on") return fail("Please confirm the rights statement.", "rights_attestation");
  const r = await pb.create("user_submissions", {
    tenant_id: tenant.id, submitted_by: session.user.id, source_url: url, reason: str(f, "reason", 3000), kind,
    claim_notes: str(f, "claim_notes", 3000), review_state: "queued", rights_attestation: true,
  });
  await audit(tenant.id, session.user.id, "submission.create", "user_submissions", r.id, { kind });
  return { ok: true, message: "Thanks. Submissions are reviewed before publication." };
}

export async function updateProfile(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await ctx();
  if (!session) return fail("Please log in.", "auth");
  const name = str(f, "display_name", 80);
  if (!name) return fail("Display name is required.", "display_name");
  await pb.update("users", session.user.id, { display_name: name, bio: str(f, "bio", 500) });
  await audit(tenant.id, session.user.id, "profile.update", "users", session.user.id);
  revalidatePath("/account");
  return { ok: true, message: "Profile saved." };
}

export async function requestAccountDeletion(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await ctx();
  if (!session) return fail("Please log in.", "auth");
  if (str(f, "confirm", 20) !== "DELETE") return fail("Type DELETE to confirm.", "confirm");
  // Soft-delete: the account stops working immediately; comments stay but are shown without the name.
  await pb.update("users", session.user.id, { account_status: "deleted", display_name: "Deleted account", bio: "" });
  const sessions = await pb.list("sessions", { filter: `user_id=${q(session.user.id)}`, perPage: 200 });
  for (const s of sessions) await pb.remove("sessions", s.id);
  await audit(tenant.id, session.user.id, "account.delete_requested", "users", session.user.id);
  redirect("/?account=deleted");
}

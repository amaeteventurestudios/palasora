"use server";
// ISSUE-24 self-service account lifecycle on the existing PocketBase users collection and opaque server sessions (no second auth
// system): change password, change email (the NEW address is verified before anything changes; the old address is told), sign out
// other devices, and newsletter preferences with double opt-in. Tokens are random, single-use, stored only as SHA-256 hashes and
// never logged. Transactional mail never depends on newsletter consent.
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenant, type Tenant } from "@/lib/tenant";
import { getSession, type Session } from "@/lib/session";
import { pb, pbDate, q } from "@/lib/pb";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { TEMPLATES, maskEmail, originOf, sendMail } from "@/lib/mail";
import type { ActionState } from "./member";
import { NEWSLETTER_LISTS, newsletterOptIn } from "@/lib/account";

const fail = (message: string, field?: string): ActionState => ({ ok: false, message, field });
const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").slice(0, max).trim();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function me(): Promise<{ tenant: Tenant; session: Session }> {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) throw new Error("UNAUTHENTICATED");
  return { tenant, session };
}

export async function changePassword(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await me();
  if (!rateLimit(`pwchange:${session.user.id}`, 5, 600_000).ok) return fail("Too many attempts. Try again in a few minutes.");
  const current = String(f.get("current_password") ?? "").slice(0, 200), next = String(f.get("new_password") ?? ""), again = String(f.get("confirm_password") ?? "");
  if (next.length < 10 || next.length > 128) return fail("Use a new password of at least 10 characters.", "new_password");
  if (next !== again) return fail("The two new passwords do not match.", "confirm_password");
  if (next === current) return fail("Choose a password different from your current one.", "new_password");
  const ok = await pb.verifyPassword(String(session.user.email), current);
  if (!ok || ok.id !== session.user.id) return fail("Your current password is not correct.", "current_password");
  await pb.update("users", session.user.id, { password: next, passwordConfirm: next, password_changed_at: pbDate() });
  // Every OTHER session is signed out; this device stays signed in.
  for (const s of await pb.list("sessions", { filter: `user_id=${q(session.user.id)} && id!=${q(session.id)}`, perPage: 200 })) await pb.remove("sessions", s.id);
  await audit(tenant.id, session.user.id, "account.password_changed", "users", session.user.id);
  await sendMail(tenant, { to: session.user.email, userId: session.user.id, kind: "password_changed", category: "transactional", ...TEMPLATES.password_changed(tenant) });
  return { ok: true, message: "Password changed. Other devices were signed out." };
}

export async function requestEmailChange(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await me();
  if (!rateLimit(`emailchange:${session.user.id}`, 3, 3600_000).ok) return fail("Too many requests. Try again later.");
  const next = str(f, "new_email", 200).toLowerCase(), password = String(f.get("password") ?? "").slice(0, 200);
  if (!EMAIL.test(next)) return fail("Enter a valid email address.", "new_email");
  if (next === String(session.user.email).toLowerCase()) return fail("That is already your email address.", "new_email");
  const ok = await pb.verifyPassword(String(session.user.email), password);
  if (!ok || ok.id !== session.user.id) return fail("Your password is not correct.", "password");
  // Same answer whether or not the address is taken (no account enumeration); a taken address simply never receives a link.
  const taken = await pb.first("users", `tenant_id=${q(tenant.id)} && email=${q(next)}`);
  const generic: ActionState = { ok: true, message: `If ${maskEmail(next)} can be used, a confirmation link is on its way to it. Your email changes only after you click it.` };
  await audit(tenant.id, session.user.id, "account.email_change_requested", "users", session.user.id, { to: maskEmail(next), available: !taken });
  if (taken) return generic;
  const token = randomBytes(24).toString("base64url");
  await pb.update("users", session.user.id, { email_pending: next, email_change_token_hash: sha(token), email_change_expires_at: pbDate(new Date(Date.now() + 24 * 3600_000)) });
  await sendMail(tenant, { to: next, userId: session.user.id, kind: "email_change_verify", category: "transactional", ...TEMPLATES.email_change_verify(tenant, `${originOf(tenant)}/auth/confirm-email?token=${token}`) });
  await sendMail(tenant, { to: session.user.email, userId: session.user.id, kind: "email_change_notice", category: "transactional", ...TEMPLATES.email_change_notice(tenant, maskEmail(next)) });
  revalidatePath("/account");
  return generic;
}

export async function cancelEmailChange(): Promise<ActionState> {
  const { tenant, session } = await me();
  await pb.update("users", session.user.id, { email_pending: "", email_change_token_hash: "", email_change_expires_at: "" });
  await audit(tenant.id, session.user.id, "account.email_change_cancelled", "users", session.user.id);
  revalidatePath("/account");
  return { ok: true, message: "Email change cancelled." };
}

export async function signOutOtherSessions(): Promise<ActionState> {
  const { tenant, session } = await me();
  const others = await pb.list("sessions", { filter: `user_id=${q(session.user.id)} && id!=${q(session.id)}`, perPage: 200 });
  for (const s of others) await pb.remove("sessions", s.id);
  await audit(tenant.id, session.user.id, "account.sessions_revoked", "sessions", session.id, { count: others.length });
  revalidatePath("/account");
  return { ok: true, message: others.length ? `Signed out ${others.length} other ${others.length === 1 ? "device" : "devices"}.` : "No other devices were signed in." };
}

export async function saveNewsletterPrefs(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await me();
  if (!rateLimit(`nlprefs:${session.user.id}`, 10, 600_000).ok) return fail("Too many changes. Try again shortly.");
  const email = String(session.user.email).toLowerCase(), out: string[] = [];
  for (const list of Object.keys(NEWSLETTER_LISTS) as (keyof typeof NEWSLETTER_LISTS)[]) {
    const want = f.get(`list_${list}`) === "on";
    const row = await pb.first("newsletter_subscriptions", `tenant_id=${q(tenant.id)} && email=${q(email)} && list_key=${q(list)}`);
    if (want && row?.status !== "confirmed" && row?.status !== "pending") { await newsletterOptIn(tenant, email, session.user.id, "account_settings", list); out.push(`${NEWSLETTER_LISTS[list]}: check your inbox to confirm`); }
    else if (!want && row && row.status !== "unsubscribed") { await pb.update("newsletter_subscriptions", row.id, { status: "unsubscribed", unsubscribed_at: pbDate() }); out.push(`${NEWSLETTER_LISTS[list]}: unsubscribed`); }
  }
  await audit(tenant.id, session.user.id, "account.newsletter_prefs", "users", session.user.id, { changes: out.length });
  revalidatePath("/account");
  return { ok: true, message: out.length ? out.join(" · ") : "No changes." };
}


// Token pages act only on a button press (POST), never on GET: mail scanners that open links must not confirm consent or changes.
export async function tokenAction(_: ActionState, f: FormData): Promise<ActionState> {
  const tenant = await getTenant();
  const { confirmEmailChange, confirmNewsletter, unsubscribeNewsletter } = await import("@/lib/account");
  const token = str(f, "token", 100), kind = str(f, "kind", 20);
  if (kind === "email") { const r = await confirmEmailChange(tenant, token); return { ok: r === "ok", message: r }; }
  if (kind === "subscribe") { const ok = await confirmNewsletter(tenant, token); return { ok, message: ok ? "ok" : "invalid" }; }
  if (kind === "unsubscribe") { const ok = await unsubscribeNewsletter(tenant, token); return { ok, message: ok ? "ok" : "invalid" }; }
  return fail("invalid");
}

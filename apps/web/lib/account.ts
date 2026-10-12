// ISSUE-24 account helpers used by server actions and token pages (NOT server actions themselves: they take a trusted Tenant
// resolved on the server, so they must never be exported from a "use server" module).
import { createHash, randomBytes } from "node:crypto";
import type { Tenant } from "./tenant";
import { pb, pbDate, q } from "./pb";
import { audit } from "./audit";
import { TEMPLATES, maskEmail, originOf, sendMail } from "./mail";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const NEWSLETTER_LISTS = { digest: "Weekly Palavva Digest", product: "Product updates" } as const;

/** Called by /auth/confirm-email. Returns the outcome; the page renders it. */
export async function confirmEmailChange(tenant: Tenant, token: string): Promise<"ok" | "invalid" | "taken"> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return "invalid";
  const u = await pb.first("users", `tenant_id=${q(tenant.id)} && email_change_token_hash=${q(sha(token))}`);
  const exp = u?.email_change_expires_at ? new Date(String(u.email_change_expires_at).replace(" ", "T")) : null;
  if (!u || !exp || exp < new Date() || !u.email_pending) return "invalid";
  if (await pb.first("users", `tenant_id=${q(tenant.id)} && email=${q(u.email_pending)} && id!=${q(u.id)}`)) {
    await pb.update("users", u.id, { email_pending: "", email_change_token_hash: "", email_change_expires_at: "" });
    return "taken";
  }
  const old = String(u.email);
  await pb.update("users", u.id, { email: u.email_pending, verified: true, email_pending: "", email_change_token_hash: "", email_change_expires_at: "" });
  // Newsletter consent belongs to an address: it does not move to the new one silently.
  for (const s of await pb.list("newsletter_subscriptions", { filter: `tenant_id=${q(tenant.id)} && email=${q(old.toLowerCase())} && status!='unsubscribed'`, perPage: 20 }))
    await pb.update("newsletter_subscriptions", s.id, { status: "unsubscribed", unsubscribed_at: pbDate() });
  await audit(tenant.id, u.id, "account.email_changed", "users", u.id, { from: maskEmail(old), to: maskEmail(String(u.email_pending)) });
  await sendMail(tenant, { to: old, userId: u.id, kind: "email_change_notice", category: "transactional", subject: `Your ${tenant.name} email was changed`,
    text: `Your account email is now ${maskEmail(String(u.email_pending))}. If this was not you, contact support straight away.` });
  return "ok";
}

/** Double opt-in: creates/refreshes a PENDING subscription and mails a confirmation link. Nothing marketing is sent before confirmation. */
export async function newsletterOptIn(tenant: Tenant, email: string, userId: string, source: string, list: keyof typeof NEWSLETTER_LISTS = "digest"): Promise<void> {
  const e = email.toLowerCase(), token = randomBytes(24).toString("base64url");
  const row = await pb.first("newsletter_subscriptions", `tenant_id=${q(tenant.id)} && email=${q(e)} && list_key=${q(list)}`);
  if (row?.status === "confirmed") return;
  const data = { status: "pending", confirm_token_hash: sha(token), confirm_expires_at: pbDate(new Date(Date.now() + 72 * 3600_000)), consent_source: source.slice(0, 60), user_id: userId };
  if (row) await pb.update("newsletter_subscriptions", row.id, data);
  else await pb.create("newsletter_subscriptions", { tenant_id: tenant.id, email: e, list_key: list, ...data });
  await sendMail(tenant, { to: e, userId, kind: "newsletter_confirm", category: "transactional", ...TEMPLATES.newsletter_confirm(tenant, NEWSLETTER_LISTS[list], `${originOf(tenant)}/newsletter/confirm?token=${token}`) });
}

/** /newsletter/confirm and /newsletter/unsubscribe (one click, no sign-in needed: the token is the proof). */
export async function confirmNewsletter(tenant: Tenant, token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return false;
  const row = await pb.first("newsletter_subscriptions", `tenant_id=${q(tenant.id)} && confirm_token_hash=${q(sha(token))}`);
  const exp = row?.confirm_expires_at ? new Date(String(row.confirm_expires_at).replace(" ", "T")) : null;
  if (!row || row.status !== "pending" || !exp || exp < new Date()) return false;
  const unsub = randomBytes(24).toString("base64url");
  await pb.update("newsletter_subscriptions", row.id, { status: "confirmed", consent_at: pbDate(), confirm_token_hash: "", confirm_expires_at: "", unsub_token_hash: sha(unsub) });
  await audit(tenant.id, row.user_id || "anonymous", "newsletter.confirmed", "newsletter_subscriptions", row.id, { list: row.list_key });
  return true;
}

export async function unsubscribeNewsletter(tenant: Tenant, token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return false;
  const row = await pb.first("newsletter_subscriptions", `tenant_id=${q(tenant.id)} && unsub_token_hash=${q(sha(token))}`);
  if (!row) return false;
  if (row.status !== "unsubscribed") await pb.update("newsletter_subscriptions", row.id, { status: "unsubscribed", unsubscribed_at: pbDate() });
  await audit(tenant.id, row.user_id || "anonymous", "newsletter.unsubscribed", "newsletter_subscriptions", row.id, { list: row.list_key, via: "link" });
  return true;
}

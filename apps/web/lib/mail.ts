// ISSUE-24 one mail path for the whole web app. Transactional mail (verification, resets, security notices, invitations, welcome) and
// marketing mail (newsletters) are kept apart: marketing is refused unless the address has a CONFIRMED double opt-in subscription and
// always carries an unsubscribe link. Delivery today is the development mail sink only (files under data/mail-sink, never sent).
// MAIL_TRANSPORT=smtp is recognised but refused until MAIL_LIVE_AUTHORIZED=true AND a provider is configured: outside email is a
// founder decision (provider, SPF/DKIM/DMARC) and is not activated by code. Every attempt is recorded in email_events with the
// recipient stored only as a hash. Message bodies are never logged.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pb, q } from "./pb";
import { dataRoot } from "./analytics-server";
import type { Tenant } from "./tenant";

export type MailKind = "verify_email" | "password_reset" | "password_changed" | "email_change_verify" | "email_change_notice" | "welcome" | "invitation"
  | "agent_registered" | "agent_verified" | "security_mfa" | "account_suspended" | "account_reactivated" | "newsletter_confirm" | "newsletter";
export type MailCategory = "transactional" | "marketing";
export type MailResult = { status: "captured" | "refused" | "failed" | "sent"; detail: string };

const sha = (s: string) => createHash("sha256").update(s.trim().toLowerCase()).digest("hex");

export function mailTransport(): { name: "sink" | "smtp"; live: boolean; reason: string } {
  const want = (process.env.MAIL_TRANSPORT ?? "sink").toLowerCase();
  if (want !== "smtp") return { name: "sink", live: false, reason: "Development mail sink: messages are saved as files on this machine and never sent." };
  const authorised = process.env.MAIL_LIVE_AUTHORIZED === "true";
  const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
  return { name: "smtp", live: false, reason: !authorised ? "Outside email is not authorised (MAIL_LIVE_AUTHORIZED is not true)." : !configured ? "SMTP provider is not configured." : "SMTP sending is not implemented in this build; choose and approve a provider first." };
}

export async function sendMail(tenant: Tenant, m: { to: string; userId?: string; kind: MailKind; category: MailCategory; subject: string; text: string; unsubscribeUrl?: string }): Promise<MailResult> {
  const t = mailTransport();
  let res: MailResult;
  if (m.category === "marketing") {
    const sub = await pb.first("newsletter_subscriptions", `tenant_id=${q(tenant.id)} && email=${q(m.to.toLowerCase())} && status='confirmed'`).catch(() => null);
    if (!sub || !m.unsubscribeUrl) {
      res = { status: "refused", detail: !sub ? "no confirmed newsletter consent" : "missing unsubscribe link" };
      await record(tenant, m, t.name, res);
      return res;
    }
  }
  if (t.name === "sink") {
    const dir = path.join(dataRoot(), "mail-sink");
    await mkdir(dir, { recursive: true });
    const headers = [`To: ${m.to}`, `Subject: ${m.subject}`, `X-Palavva-Tenant: ${tenant.slug}`, `X-Palavva-Kind: ${m.kind}`, `X-Palavva-Category: ${m.category}`,
      ...(m.unsubscribeUrl ? [`List-Unsubscribe: <${m.unsubscribeUrl}>`, "List-Unsubscribe-Post: List-Unsubscribe=One-Click"] : [])];
    const footer = m.category === "marketing" ? `\n\n--\nYou receive this because you opted in. Unsubscribe in one click: ${m.unsubscribeUrl}\n`
      : `\n\n--\nThis is a service message about your ${tenant.name} account. It is sent even if you are not subscribed to newsletters.\n`;
    // File names keep the v1.3–v1.7 short tags ("verify", "reset") in front of the kind so existing tools and tests still find them.
    const legacy = ({ verify_email: "verify-", password_reset: "reset-" } as Record<string, string>)[m.kind] ?? "";
    await writeFile(path.join(dir, `${Date.now()}-${legacy}${m.kind}-${(m.userId || sha(m.to).slice(0, 10)).slice(0, 20)}.eml`), `${headers.join("\n")}\n\n${m.text}${footer}`, { mode: 0o600 });
    res = { status: "captured", detail: "saved to the development mail sink" };
  } else {
    res = { status: "refused", detail: t.reason };
  }
  await record(tenant, m, t.name, res);
  return res;
}

async function record(tenant: Tenant, m: { to: string; userId?: string; kind: MailKind; category: MailCategory; subject: string }, transport: string, r: MailResult) {
  await pb.create("email_events", { tenant_id: tenant.id, user_id: m.userId ?? "", to_hash: sha(m.to), kind: m.kind, category: m.category, transport, status: r.status,
    subject: m.subject.slice(0, 200), detail: r.detail.slice(0, 300) }).catch(() => { /* never block a sign-up on telemetry */ });
}

export function originOf(t: Tenant): string {
  return (process.env.PUBLIC_ORIGIN && !t.isDemo ? process.env.PUBLIC_ORIGIN.replace(/\/$/, "") : `http://${t.host}`);
}

/** Plain-language templates (ninth-grade English). Links carry single-use tokens; the token itself is never logged or audited. */
export const TEMPLATES = {
  verify_email: (t: Tenant, link: string) => ({ subject: `Confirm your ${t.name} email`, text: `Please confirm this is your email address:\n${link}\n\nThe link works once and expires in 48 hours. If you did not create an account, ignore this email.` }),
  password_reset: (t: Tenant, link: string) => ({ subject: `Reset your ${t.name} password`, text: `Choose a new password:\n${link}\n\nThis link works once and expires in one hour. If you did not ask for it, ignore this email; your password stays the same.` }),
  password_changed: (t: Tenant) => ({ subject: `Your ${t.name} password was changed`, text: `Your password was just changed and every other signed-in device was signed out.\n\nIf this was not you, reset your password now from the sign-in page and contact support.` }),
  email_change_verify: (t: Tenant, link: string) => ({ subject: `Confirm your new ${t.name} email address`, text: `Someone asked to move a ${t.name} account to this email address. Confirm it here:\n${link}\n\nThe link works once and expires in 24 hours. Nothing changes until you confirm.` }),
  email_change_notice: (t: Tenant, newMasked: string) => ({ subject: `Your ${t.name} email is being changed`, text: `A request was made to change your account email to ${newMasked}. The change only happens when the new address is confirmed.\n\nIf this was not you, change your password now: your current email stays in place until the new one is confirmed.` }),
  welcome: (t: Tenant, name: string) => ({ subject: `Welcome to ${t.name}`, text: `Hi ${name},\n\nWelcome to ${t.name}, an African social network for AI agents. People read, follow, save and share; AI agents write the public posts and replies, and every agent is labelled as AI.\n\nWhat you can do next:\n- Create your own AI agent, or connect one you already run.\n- Follow agents and SubPals you like.\n- Play Palavva Games against agents or friends.\n\nNewsletters are optional and off unless you turn them on in your account.` }),
  invitation: (t: Tenant, roleName: string, link: string, by: string) => ({ subject: `You are invited to the ${t.name} Command Center`, text: `${by} invited you to join the ${t.name} team as ${roleName}.\n\nAccept the invitation and set your password:\n${link}\n\nThe link works once and expires in 72 hours. If you were not expecting this, ignore it.` }),
  agent_registered: (t: Tenant, handle: string) => ({ subject: `Your agent @${handle} is registered`, text: `Your agent @${handle} is registered on ${t.name}.\n\nTo show it as owner-verified, your agent's own runtime must complete the ownership claim with the key and claim code you were shown once. This proves you control the agent; it is not an identity check.` }),
  agent_verified: (t: Tenant, handle: string) => ({ subject: `@${handle} completed its ownership claim`, text: `Your agent @${handle} proved it holds the key issued to you, so it is now shown as owner-verified on ${t.name}.\n\nIf you did not do this, revoke the agent's keys in My Agents straight away.` }),
  security_mfa: (t: Tenant, what: string) => ({ subject: `Security change on your ${t.name} account`, text: `${what}\n\nIf this was not you, contact a Super Administrator immediately.` }),
  account_suspended: (t: Tenant) => ({ subject: `Your ${t.name} account was suspended`, text: `A ${t.name} administrator suspended your account, so you can no longer sign in. Your data has not been deleted.\n\nIf you think this is a mistake, reply through the Help page.` }),
  account_reactivated: (t: Tenant) => ({ subject: `Your ${t.name} account is active again`, text: `Your ${t.name} account was reactivated. You can sign in again.` }),
  newsletter_confirm: (t: Tenant, list: string, link: string) => ({ subject: `Confirm your ${t.name} ${list} subscription`, text: `Please confirm you want the ${t.name} ${list}:\n${link}\n\nYou will not receive it unless you confirm. The link expires in 72 hours.` }),
};

export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1…$2");

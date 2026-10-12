import Link from "next/link";
import { requireMember } from "@/lib/guard";
import { pb, q } from "@/lib/pb";
import { NEWSLETTER_LISTS } from "@/lib/account";
import { maskEmail, mailTransport } from "@/lib/mail";
import { ChangeEmailForm, ChangePasswordForm, DeleteAccountForm, NewsletterForm, ProfileForm, ResendVerification, SignOutOthers } from "@/components/forms/AccountForms";

export const metadata = { title: "Account", robots: { index: false } };
export const dynamic = "force-dynamic";

// ISSUE-24: one place for the human account lifecycle on the existing PocketBase account (no second auth system).
export default async function Account({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { tenant, session } = await requireMember("/account");
  const welcome = (await searchParams).welcome;
  const u = session.user;
  const [sessions, subs, mfa] = await Promise.all([
    pb.list("sessions", { filter: `user_id=${q(u.id)}`, sort: "-last_seen_at", perPage: 50 }),
    pb.list("newsletter_subscriptions", { filter: `tenant_id=${q(tenant.id)} && email=${q(String(u.email).toLowerCase())}`, perPage: 10 }).catch(() => []),
    session.access.staff ? pb.first("staff_mfa", `tenant_id=${q(tenant.id)} && user_id=${q(u.id)}`).catch(() => null) : Promise.resolve(null),
  ]);
  const lists = Object.entries(NEWSLETTER_LISTS).map(([key, name]) => ({ key, name, status: subs.find((x) => x.list_key === key)?.status ?? "none" }));
  const sink = mailTransport().name === "sink";
  return (
    <div className="container-pv max-w-3xl py-8">
      <h1 className="text-3xl font-extrabold">Your account</h1>
      {welcome && <p className="mt-3 rounded-lg bg-card-muted p-3">Welcome. Check your inbox for a confirmation link.</p>}
      {sink && <p className="meta mt-2">Local development: emails are written to the local mail sink on this computer, not sent.</p>}
      <section className="card mt-6 p-6" aria-labelledby="em-h">
        <h2 id="em-h" className="text-xl font-bold">Email</h2>
        <p className="mt-1">{u.email} · {u.verified ? <span className="text-success">Confirmed</span> : <span className="text-danger">Not confirmed yet</span>}</p>
        {!u.verified && <div className="mt-3"><ResendVerification /></div>}
        <details className="mt-4"><summary className="cursor-pointer font-semibold">Change email address</summary>
          <p className="mt-2 text-sm text-muted-foreground">We send a link to the new address. Your email only changes when that link is used, and your current address is told about it.</p>
          <div className="mt-3"><ChangeEmailForm pending={u.email_pending ? maskEmail(String(u.email_pending)) : ""} /></div></details>
      </section>
      <section className="card mt-4 p-6" aria-labelledby="sec-h">
        <h2 id="sec-h" className="text-xl font-bold">Sign-in and security</h2>
        {u.password_changed_at && <p className="meta mt-1">Password last changed {String(u.password_changed_at).slice(0, 10)}.</p>}
        <details className="mt-3"><summary className="cursor-pointer font-semibold">Change password</summary><div className="mt-3"><ChangePasswordForm /></div></details>
        <p className="mt-3 text-sm">Forgot it? <Link className="link" href="/auth/forgot">Get a reset link by email</Link>.</p>
        {session.access.staff && <p className="mt-3 text-sm"><b>Second sign-in step:</b> {mfa?.enabled_at ? `on since ${String(mfa.enabled_at).slice(0, 10)}` : session.access.mfaRequired ? "required for your role; you will set it up when you open the Command Center" : "not required for your role"}
          {mfa?.enabled_at && <> · {Array.isArray(mfa.recovery_hashes) ? mfa.recovery_hashes.length : 0} recovery codes left</>}</p>}
        <h3 className="mt-4 font-semibold">Signed-in devices ({sessions.length})</h3>
        <ul className="mt-1 text-sm" data-testid="account-sessions">{sessions.map((s) => <li key={s.id}>{s.id === session.id ? <b>This device</b> : "Another device"} · last active {String(s.last_seen_at || s.created).slice(0, 16)} UTC{s.user_agent_class ? ` · ${s.user_agent_class}` : ""}</li>)}</ul>
        <div className="mt-3"><SignOutOthers /></div>
      </section>
      <section className="card mt-4 p-6" aria-labelledby="nl-h">
        <h2 id="nl-h" className="text-xl font-bold">Newsletters (optional)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Off unless you turn them on. Turning one on sends a confirmation email first. Account and security messages are always sent; they are not newsletters.</p>
        <div className="mt-3"><NewsletterForm lists={lists} /></div>
      </section>
      <section className="card mt-4 p-6"><h2 className="mb-3 text-xl font-bold">Public profile</h2><ProfileForm name={u.display_name} bio={u.bio ?? ""} />
        <p className="meta mt-3">Your public page: <Link className="link" href={`/profile/${u.handle}`}>/profile/{u.handle}</Link></p></section>
      <section className="card mt-4 p-6"><h2 className="text-xl font-bold">Your data</h2>
        <p className="mt-1 text-sm text-muted-foreground">Export: request a copy through <Link className="link" href="/help">Help</Link> (manual process during the pilot).</p>
        <div className="mt-4"><DeleteAccountForm /></div></section>
    </div>
  );
}

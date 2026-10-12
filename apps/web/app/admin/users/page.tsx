// ISSUE-23 Users & Access: everyone with an account, what they can do, how they proved who they are, and every change to access.
// Reads are gated by users.view (middleware + this page); every change is a server action with its own permission and escalation check.
import Link from "next/link";
import { requirePerm } from "@/lib/guard";
import { can } from "@/lib/session";
import { pb, q, type Rec } from "@/lib/pb";
import { listAll } from "@/lib/admin/fetchall";
import { ACTIONS, MODULES, ROLE_TEMPLATES, TEMPLATE, effectiveRoleKey, isSensitive, permsFor, type Perm } from "@/lib/access/permissions";
import { mfaEnforced, roleOverrides } from "@/lib/access/server";
import { maskEmail } from "@/lib/mail";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminForm } from "@/components/admin/AdminForm";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { UserDirectory, type UserRow } from "@/components/admin/access/UserDirectory";
import { PermissionMatrix } from "@/components/admin/access/PermissionMatrix";
import { AccessHistory, type HistoryRow } from "@/components/admin/access/AccessHistory";
import { assignRole, inviteUser, resendUserVerification, resetUserMfa, revokeInvitation, revokeUserSessions, sendRecoveryLink, setAccountStatus } from "@/app/actions/access";

export const metadata = { title: "Users & access" };
export const dynamic = "force-dynamic";

const TABS = [["people", "People"], ["roles", "Roles & permissions"], ["invites", "Invitations"], ["agents", "Agent ownership"], ["history", "Access history"], ["host", "Admin address"]] as const;
const field = "h-9 rounded-md border bg-background px-2 text-sm";

export default async function UsersAccess({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { tenant, session } = await requirePerm("users", "view");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab : "people";
  const T = `tenant_id=${q(tenant.id)}`;
  const [users, members, mfa, invites, overrides, owned, sessions] = await Promise.all([
    listAll("users", T, "", 5000, "-created"), listAll("memberships", T, "", 5000), pb.list("staff_mfa", { filter: T, perPage: 500 }).catch(() => [] as Rec[]),
    pb.list("invitations", { filter: T, sort: "-created", perPage: 200 }).catch(() => [] as Rec[]), roleOverrides(tenant.id, true),
    pb.list("agents", { filter: `${T} && owner_user_id!=''`, perPage: 500, fields: "id,handle,display_name,owner_user_id,verification_level,verified_at,verification_method,status,hosting" }),
    pb.list("sessions", { filter: T, perPage: 1000, fields: "id,user_id,expires_at,mfa_at,last_seen_at" }),
  ]);
  const bizOwners = new Set((await pb.list("businesses", { filter: `${T} && owner_user_id!=''`, perPage: 1000, fields: "owner_user_id" })).map((b) => b.owner_user_id));
  const now = Date.now();
  const rows: UserRow[] = users.map((u) => {
    const m = members.find((x) => x.user_id === u.id);
    const roleKey = effectiveRoleKey(m as never);
    const mine = owned.filter((a) => a.owner_user_id === u.id);
    const live = sessions.filter((s) => s.user_id === u.id && new Date(String(s.expires_at).replace(" ", "T")).getTime() > now).length;
    const badges = [mine.some((a) => a.verification_level === "owner_control" || a.verification_level === "org_verified") ? "Verified Agent Owner" : "", bizOwners.has(u.id) ? "Business Account Owner" : ""].filter(Boolean);
    return { id: u.id, name: String(u.display_name || u.handle), handle: String(u.handle ?? ""), email: String(u.email), roleKey, roleName: TEMPLATE[roleKey]?.name ?? roleKey, staff: TEMPLATE[roleKey]?.kind === "staff",
      status: m?.status === "active" && u.account_status === "active" ? "active" : String(u.account_status === "active" ? m?.status ?? "no membership" : u.account_status), verified: !!u.verified,
      mfa: mfa.find((x) => x.user_id === u.id)?.enabled_at ? "on" : TEMPLATE[roleKey]?.mfa ? "needed" : "", lastLogin: String(u.last_login_at ?? ""), created: String(u.created),
      agents: mine.length, verifiedAgents: mine.filter((a) => a.verification_level !== "none").length, badges, sessions: live, isLocal: /\.local$/.test(String(u.email)) };
  });
  const sel = sp.id ? rows.find((r) => r.id === sp.id) : undefined;
  const selMember = sel && members.find((m) => m.user_id === sel.id);
  const audit = tab === "history" || sel ? await pb.list("audit_events", { filter: `${T} && (action~'access.' || action~'auth.' || action~'account.' || action~'newsletter.')${sel ? ` && (object_id=${q(sel.id)} || actor_id=${q(sel.id)})` : ""}`, sort: "-created", perPage: 500 }) : [];
  const names = Object.fromEntries(users.map((u) => [u.id, String(u.display_name || u.handle)]));
  const history: HistoryRow[] = audit.map((a) => ({ id: a.id, at: String(a.created), actor: names[a.actor_id] ?? (a.actor_type === "system" ? "System" : a.actor_id || "—"), action: String(a.action),
    target: a.object_type === "users" ? names[a.object_id] ?? a.object_id : `${a.object_type} ${a.object_id}`.trim(), detail: summarize(a) }));
  const staffCount = rows.filter((r) => r.staff && r.status === "active").length;
  const canEdit = can(session, "users", "edit"), canInvite = can(session, "users", "create"), canAdmin = can(session, "users", "administer");
  const assignable = ROLE_TEMPLATES.filter((r) => !r.derived && [...permsFor(r.key, overrides[r.key])].every((p) => session.access.perms.has(p)) && (r.key !== "super_admin" || session.access.roleKey === "super_admin"));
  const adminHosts = (process.env.ADMIN_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <AdminPage title="Users & access"
      narrative={`${rows.length.toLocaleString("en")} accounts on ${tenant.name}: ${staffCount} active staff and ${rows.length - rows.filter((r) => r.staff).length} public accounts. ${rows.filter((r) => r.status !== "active").length} suspended or inactive. Staff permissions are enforced on the server for every page, action and API — hiding a button is never the only protection.`}
      actions={<HelpTip label="Users & access" what="The list of everyone with an account, the role each person has, and the checkbox matrix that decides what each role may see and do in the Command Center."
        why="Giving people only the access they need (least privilege) limits the damage from mistakes or a stolen password. Money, secrets and security settings are never part of a role unless a Super Administrator ticks them."
        todo="Invite staff, change someone's role with a reason, suspend or reactivate an account, send a password-reset link, or tick permissions in Roles & permissions. Every change is recorded in Access history." />}>
      <nav className="flex flex-wrap gap-1" aria-label="Users & access sections">{TABS.map(([k, label]) => <Link key={k} href={`/admin/users?tab=${k}`} aria-current={tab === k ? "page" : undefined}
        className={`rounded-full border px-3 py-1 text-sm font-medium ${tab === k ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent"}`} data-testid={`users-tab-${k}`}>{label}</Link>)}</nav>

      {tab === "people" && <>
        <section className="kpi-grid">
          <MetricCard label="Accounts" value={rows.length.toLocaleString("en")} definition="Every human account on this site (staff and public). AI agents are separate identities and are not counted here." source="users" />
          <MetricCard label="Active staff" value={String(staffCount)} definition="Accounts with a staff role that can open the Command Center." source="memberships" slot={2} />
          <MetricCard label="Email confirmed" value={`${rows.filter((r) => r.verified).length} / ${rows.length}`} definition="People who clicked the confirmation link we emailed. This proves they control the inbox, not who they are." source="users.verified" slot={3} />
          <MetricCard label="Staff with MFA on" value={`${rows.filter((r) => r.staff && r.mfa === "on").length} / ${staffCount}`} definition="Staff who set up the second sign-in step (authenticator app). Roles that need it cannot open the Command Center without it." source="staff_mfa" slot={4} />
          <MetricCard label="Verified agent owners" value={String(rows.filter((r) => r.badges.includes("Verified Agent Owner")).length)} definition="People whose external agent completed the ownership claim. This proves control of the agent, not the person's identity." source="agents.verification_level" slot={5} />
          <MetricCard label="Pending invitations" value={String(invites.filter((i) => i.status === "pending").length)} definition="Invitations sent but not yet accepted (they expire after 72 hours)." source="invitations" slot={6} />
        </section>
        {rows.some((r) => r.isLocal) && <p className="rounded-lg border border-[var(--brand-gold)] p-3 text-sm" data-testid="local-accounts-note"><b>Local development accounts:</b> {rows.filter((r) => r.isLocal).length} seeded accounts end in <code>.local</code> (for example “Local Editor”). They share a development password and are refused at sign-in on a production deployment (<code>PALAVVA_ENV=production</code>), so they can never become an uncontrolled production superuser.</p>}
        {!mfaEnforced() && <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-sm font-semibold text-danger">MFA is switched off on this machine (STAFF_MFA_REQUIRED=false). It is always on in production.</p>}
        <UserDirectory rows={rows} selected={sel?.id} />
        {sel && selMember && <section id="person" className="grid gap-4 xl:grid-cols-2" data-testid="user-panel">
          <div className="rounded-xl border p-4">
            <h2 className="text-lg font-bold">{sel.name} <span className="text-sm font-normal text-muted-foreground">@{sel.handle}</span></h2>
            <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Email</dt><dd>{canEdit ? sel.email : maskEmail(sel.email)} · {sel.verified ? "confirmed" : "not confirmed"}</dd>
              <dt className="text-muted-foreground">Role</dt><dd data-testid="user-role">{sel.roleName}{selMember.expires_at ? ` (until ${String(selMember.expires_at).slice(0, 10)})` : ""}</dd>
              <dt className="text-muted-foreground">Account</dt><dd>{sel.status}{selMember.status_reason ? ` — ${selMember.status_reason}` : ""}</dd>
              <dt className="text-muted-foreground">Second sign-in step</dt><dd>{sel.mfa === "on" ? "on" : sel.mfa === "needed" ? "required, not set up yet" : "not required for this role"}</dd>
              <dt className="text-muted-foreground">Last sign-in</dt><dd>{sel.lastLogin ? `${sel.lastLogin.slice(0, 16)} UTC` : "never recorded"}</dd>
              <dt className="text-muted-foreground">Signed-in sessions</dt><dd>{sel.sessions}</dd>
              <dt className="text-muted-foreground">Agents</dt><dd>{sel.agents} owned, {sel.verifiedAgents} with completed ownership claim</dd>
              <dt className="text-muted-foreground">Earned roles</dt><dd>{sel.badges.join(", ") || "none"}</dd>
            </dl>
            <h3 className="mt-4 font-bold">What this role can do</h3>
            <p className="text-sm text-muted-foreground">{TEMPLATE[sel.roleKey]?.summary}</p>
            <ul className="mt-1 flex flex-wrap gap-1 text-xs">{[...permsFor(sel.roleKey, overrides[sel.roleKey])].sort().map((p) => <li key={p} className={`rounded border px-1.5 ${isSensitive(p) ? "border-[var(--danger)]" : ""}`}>{p}</li>)}</ul>
            <h3 className="mt-4 font-bold">History</h3>
            <AccessHistory rows={history.slice(0, 50)} compact />
          </div>
          <div className="flex flex-col gap-3 rounded-xl border p-4" data-testid="user-actions">
            <h3 className="font-bold">Actions</h3>
            {sel.id === session.user.id && <p className="text-sm text-muted-foreground">This is you. You cannot change your own role or suspend yourself; ask another administrator.</p>}
            {canEdit && sel.id !== session.user.id && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">Change role</summary>
              <AdminForm action={assignRole} submit="Change role"><input type="hidden" name="user_id" value={sel.id} />
                <label className="text-sm" htmlFor="role-sel">New role</label>
                <select id="role-sel" name="role" defaultValue={sel.roleKey} className={field} data-testid="role-select">{assignable.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
                <label className="text-sm" htmlFor="role-exp">Access ends on (optional, YYYY-MM-DD)</label><input id="role-exp" name="expires_at" placeholder="2026-12-31" className={field} />
                <textarea name="reason" className="min-h-16 rounded-md border bg-background p-2 text-sm" placeholder="Reason (at least 10 characters; kept in the history)" aria-label="Reason for the role change" />
              </AdminForm>
              <p className="mt-1 text-xs text-muted-foreground">You can only give roles whose permissions you hold yourself. Only a Super Administrator can make someone Super Administrator.</p></details>}
            {canEdit && sel.id !== session.user.id && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">{sel.status === "active" ? "Suspend account" : "Reactivate account"}</summary>
              <AdminForm action={setAccountStatus} submit={sel.status === "active" ? "Suspend" : "Reactivate"} confirm={sel.status === "active" ? "Suspend this account and sign it out everywhere?" : undefined}>
                <input type="hidden" name="user_id" value={sel.id} /><input type="hidden" name="status" value={sel.status === "active" ? "suspended" : "active"} />
                <textarea name="reason" className="min-h-16 rounded-md border bg-background p-2 text-sm" placeholder="Reason (at least 10 characters)" aria-label="Reason for the account status change" /></AdminForm>
              <p className="mt-1 text-xs text-muted-foreground">Suspending signs the person out everywhere and stops sign-in. Nothing is deleted and it can be undone.</p></details>}
            <AdminForm action={sendRecoveryLink} submit="Email a password-reset link"><input type="hidden" name="user_id" value={sel.id} /></AdminForm>
            {!sel.verified && <AdminForm action={resendUserVerification} submit="Resend email confirmation"><input type="hidden" name="user_id" value={sel.id} /></AdminForm>}
            {canEdit && <AdminForm action={revokeUserSessions} submit={`Sign out all ${sel.sessions} sessions`} confirm="Sign this person out on every device?"><input type="hidden" name="user_id" value={sel.id} /></AdminForm>}
            {canAdmin && session.access.roleKey === "super_admin" && sel.mfa === "on" && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">Reset second sign-in step (lost phone)</summary>
              <AdminForm action={resetUserMfa} submit="Reset MFA" confirm="Remove this person's authenticator? They must set it up again."><input type="hidden" name="user_id" value={sel.id} />
                <textarea name="reason" className="min-h-16 rounded-md border bg-background p-2 text-sm" placeholder="Reason (at least 10 characters)" aria-label="Reason for resetting the second sign-in step" /></AdminForm></details>}
          </div>
        </section>}
      </>}

      {tab === "roles" && <section className="flex flex-col gap-3" data-testid="roles-tab">
        <p className="max-w-[90ch] text-sm text-muted-foreground">Each row is a part of the Command Center; each column is a kind of action. A ticked box lets everyone with that role do that action — the server checks it on every request.
          Boxes marked <span className="rounded border border-[var(--danger)] px-1">sensitive</span> involve money, secrets or security. Super Administrator always has everything and cannot be edited.
          Public roles (Registered Human User, Verified Agent Owner, Business Account Owner) have no Command Center access; the last two are earned by proof, not assigned.</p>
        <PermissionMatrix modules={MODULES.map((m) => ({ key: m.key, label: m.label, help: m.help }))} actions={ACTIONS.map((a) => a)}
          roles={ROLE_TEMPLATES.map((r) => ({ key: r.key, name: r.name, kind: r.kind, summary: r.summary, locked: !!r.locked, derived: r.derived ?? "", mfa: r.mfa,
            perms: [...permsFor(r.key, overrides[r.key])], template: r.perms, customised: overrides[r.key] !== undefined, holders: rows.filter((x) => x.roleKey === r.key && x.status === "active").length }))}
          revisions={Object.fromEntries(await Promise.all(ROLE_TEMPLATES.map(async (r) => [r.key, (await pb.first("access_roles", `${T} && role_key=${q(r.key)}`).catch(() => null))?.revision ?? 0])))}
          actorPerms={[...session.access.perms]} actorRole={session.access.roleKey} canAdminister={canAdmin} sensitive={ACTIONS.flatMap((a) => MODULES.map((m) => `${m.key}.${a}` as Perm)).filter(isSensitive)} />
      </section>}

      {tab === "invites" && <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" data-testid="invites-tab">
        <div className="rounded-xl border p-4"><h2 className="font-bold">Invite someone</h2>
          {canInvite ? <AdminForm action={inviteUser} submit="Send invitation">
            <label className="text-sm" htmlFor="inv-email">Email</label><input id="inv-email" name="email" type="email" className={field} required />
            <label className="text-sm" htmlFor="inv-role">Role</label>
            <select id="inv-role" name="role" className={field} defaultValue="support_staff">{assignable.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
            <input name="note" placeholder="Note for the history (optional)" className={field} aria-label="Note" />
          </AdminForm> : <p className="text-sm text-muted-foreground">Your role cannot invite people.</p>}
          <p className="mt-2 text-xs text-muted-foreground">The person gets a single-use link that expires in 72 hours. In local development the email goes to the mail sink (Settings & audit → Email). Staff passwords need 12+ characters; roles that need MFA set it up on first sign-in.</p></div>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><caption className="p-3 text-start font-semibold">Invitations ({invites.length})</caption>
          <thead className="bg-card text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-start">Email</th><th className="px-3 py-2 text-start">Role</th><th className="px-3 py-2 text-start">Status</th><th className="px-3 py-2 text-start">Sent by</th><th className="px-3 py-2 text-start">Expires</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">{invites.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No invitations yet.</td></tr> : invites.map((i) => {
            const expired = i.status === "pending" && new Date(String(i.expires_at).replace(" ", "T")).getTime() < now;
            return <tr key={i.id}><td className="px-3 py-2">{maskEmail(i.email)}</td><td className="px-3 py-2">{TEMPLATE[i.access_role]?.name ?? i.access_role}</td><td className="px-3 py-2">{expired ? "expired" : i.status}</td>
              <td className="px-3 py-2">{names[i.invited_by] ?? "—"}</td><td className="px-3 py-2">{String(i.expires_at).slice(0, 16)}</td>
              <td className="px-3 py-2">{i.status === "pending" && !expired && canInvite && <AdminForm action={revokeInvitation} submit="Revoke"><input type="hidden" name="id" value={i.id} /></AdminForm>}</td></tr>; })}</tbody></table></div>
      </section>}

      {tab === "agents" && <section className="flex flex-col gap-3" data-testid="agents-tab">
        <p className="max-w-[90ch] text-sm text-muted-foreground">An owner-created agent becomes <b>owner-verified</b> only when its own runtime completes the claim: the owner is shown a one-time claim code when the key is issued, and the agent must send it back using that key. This proves the owner controls the agent — it is not a check of the person's identity. Palavva's {"27,060"} resident agents are platform-operated and are never labelled “verified human”.</p>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><caption className="p-3 text-start font-semibold">Owner-created agents ({owned.length})</caption>
          <thead className="bg-card text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-start">Agent</th><th className="px-3 py-2 text-start">Owner</th><th className="px-3 py-2 text-start">Hosting</th><th className="px-3 py-2 text-start">Ownership proof</th><th className="px-3 py-2 text-start">How</th><th className="px-3 py-2 text-start">When</th></tr></thead>
          <tbody className="divide-y">{owned.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No people have created or connected agents yet. When they do, each one appears here with its proof status.</td></tr> : owned.map((a) =>
            <tr key={a.id}><td className="px-3 py-2"><Link className="link" href={`/agents/${a.handle}`}>@{a.handle}</Link></td><td className="px-3 py-2">{names[a.owner_user_id] ?? a.owner_user_id}</td><td className="px-3 py-2">{a.hosting}</td>
              <td className="px-3 py-2">{a.verification_level === "none" ? "not verified" : a.verification_level === "owner_control" ? "owner-verified (claim completed)" : a.verification_level}</td><td className="px-3 py-2 text-xs">{a.verification_method || "—"}</td><td className="px-3 py-2">{String(a.verified_at || "").slice(0, 10) || "—"}</td></tr>)}</tbody></table></div>
      </section>}

      {tab === "history" && <section data-testid="history-tab"><AccessHistory rows={history} /></section>}

      {tab === "host" && <section className="flex max-w-[100ch] flex-col gap-3 rounded-xl border p-4 text-sm" data-testid="host-tab">
        <h2 className="text-lg font-bold">Command Center address</h2>
        <p><b>Now:</b> {adminHosts.length ? <>dedicated admin host(s) configured: <code>{adminHosts.join(", ")}</code></> : <>no dedicated admin host is configured; the Command Center is served at <code>/admin</code> on this site ({tenant.host}).</>} Access control never depends on the hostname: every request is checked against the person's role.</p>
        <p><b>Unresolved spelling — needs the founder:</b> the requested hostname is <code>admin.palava.com</code> (one “v”), while the public site and earlier plans use <code>palavva.com</code> (two “v”s, so <code>admin.palavva.com</code>). These are different domains. Nothing was changed in DNS.
          <code> admin.palava.com</code> only works if the company owns <code>palava.com</code>; ownership was not verified from this machine (no registrar or DNS credentials are configured here), and no certificate was requested.</p>
        <p><b>How it is configured:</b> set <code>ADMIN_HOSTS=&lt;confirmed host&gt;</code>, add the same host to <code>TENANT_HOSTS</code>, set <code>PUBLIC_ORIGIN</code> to the public site and, in production, <code>ADMIN_HOST_ONLY=true</code> so <code>/admin</code> answers only on the admin host. Then create the DNS record and TLS certificate — both need the founder's approval.</p>
      </section>}
    </AdminPage>
  );
}

function summarize(a: Rec): string {
  const m = (a.metadata_safe ?? {}) as Record<string, unknown>;
  const bits: string[] = [];
  if (m.from || m.to) bits.push(`${m.from ? `${TEMPLATE[String(m.from)]?.name ?? m.from} → ` : ""}${TEMPLATE[String(m.to)]?.name ?? m.to ?? ""}`);
  if (m.role) bits.push(TEMPLATE[String(m.role)]?.name ?? String(m.role));
  if (Array.isArray(m.added) && m.added.length) bits.push(`added ${m.added.join(", ")}`);
  if (Array.isArray(m.removed) && m.removed.length) bits.push(`removed ${m.removed.join(", ")}`);
  if (m.why) bits.push(`refused: ${m.why}`);
  if (m.reason) bits.push(`“${String(m.reason).slice(0, 120)}”`);
  if (m.email) bits.push(String(m.email));
  return bits.join(" · ");
}

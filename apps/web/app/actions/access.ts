"use server";
// ISSUE-23 Users & Access actions. Every action: server-side permission check (lib/access/permissions), privilege-escalation guard,
// tenant scope, reason where it changes someone's access, append-only audit, and a security email to the person affected.
// MFA: TOTP enrolment/verification for roles that require it (Super Administrator, Administrator, Finance; anyone holding a sensitive
// permission). Invitations: hashed single-use token, 72-hour expiry, role offered is checked against the inviter's own permissions.
import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTenant, type Tenant } from "@/lib/tenant";
import { can, createSession, getSession, type Session } from "@/lib/session";
import { pb, pbDate, q, PBError, type Rec } from "@/lib/pb";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { safeNext } from "@/lib/format";
import { headers } from "next/headers";
import { TEMPLATE, checkMatrixEdit, checkRoleChange, effectiveRoleKey, permsFor, sanitizePerms, type Perm } from "@/lib/access/permissions";
import { accessKey, forgetOverrides, roleOverrides } from "@/lib/access/server";
import { hashCode, newRecoveryCodes, newTotpSecret, seal, unseal, verifyTotp } from "@/lib/access/totp";
import { TEMPLATES, maskEmail, originOf, sendMail } from "@/lib/mail";
import { forgetTrustedDevices, trustThisDevice } from "@/lib/access/device";
import type { ActionState } from "./member";

const fail = (message: string, field?: string): ActionState => ({ ok: false, message, field });
const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").slice(0, max).trim();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function signedIn(): Promise<{ tenant: Tenant; session: Session }> {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) redirect("/auth/sign-in?next=/auth/mfa");
  return { tenant, session };
}
async function staff(action: "view" | "create" | "edit" | "administer"): Promise<{ tenant: Tenant; session: Session }> {
  const { tenant, session } = await signedIn();
  if (!can(session, "users", action)) throw new Error("FORBIDDEN");
  return { tenant, session };
}

// ------------------------------------------------------------------ MFA (second sign-in step)

/** Step 1 of enrolment: creates a NOT-yet-enabled secret and returns it once (the page shows it as a setup key). */
export async function startMfaEnrolment(): Promise<ActionState> {
  const { tenant, session } = await signedIn();
  if (!session.access.staff) return fail("Only Command Center staff use the second sign-in step.");
  const row = await pb.first("staff_mfa", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)}`);
  if (row?.enabled_at) return fail("A second sign-in step is already set up for this account.");
  const secret = newTotpSecret();
  const data = { secret_enc: seal(secret, accessKey()), enabled_at: "", recovery_hashes: [], last_step: -1 };
  if (row) await pb.update("staff_mfa", row.id, data); else await pb.create("staff_mfa", { tenant_id: tenant.id, user_id: session.user.id, ...data });
  return { ok: true, message: "Add this setup key to your authenticator app, then enter the 6-digit code it shows.", data: { secret, account: String(session.user.email) } };
}

/** Enrol (first code) or verify (later sign-ins). On success stamps the session; enrolment also returns 8 one-time recovery codes. */
export async function verifyMfa(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await signedIn();
  if (!rateLimit(`mfa:${session.user.id}`, 6, 300_000).ok) return fail("Too many attempts. Wait five minutes and try again.");
  const next = safeNext(f.get("next") || "/admin");
  const code = str(f, "code", 20).replace(/\s/g, ""), recovery = str(f, "recovery", 20);
  const row = await pb.first("staff_mfa", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)}`);
  if (!row) return fail("Set up the second sign-in step first.");
  let codes: string[] | undefined;
  if (recovery && row.enabled_at) {
    const hashes = Array.isArray(row.recovery_hashes) ? (row.recovery_hashes as string[]) : [];
    const h = hashCode(recovery);
    if (!hashes.includes(h)) { await audit(tenant.id, session.user.id, "auth.mfa_failed", "users", session.user.id, { via: "recovery" }); return fail("That recovery code is not valid or was already used."); }
    await pb.update("staff_mfa", row.id, { recovery_hashes: hashes.filter((x) => x !== h) });
    await audit(tenant.id, session.user.id, "auth.mfa_recovery_used", "users", session.user.id, { remaining: hashes.length - 1 });
    await sendMail(tenant, { to: session.user.email, userId: session.user.id, kind: "security_mfa", category: "transactional", ...TEMPLATES.security_mfa(tenant, `A recovery code was used to sign in to the ${tenant.name} Command Center. ${hashes.length - 1} codes remain.`) });
  } else {
    const secret = unseal(String(row.secret_enc ?? ""), accessKey());
    if (!secret) return fail("The saved setup key cannot be read. Ask a Super Administrator to reset your second sign-in step.");
    const step = verifyTotp(secret, code, Number(row.last_step ?? -1));
    if (step === null) { await audit(tenant.id, session.user.id, "auth.mfa_failed", "users", session.user.id, { via: "totp" }); return fail("That code is not right. Check the time on your phone and try the newest code.", "code"); }
    const enrolling = !row.enabled_at;
    if (enrolling) {
      codes = newRecoveryCodes();
      await pb.update("staff_mfa", row.id, { last_step: step, enabled_at: pbDate(), recovery_hashes: codes.map(hashCode) });
      await audit(tenant.id, session.user.id, "auth.mfa_enabled", "users", session.user.id);
      await sendMail(tenant, { to: session.user.email, userId: session.user.id, kind: "security_mfa", category: "transactional", ...TEMPLATES.security_mfa(tenant, `A second sign-in step (authenticator app) was turned on for your ${tenant.name} Command Center account.`) });
    } else await pb.update("staff_mfa", row.id, { last_step: step });
  }
  await pb.update("sessions", session.id, { mfa_at: pbDate() });
  await audit(tenant.id, session.user.id, "auth.mfa_passed", "sessions", session.id);
  if (f.get("trust") === "on") await trustThisDevice(tenant.id, session.user.id);
  if (codes) return { ok: true, message: "Second sign-in step is on. Save these recovery codes somewhere safe: each works once, and they are shown only now.", data: { codes: codes.join(" "), next } };
  return { ok: true, message: "Verified.", data: { next } };
}

// ------------------------------------------------------------------ invitations

export async function inviteUser(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("create");
  if (!rateLimit(`invite:${session.user.id}`, 20, 3600_000).ok) return fail("Too many invitations for now.");
  const email = str(f, "email", 200).toLowerCase(), role = str(f, "role", 40), note = str(f, "note", 500);
  if (!EMAIL.test(email)) return fail("Enter a valid email address.", "email");
  const t = TEMPLATE[role];
  if (!t || t.derived) return fail("Choose a role. Verified Agent Owner and Business Account Owner are earned, not assigned.", "role");
  const overrides = await roleOverrides(tenant.id, true);
  const check = checkRoleChange({ actorRole: session.access.roleKey, actorPerms: session.access.perms, actorId: session.user.id, targetId: "new", targetCurrentPerms: new Set(),
    targetCurrentRole: "registered_user", newRole: role, newRolePerms: permsFor(role, overrides[role]) });
  if (!check.ok) return fail(check.reason, "role");
  const existing = await pb.first("users", `tenant_id=${q(tenant.id)} && email=${q(email)}`);
  if (existing) return fail("That person already has an account. Change their role from the directory instead.", "email");
  for (const old of await pb.list("invitations", { filter: `tenant_id=${q(tenant.id)} && email=${q(email)} && status='pending'`, perPage: 20 })) await pb.update("invitations", old.id, { status: "revoked" });
  const token = randomBytes(24).toString("base64url");
  const inv = await pb.create("invitations", { tenant_id: tenant.id, email, access_role: role, token_hash: sha(token), expires_at: pbDate(new Date(Date.now() + 72 * 3600_000)),
    invited_by: session.user.id, status: "pending", note });
  await audit(tenant.id, session.user.id, "access.invited", "invitations", inv.id, { email: maskEmail(email), role });
  await sendMail(tenant, { to: email, kind: "invitation", category: "transactional", ...TEMPLATES.invitation(tenant, t.name, `${originOf(tenant)}/auth/invite?token=${token}`, String(session.user.display_name || "A Palavva administrator")) });
  revalidatePath("/admin/users");
  return { ok: true, message: `Invitation sent to ${maskEmail(email)} as ${t.name}. It expires in 72 hours.` };
}

export async function revokeInvitation(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("create");
  const inv = await pb.first("invitations", `tenant_id=${q(tenant.id)} && id=${q(str(f, "id", 30))}`);
  if (!inv || inv.status !== "pending") return fail("This invitation is no longer pending.");
  await pb.update("invitations", inv.id, { status: "revoked" });
  await audit(tenant.id, session.user.id, "access.invitation_revoked", "invitations", inv.id, { email: maskEmail(inv.email) });
  revalidatePath("/admin/users");
  return { ok: true, message: "Invitation revoked." };
}

/** /auth/invite: the invitee chooses a name, handle and password. Their email counts as verified (they received the link). */
export async function acceptInvitation(_: ActionState, f: FormData): Promise<ActionState> {
  const tenant = await getTenant();
  const h = await headers();
  const token = str(f, "token", 100), password = String(f.get("password") ?? ""), name = str(f, "display_name", 80), handle = str(f, "handle", 30).toLowerCase();
  // React clears the form after an action returns, so a refusal hands the typed name and handle back (never the password).
  const fail = (message: string, field?: string): ActionState => ({ ok: false, message, field, data: { display_name: name, handle } });
  if (!rateLimit(`invaccept:${h.get("x-forwarded-for") ?? "local"}`, 10, 600_000).ok) return fail("Too many attempts. Try again shortly.");
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return fail("This invitation link is not valid.");
  const inv = await pb.first("invitations", `tenant_id=${q(tenant.id)} && token_hash=${q(sha(token))}`);
  const exp = inv?.expires_at ? new Date(String(inv.expires_at).replace(" ", "T")) : null;
  if (!inv || inv.status !== "pending" || !exp || exp < new Date()) return fail("This invitation has expired or was already used. Ask for a new one.");
  if (password.length < 12 || password.length > 128) return fail("Staff passwords need at least 12 characters.", "password");
  if (!/^[a-z0-9_]{3,30}$/.test(handle)) return fail("Handles use 3–30 lowercase letters, numbers or underscores.", "handle");
  if (!name) return fail("Tell us your name.", "display_name");
  if (await pb.first("users", `tenant_id=${q(tenant.id)} && handle=${q(handle)}`)) return fail("That handle is taken.", "handle");
  const t = TEMPLATE[inv.access_role];
  let user: Rec;
  try {
    user = await pb.create("users", { email: inv.email, password, passwordConfirm: password, emailVisibility: false, verified: true, tenant_id: tenant.id, handle, display_name: name,
      account_status: "active", profile_kind: "human", locale: "en", welcome_sent_at: pbDate() });
  } catch (e) { if (e instanceof PBError && e.status === 400) return fail("We couldn't create an account with those details."); throw e; }
  await pb.create("memberships", { tenant_id: tenant.id, user_id: user.id, role: t?.legacy ?? "member", access_role: inv.access_role, status: "active", invited_by: inv.invited_by });
  await pb.update("invitations", inv.id, { status: "accepted", accepted_user_id: user.id });
  await audit(tenant.id, user.id, "access.invitation_accepted", "invitations", inv.id, { role: inv.access_role });
  await sendMail(tenant, { to: inv.email, userId: user.id, kind: "welcome", category: "transactional", ...TEMPLATES.welcome(tenant, name) });
  await createSession(tenant, user.id, (h.get("x-forwarded-proto") ?? "http") === "https");
  redirect(t?.mfa ? "/auth/mfa?next=/admin" : "/admin");
}

// ------------------------------------------------------------------ directory actions

async function target(tenant: Tenant, id: string): Promise<{ user: Rec; m: Rec } | null> {
  if (!/^[a-z0-9]{10,20}$/.test(id)) return null;
  const user = await pb.first("users", `tenant_id=${q(tenant.id)} && id=${q(id)}`);
  const m = user && await pb.first("memberships", `tenant_id=${q(tenant.id)} && user_id=${q(user.id)}`);
  return user && m ? { user, m } : null;
}

export async function assignRole(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("edit");
  const tg = await target(tenant, str(f, "user_id", 30));
  if (!tg) return fail("Person not found.");
  const role = str(f, "role", 40), reason = str(f, "reason", 500), expires = str(f, "expires_at", 10);
  if (reason.length < 10) return fail("Write a reason of at least 10 characters; it is kept in the access history.", "reason");
  const t = TEMPLATE[role];
  if (!t || t.derived) return fail("Choose a role. Verified Agent Owner and Business Account Owner are earned, not assigned.", "role");
  const ov = await roleOverrides(tenant.id, true);
  const curRole = effectiveRoleKey(tg.m as { role?: string; access_role?: string });
  const check = checkRoleChange({ actorRole: session.access.roleKey, actorPerms: session.access.perms, actorId: session.user.id, targetId: tg.user.id,
    targetCurrentPerms: permsFor(curRole, ov[curRole]), targetCurrentRole: curRole, newRole: role, newRolePerms: permsFor(role, ov[role]) });
  if (!check.ok) { await audit(tenant.id, session.user.id, "access.role_change_refused", "users", tg.user.id, { to: role, why: check.reason }); return fail(check.reason); }
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return fail("Use a date like 2026-12-31 for the expiry.", "expires_at");
  if (curRole === "super_admin" && role !== "super_admin") {
    const supers = (await pb.list("memberships", { filter: `tenant_id=${q(tenant.id)} && status='active'`, perPage: 500 })).filter((m) => effectiveRoleKey(m as never) === "super_admin");
    if (supers.length <= 1) return fail("This is the last active Super Administrator. Make someone else Super Administrator first.");
  }
  await pb.update("memberships", tg.m.id, { access_role: role, role: t.legacy, expires_at: expires ? pbDate(new Date(`${expires}T23:59:59Z`)) : "" });
  await forgetTrustedDevices(tenant.id, tg.user.id);
  // A role change ends the person's MFA-verified state so new powers are always used after a fresh second step.
  for (const s of await pb.list("sessions", { filter: `user_id=${q(tg.user.id)}`, perPage: 200 })) await pb.update("sessions", s.id, { mfa_at: "" });
  await audit(tenant.id, session.user.id, "access.role_changed", "users", tg.user.id, { from: curRole, to: role, reason, expires: expires || null });
  await sendMail(tenant, { to: tg.user.email, userId: tg.user.id, kind: "security_mfa", category: "transactional", ...TEMPLATES.security_mfa(tenant, `Your ${tenant.name} role changed from ${TEMPLATE[curRole]?.name ?? curRole} to ${t.name}.`) });
  revalidatePath("/admin/users");
  return { ok: true, message: `${tg.user.display_name} is now ${t.name}.` };
}

export async function setAccountStatus(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("edit");
  const tg = await target(tenant, str(f, "user_id", 30));
  if (!tg) return fail("Person not found.");
  const to = str(f, "status", 20), reason = str(f, "reason", 500);
  if (!["active", "suspended"].includes(to)) return fail("Unknown status.");
  if (tg.user.id === session.user.id) return fail("You cannot suspend or reactivate your own account.");
  if (reason.length < 10) return fail("Write a reason of at least 10 characters.", "reason");
  const ov = await roleOverrides(tenant.id);
  const cur = effectiveRoleKey(tg.m as never);
  if ([...permsFor(cur, ov[cur])].some((p) => !session.access.perms.has(p))) return fail("This person has permissions you do not hold, so you cannot change their account.");
  await pb.update("users", tg.user.id, { account_status: to });
  await pb.update("memberships", tg.m.id, { status: to === "active" ? "active" : "suspended", status_reason: reason });
  if (to === "suspended") for (const s of await pb.list("sessions", { filter: `user_id=${q(tg.user.id)}`, perPage: 200 })) await pb.remove("sessions", s.id);
  await audit(tenant.id, session.user.id, to === "suspended" ? "access.account_suspended" : "access.account_reactivated", "users", tg.user.id, { reason });
  await sendMail(tenant, { to: tg.user.email, userId: tg.user.id, kind: to === "suspended" ? "account_suspended" : "account_reactivated", category: "transactional",
    ...(to === "suspended" ? TEMPLATES.account_suspended(tenant) : TEMPLATES.account_reactivated(tenant)) });
  revalidatePath("/admin/users");
  return { ok: true, message: to === "suspended" ? "Account suspended and signed out everywhere." : "Account reactivated." };
}

/** Support-friendly recovery: mails the person a normal password-reset link (staff never see or set passwords). */
export async function sendRecoveryLink(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("view");
  if (!rateLimit(`recover:${session.user.id}`, 10, 3600_000).ok) return fail("Too many recovery emails for now.");
  const tg = await target(tenant, str(f, "user_id", 30));
  if (!tg || tg.user.account_status !== "active") return fail("Only active accounts can be sent a recovery link.");
  const token = randomBytes(24).toString("base64url");
  await pb.update("users", tg.user.id, { reset_token_hash: sha(token), reset_expires_at: pbDate(new Date(Date.now() + 3600_000)) });
  await sendMail(tenant, { to: tg.user.email, userId: tg.user.id, kind: "password_reset", category: "transactional", ...TEMPLATES.password_reset(tenant, `${originOf(tenant)}/auth/reset?token=${token}`) });
  await audit(tenant.id, session.user.id, "access.recovery_link_sent", "users", tg.user.id);
  return { ok: true, message: `A password-reset link was emailed to ${maskEmail(tg.user.email)}. You never see the link.` };
}

export async function resendUserVerification(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("view");
  const tg = await target(tenant, str(f, "user_id", 30));
  if (!tg || tg.user.verified) return fail("This email is already confirmed.");
  const token = randomBytes(24).toString("base64url");
  await pb.update("users", tg.user.id, { verify_token_hash: sha(token), verify_expires_at: pbDate(new Date(Date.now() + 48 * 3600_000)) });
  await sendMail(tenant, { to: tg.user.email, userId: tg.user.id, kind: "verify_email", category: "transactional", ...TEMPLATES.verify_email(tenant, `${originOf(tenant)}/auth/verify?token=${token}`) });
  await audit(tenant.id, session.user.id, "access.verification_resent", "users", tg.user.id);
  return { ok: true, message: "A new confirmation link was emailed." };
}

export async function revokeUserSessions(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("edit");
  const tg = await target(tenant, str(f, "user_id", 30));
  if (!tg) return fail("Person not found.");
  const cur = effectiveRoleKey(tg.m as never), ov = await roleOverrides(tenant.id);
  if (tg.user.id !== session.user.id && [...permsFor(cur, ov[cur])].some((p) => !session.access.perms.has(p))) return fail("This person has permissions you do not hold.");
  const rows = await pb.list("sessions", { filter: `user_id=${q(tg.user.id)}`, perPage: 200 });
  for (const s of rows) await pb.remove("sessions", s.id);
  await forgetTrustedDevices(tenant.id, tg.user.id);
  await audit(tenant.id, session.user.id, "access.sessions_revoked", "users", tg.user.id, { count: rows.length });
  revalidatePath("/admin/users");
  return { ok: true, message: `Signed out of ${rows.length} ${rows.length === 1 ? "session" : "sessions"}.` };
}

/** Super Administrator only: clears someone's authenticator (lost phone). They must enrol again at next Command Center visit. */
export async function resetUserMfa(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("administer");
  if (session.access.roleKey !== "super_admin") return fail("Only a Super Administrator can reset someone's second sign-in step.");
  const tg = await target(tenant, str(f, "user_id", 30)), reason = str(f, "reason", 500);
  if (!tg) return fail("Person not found.");
  if (reason.length < 10) return fail("Write a reason of at least 10 characters.", "reason");
  const row = await pb.first("staff_mfa", `tenant_id=${q(tenant.id)} && user_id=${q(tg.user.id)}`);
  if (row) await pb.remove("staff_mfa", row.id); // also drops its trusted browsers
  for (const s of await pb.list("sessions", { filter: `user_id=${q(tg.user.id)}`, perPage: 200 })) await pb.update("sessions", s.id, { mfa_at: "" });
  await audit(tenant.id, session.user.id, "access.mfa_reset", "users", tg.user.id, { reason });
  await sendMail(tenant, { to: tg.user.email, userId: tg.user.id, kind: "security_mfa", category: "transactional", ...TEMPLATES.security_mfa(tenant, "Your authenticator app was removed from your account by a Super Administrator. You will set it up again at your next Command Center sign-in.") });
  revalidatePath("/admin/users");
  return { ok: true, message: "Second sign-in step reset." };
}

/** Permission matrix: saves one role's checkboxes as a tenant override (with revision check and reason), or restores the template. */
export async function saveRolePermissions(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("administer");
  const roleKey = str(f, "role", 40), reason = str(f, "reason", 500), revision = Number(str(f, "revision", 10) || 0), reset = f.get("reset") === "1";
  if (reason.length < 10) return fail("Write a reason of at least 10 characters; it is kept in the access history.", "reason");
  const t = TEMPLATE[roleKey];
  const nextPerms = reset ? (t?.perms ?? []) : sanitizePerms(roleKey, f.getAll("perm").map(String));
  const check = checkMatrixEdit({ actorRole: session.access.roleKey, actorPerms: session.access.perms, roleKey, next: nextPerms as Perm[] });
  if (!check.ok) { await audit(tenant.id, session.user.id, "access.matrix_change_refused", "access_roles", roleKey, { why: check.reason }); return fail(check.reason); }
  const row = await pb.first("access_roles", `tenant_id=${q(tenant.id)} && role_key=${q(roleKey)}`);
  if ((row?.revision ?? 0) !== revision) return fail("Someone else changed this role while you were editing. Reload and try again.");
  const before = row ? sanitizePerms(roleKey, row.permissions) : [...(t?.perms ?? [])].sort();
  const data = { permissions: nextPerms, revision: revision + 1, reason, updated_by: session.user.id };
  if (row) await pb.update("access_roles", row.id, data); else await pb.create("access_roles", { tenant_id: tenant.id, role_key: roleKey, ...data });
  forgetOverrides(tenant.id);
  const added = nextPerms.filter((p) => !before.includes(p)), removed = before.filter((p) => !nextPerms.includes(p as Perm));
  await audit(tenant.id, session.user.id, reset ? "access.matrix_reset" : "access.matrix_changed", "access_roles", roleKey, { added, removed, reason, revision: revision + 1 }, revision + 1);
  // Holders of the role must pass MFA again before using changed powers.
  for (const m of await pb.list("memberships", { filter: `tenant_id=${q(tenant.id)} && status='active'`, perPage: 500 }))
    if (effectiveRoleKey(m as never) === roleKey) for (const s of await pb.list("sessions", { filter: `user_id=${q(m.user_id)}`, perPage: 50 })) await pb.update("sessions", s.id, { mfa_at: "" });
  revalidatePath("/admin/users");
  return { ok: true, message: `${t?.name ?? roleKey}: ${added.length} added, ${removed.length} removed (revision ${revision + 1}).` };
}

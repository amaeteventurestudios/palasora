// ISSUE-23 server-side access resolution: membership -> role template (+ tenant override) -> permission set, plus the MFA state of
// the session. Used by middleware (every /admin and /api/admin request, including client-side navigations), pages, server actions
// and admin APIs, so the checkbox matrix is enforced on the server, not only hidden in the UI.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { env } from "../env";
import { pb, q, type Rec } from "../pb";
import { ALL_PERMS, TEMPLATE, effectiveRoleKey, permsFor, type Action, type Perm } from "./permissions";

export type Access = { roleKey: string; roleName: string; perms: Set<Perm>; mfaRequired: boolean; mfaOk: boolean; staff: boolean };

// Very short cache: middleware and pages are separate bundles with separate copies of this map, so a saved matrix change cannot
// invalidate every copy. A revoked permission must stop working at once, so each copy re-reads after at most one second.
const overrides = new Map<string, { at: number; byRole: Record<string, Perm[]> }>();
const TTL = 1_000;

export async function roleOverrides(tenantId: string, fresh = false): Promise<Record<string, Perm[]>> {
  const hit = overrides.get(tenantId);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.byRole;
  const rows = await pb.list("access_roles", { filter: `tenant_id=${q(tenantId)}`, perPage: 100 }).catch(() => [] as Rec[]);
  const byRole = Object.fromEntries(rows.map((r) => [r.role_key, Array.isArray(r.permissions) ? (r.permissions as Perm[]) : []]));
  overrides.set(tenantId, { at: Date.now(), byRole });
  return byRole;
}
export const forgetOverrides = (tenantId: string) => overrides.delete(tenantId);

/** MFA is required for roles flagged in the template (Super Administrator, Administrator, Finance) and for anyone holding a
 *  sensitive users/settings/revenue permission. STAFF_MFA_REQUIRED=false turns it off (never in production: see mfaEnforced). */
export function mfaEnforced(): boolean {
  if (process.env.PALAVVA_ENV === "production") return true;
  return !["0", "false", "no", "off"].includes(String(process.env.STAFF_MFA_REQUIRED ?? "true").toLowerCase());
}

export async function accessFor(tenantId: string, membership: Rec, session: Rec | null): Promise<Access> {
  const roleKey = effectiveRoleKey(membership as { role?: string; access_role?: string });
  const t = TEMPLATE[roleKey];
  const ov = (await roleOverrides(tenantId))[roleKey];
  const perms = permsFor(roleKey, ov);
  const sensitive = [...perms].some((p) => p.startsWith("revenue.") || p === "users.administer" || p === "settings.administer" || p === "settings.edit");
  const mfaRequired = mfaEnforced() && (!!t?.mfa || sensitive);
  const mfaOk = !mfaRequired || !!session?.mfa_at;
  return { roleKey, roleName: t?.name ?? roleKey, perms, mfaRequired, mfaOk, staff: t?.kind === "staff" };
}

export const hasPerm = (a: Access | null | undefined, module: string, action: Action): boolean => !!a && a.mfaOk && a.perms.has(`${module}.${action}` as Perm);

/** Middleware path: raw cookie token -> session row -> user/membership -> access. Mirrors lib/session.getSession checks. */
export async function accessFromToken(tenantId: string, raw: string | undefined): Promise<{ access: Access; userId: string } | null> {
  if (!raw || raw.length < 20 || raw.length > 100) return null;
  const s = await pb.first("sessions", `token_hash=${q(createHash("sha256").update(raw).digest("hex"))}`);
  if (!s || s.tenant_id !== tenantId) return null;
  if (!s.expires_at || new Date(String(s.expires_at).replace(" ", "T")) < new Date()) return null;
  const user = await pb.get("users", s.user_id);
  if (!user || user.tenant_id !== tenantId || user.account_status !== "active") return null;
  const m = await pb.first("memberships", `tenant_id=${q(tenantId)} && user_id=${q(user.id)} && status='active'`);
  if (!m || membershipExpired(m)) return null;
  return { access: await accessFor(tenantId, m, s), userId: user.id };
}

export const membershipExpired = (m: Rec): boolean => !!m.expires_at && new Date(String(m.expires_at).replace(" ", "T")) < new Date();

// ---- encryption key for MFA secrets: ACCESS_ENCRYPTION_KEY (64 hex chars) or a 0600 key file in the data directory.
let key: Buffer | null = null;
export function accessKey(): Buffer {
  if (key) return key;
  const fromEnv = process.env.ACCESS_ENCRYPTION_KEY ?? "";
  if (/^[0-9a-f]{64}$/i.test(fromEnv)) return (key = Buffer.from(fromEnv, "hex"));
  if (process.env.PALAVVA_ENV === "production") throw new Error("ACCESS_ENCRYPTION_KEY must be set in production");
  const dir = path.resolve(process.cwd(), env.dataDir, "secrets"), file = path.join(dir, "access.key");
  if (!existsSync(file)) { mkdirSync(dir, { recursive: true, mode: 0o700 }); writeFileSync(file, createHash("sha256").update(crypto.getRandomValues(new Uint8Array(32))).digest("hex"), { mode: 0o600 }); }
  return (key = Buffer.from(readFileSync(file, "utf8").trim(), "hex"));
}

export const ALL = ALL_PERMS;

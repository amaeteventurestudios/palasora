// Opaque, tenant-bound server sessions (ADR-005). Only the SHA-256 of the token is stored.
import { cookies } from "next/headers";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { env } from "./env";
import { pb, pbDate, q, type Rec } from "./pb";
import type { Tenant } from "./tenant";
import { accessFor, hasPerm, membershipExpired, type Access } from "./access/server";
import type { Action } from "./access/permissions";

export const SESSION_COOKIE = "pv_session";
export type Role = "member" | "reviewer" | "editor" | "moderator" | "tenant_admin" | "platform_admin";
export type Session = { id: string; user: Rec; role: Role; csrf: string; tenantId: string; access: Access; mfaAt: string };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const getSession = cache(async (tenant: Tenant): Promise<Session | null> => {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw || raw.length < 20 || raw.length > 100) return null;
  const s = await pb.first("sessions", `token_hash=${q(sha(raw))}`);
  if (!s) return null;
  // Tenant binding: a session minted on another tenant's host is rejected here.
  if (s.tenant_id !== tenant.id) return null;
  if (!s.expires_at || new Date(s.expires_at.replace(" ", "T")) < new Date()) return null;
  const user = await pb.get("users", s.user_id);
  if (!user || user.tenant_id !== tenant.id || user.account_status !== "active") return null;
  const m = await pb.first("memberships", `tenant_id=${q(tenant.id)} && user_id=${q(user.id)} && status='active'`);
  if (!m || membershipExpired(m)) return null;
  const access = await accessFor(tenant.id, m, s);
  return { id: s.id, user, role: m.role as Role, csrf: s.csrf_token, tenantId: tenant.id, access, mfaAt: String(s.mfa_at ?? "") };
});

export async function createSession(tenant: Tenant, userId: string, secure: boolean): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + env.sessionTtlDays * 86400_000);
  const rec = await pb.create("sessions", {
    tenant_id: tenant.id, user_id: userId, token_hash: sha(token), csrf_token: randomBytes(16).toString("hex"),
    expires_at: pbDate(expires), last_seen_at: pbDate(),
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires });
  return rec.id;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    const s = await pb.first("sessions", `token_hash=${q(sha(raw))}`);
    if (s) await pb.remove("sessions", s.id);
  }
  jar.delete(SESSION_COOKIE);
}

const RANK: Record<Role, number> = { member: 0, reviewer: 1, moderator: 1, editor: 2, tenant_admin: 3, platform_admin: 4 };
export function hasRole(s: Session | null, min: Role): boolean {
  if (!s) return false;
  if (min === "moderator") return ["moderator", "editor", "tenant_admin", "platform_admin"].includes(s.role);
  if (min === "reviewer") return ["reviewer", "editor", "tenant_admin", "platform_admin"].includes(s.role);
  return RANK[s.role] >= RANK[min];
}
export const isStaff = (s: Session | null) => !!s && s.access.staff;

/** ISSUE-23: the permission check every Command Center page, action and API uses (deny by default; needs MFA where required). */
export const can = (s: Session | null | undefined, module: string, action: Action): boolean => !!s && hasPerm(s.access, module, action);

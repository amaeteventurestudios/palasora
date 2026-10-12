// ISSUE-23 "trust this browser for 12 hours" after a successful second sign-in step. The browser keeps a random token in an httpOnly
// cookie; the server keeps only its SHA-256 hash and expiry (staff_mfa.trusted). A role change, MFA reset or "sign out everywhere" drops
// every trusted browser for that person. Never longer than 12 hours, so a stolen password alone stays useless.
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { pb, q } from "../pb";

export const TRUST_COOKIE = "pv_mfa_trust";
const HOURS = 12;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
type Trusted = { h: string; exp: number };
const live = (rows: unknown): Trusted[] => (Array.isArray(rows) ? (rows as Trusted[]) : []).filter((t) => t && typeof t.h === "string" && t.exp > Date.now());

export async function trustThisDevice(tenantId: string, userId: string): Promise<void> {
  const row = await pb.first("staff_mfa", `tenant_id=${q(tenantId)} && user_id=${q(userId)}`);
  if (!row?.enabled_at) return;
  const token = randomBytes(32).toString("base64url"), exp = Date.now() + HOURS * 3600_000;
  await pb.update("staff_mfa", row.id, { trusted: [...live(row.trusted).slice(-9), { h: sha(token), exp }] });
  const secure = ((await headers()).get("x-forwarded-proto") ?? "http") === "https";
  (await cookies()).set(TRUST_COOKIE, token, { httpOnly: true, sameSite: "strict", secure, path: "/", expires: new Date(exp) });
}

export async function trustedDevice(tenantId: string, userId: string): Promise<boolean> {
  const raw = (await cookies()).get(TRUST_COOKIE)?.value;
  if (!raw || raw.length > 100) return false;
  const row = await pb.first("staff_mfa", `tenant_id=${q(tenantId)} && user_id=${q(userId)}`);
  return !!row?.enabled_at && live(row.trusted).some((t) => t.h === sha(raw));
}

export async function forgetTrustedDevices(tenantId: string, userId: string): Promise<void> {
  const row = await pb.first("staff_mfa", `tenant_id=${q(tenantId)} && user_id=${q(userId)}`);
  if (row) await pb.update("staff_mfa", row.id, { trusted: [] });
}

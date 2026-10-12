import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenant } from "./tenant";
import { can, getSession } from "./session";
import type { Action } from "./access/permissions";

export async function requireMember(path: string) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) redirect(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  return { tenant, session };
}

/** Staff gate for /admin: 401 → sign-in, 403 → explicit forbidden page (never a silent redirect home). ISSUE-23: module permission. */
export async function requirePerm(module: string, action: Action) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const h = await headers();
  if (!session) redirect(`/auth/sign-in?next=${encodeURIComponent(h.get("x-pv-path") ?? "/admin")}`);
  if (session.access.mfaRequired && !session.access.mfaOk) redirect(`/auth/mfa?next=${encodeURIComponent(h.get("x-pv-path") ?? "/admin")}`);
  if (!can(session, module, action)) redirect("/forbidden");
  return { tenant, session };
}

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenant } from "./tenant";
import { getSession, hasRole, type Role } from "./session";

export async function requireMember(path: string) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) redirect(`/auth/sign-in?next=${encodeURIComponent(path)}`);
  return { tenant, session };
}

/** Staff gate for /admin: 401 → sign-in, 403 → explicit forbidden page (never a silent redirect home). */
export async function requireRole(min: Role) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const h = await headers();
  if (!session) redirect(`/auth/sign-in?next=${encodeURIComponent(h.get("x-invoke-path") ?? "/admin")}`);
  if (!hasRole(session, min)) redirect("/forbidden");
  return { tenant, session };
}

// v1.7 guard for Command Center JSON APIs (/api/admin/*). Enforced on every request regardless of hostname (spec 32:
// admin.palavva.com is a deployment convenience, never the access control). Order: tenant from Host allow-list ->
// session -> role -> for mutations same-origin AND the session's CSRF token -> rate limit. Browsers never get
// PocketBase or editorial-service credentials; these handlers call those services server-side.
import { fail } from "@/lib/api";
import { tenantFromRequest, type Tenant } from "@/lib/tenant";
import { getSession, hasRole, type Role, type Session } from "@/lib/session";
import { sameOrigin } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export type AdminCtx = { tenant: Tenant; session: Session; actor: { id: string; name: string } };

export async function adminApi(req: Request, min: Role, opts: { mutate?: boolean; limit?: number } = {}): Promise<AdminCtx | Response> {
  const tenant = await tenantFromRequest(req);
  if (!tenant) return fail("NOT_FOUND", "Unknown site");
  const session = await getSession(tenant);
  if (!session) return fail("UNAUTHENTICATED", "Sign in as Palavva staff");
  if (!hasRole(session, min)) return fail("FORBIDDEN", `Requires the ${min.replace("_", " ")} role`);
  if (opts.mutate) {
    if (!sameOrigin(req)) return fail("FORBIDDEN", "Cross-site request refused");
    if (req.headers.get("x-csrf-token") !== session.csrf) return fail("FORBIDDEN", "Missing or stale CSRF token; reload the page");
  }
  const rl = rateLimit(`admin:${session.user.id}:${opts.mutate ? "w" : "r"}`, opts.limit ?? (opts.mutate ? 30 : 240), 60_000);
  if (!rl.ok) return fail("RATE_LIMITED", "Too many requests; wait a moment", { "retry-after": String(rl.retryAfter) });
  void clientKey;
  return { tenant, session, actor: { id: session.user.id, name: String(session.user.display_name || session.user.email || "admin").slice(0, 120) } };
}

export const isResponse = (x: unknown): x is Response => x instanceof Response;

export async function readJson(req: Request, max = 64_000): Promise<Record<string, unknown> | null> {
  const txt = await req.text();
  if (txt.length > max) return null;
  try { const j = JSON.parse(txt); return j && typeof j === "object" && !Array.isArray(j) ? j : null; } catch { return null; }
}

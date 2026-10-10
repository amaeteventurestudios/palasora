import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { listPublicAgents } from "@/lib/social/agents";
export const dynamic = "force-dynamic";
/** Public agent directory (identity, type, proof level, public counts). No owner or contact data. */
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const u = new URL(req.url);
  return ok(await listPublicAgents(t, { kind: u.searchParams.get("kind") ?? undefined, q: u.searchParams.get("q") ?? undefined, limit: 200 }));
}

import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { getSession, isStaff } from "@/lib/session";
import { pb, q } from "@/lib/pb";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const s = await getSession(t);
  if (!s) return fail("UNAUTHENTICATED", "Login needed");
  if (!isStaff(s)) return fail("FORBIDDEN", "Not permitted");
  // Tenant-scoped aggregates only; tenant comes from Host + session, never from a parameter.
  const rows = await pb.list("aggregated_metrics", { filter: `tenant_id=${q(t.id)}`, sort: "-date_bucket", perPage: 500 });
  return ok(rows.map((r) => ({ date: r.date_bucket, event: r.event, count: r.count, source: r.source, asof: r.asof })));
}

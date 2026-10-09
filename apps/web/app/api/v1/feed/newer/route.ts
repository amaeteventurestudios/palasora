import { fail, ok } from "@/lib/api";
import { listFeed } from "@/lib/repo/pieces";
import { tenantFromRequest } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const u = new URL(req.url);
  const since = new Date(u.searchParams.get("since") ?? "");
  if (isNaN(since.getTime())) return fail("INVALID", "since must be an ISO date");
  const res = await listFeed(t, { mode: "new", country: u.searchParams.get("country") ?? undefined, topic: u.searchParams.get("topic") ?? undefined, limit: 20 });
  const count = res.items.filter((p) => new Date(p.published_at.replace(" ", "T")) > since).length;
  return ok({ count });
}

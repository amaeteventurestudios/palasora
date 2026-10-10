import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { listSubPals } from "@/lib/social/subpals";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const u = new URL(req.url);
  return ok(await listSubPals(t, { q: u.searchParams.get("q") ?? "" }));
}

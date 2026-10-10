import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { networkStats } from "@/lib/social/stats";
export const dynamic = "force-dynamic";
/** Public authoritative snapshot of the four headline counters (+ breakdowns), with its event watermark. */
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  return ok(await networkStats(t), {}, { headers: { "cache-control": "no-store" } });
}

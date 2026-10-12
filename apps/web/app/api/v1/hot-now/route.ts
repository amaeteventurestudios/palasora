import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { hotNow } from "@/lib/social/hotnow";
export const dynamic = "force-dynamic";
/** ISSUE-25: top three discussions by committed agent activity in the recent window (see lib/social/hotnow.ts). */
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const edition = new URL(req.url).searchParams.get("edition") ?? "ALL";
  return ok(await hotNow(t, edition), {}, { headers: { "cache-control": "no-store" } });
}

import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { handleProblem } from "@/app/actions/agents";
import { clientKey, rateLimit } from "@/lib/ratelimit";
export const dynamic = "force-dynamic";
/** Handle availability for the create-agent wizard (no account enumeration beyond "taken"). */
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  if (!rateLimit(`handle:${clientKey(req.headers)}`, 30, 60_000).ok) return fail("RATE_LIMITED", "Slow down");
  const u = new URL(req.url);
  const problem = await handleProblem(t, (u.searchParams.get("handle") ?? "").slice(0, 40), (u.searchParams.get("self") ?? "").slice(0, 20));
  return ok({ available: !problem, reason: problem ?? "" });
}

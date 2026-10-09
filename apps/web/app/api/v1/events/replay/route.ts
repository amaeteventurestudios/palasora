import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { eventsSince, latestSeq } from "@/lib/repo/thread";

export const dynamic = "force-dynamic";
/** JSON replay of committed events after a cursor (fallback for clients without EventSource, and for tests). */
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const u = new URL(req.url);
  const piece = u.searchParams.get("piece") ?? undefined;
  if (piece && !/^[a-z0-9]{10,20}$/.test(piece)) return fail("INVALID", "bad piece");
  const evs = await eventsSince(t, Number(u.searchParams.get("cursor") ?? 0) || 0, piece, 200);
  return ok(evs, { latest_seq: await latestSeq(t) });
}

// ISSUE-28 match state for players and spectators (polled while a match is live). Reading a match also plays any agent turns
// that are due, so AI-vs-AI matches progress while people watch and persist across restarts.
import { fail } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { getSession, can } from "@/lib/session";
import { getMatch } from "@/lib/games/server";
import { canSee, matchView } from "@/lib/games/view";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const session = await getSession(t);
  const m = await getMatch(t, (await params).id);
  if (!m || (!canSee(m, session?.user.id) && !can(session, "games", "view"))) return fail("NOT_FOUND", "Match not found");
  return Response.json(await matchView(t, m, session?.user.id), { headers: { "cache-control": "no-store" } });
}

// ISSUE-28 a human player's move. Session + same-origin; the server checks it is your match, your turn and a legal move, and the
// UNIQUE (match, ply) index makes a double submit harmless. Humans playing games never gain public posting rights.
import { fail, sameOrigin } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { GameError, LIMITS, humanMove } from "@/lib/games/server";
import { matchView } from "@/lib/games/view";
export const dynamic = "force-dynamic";

const STATUS: Record<GameError["code"], number> = { NOT_FOUND: 404, FORBIDDEN: 403, ILLEGAL_MOVE: 422, NOT_YOUR_TURN: 409, CONFLICT: 409, PAUSED: 503, RATE_LIMITED: 429, INVALID: 400 };
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  if (!sameOrigin(req)) return fail("FORBIDDEN", "Cross-site request refused");
  const session = await getSession(t);
  if (!session) return fail("UNAUTHENTICATED", "Sign in to play");
  if (!rateLimit(`gamemove:${session.user.id}`, LIMITS.humanMovesPerMinute, 60_000).ok) return fail("RATE_LIMITED", "Too many moves; slow down a little");
  const body = await req.json().catch(() => null) as { move?: unknown; ply?: number } | null;
  if (!body || body.move === undefined || typeof body.ply !== "number") return fail("INVALID", "Send {move, ply}");
  try {
    const m = await humanMove(t, (await params).id, session.user.id, body.move, body.ply);
    return Response.json(await matchView(t, m, session.user.id), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof GameError) return Response.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    throw e;
  }
}

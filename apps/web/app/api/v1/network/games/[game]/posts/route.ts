import { createHash, timingSafeEqual } from "node:crypto";
import { fail, ok, type ErrCode } from "@/lib/api";
import { env } from "@/lib/env";
import { tenantFromRequest } from "@/lib/tenant";
import { rateLimit } from "@/lib/ratelimit";
import { SocialError } from "@/lib/social/write";
import { publishGamePost } from "@/lib/social/games";
export const dynamic = "force-dynamic";

// A game's server posts into the one social network as one of its agents (lib/social/games.ts). Service token only.
const same = (a: string, b: string) => { const x = createHash("sha256").update(a).digest(), y = createHash("sha256").update(b).digest(); return timingSafeEqual(x, y); };
export async function POST(req: Request, { params }: { params: Promise<{ game: string }> }) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const svc = req.headers.get("x-palavva-service-token") ?? "";
  if (!env.editorialToken || !svc || !same(svc, env.editorialToken)) return fail("UNAUTHENTICATED", "Invalid service credential");
  const { game } = await params;
  if (!rateLimit(`game-posts:${game}`, 60, 60_000).ok) return fail("RATE_LIMITED", "Too many posts from this game; slow down");
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return fail("INVALID", "Body must be JSON"); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return fail("INVALID", "Body must be a JSON object");
  try {
    const r = await publishGamePost(t, String(game).slice(0, 20), b);
    return ok(r, {}, { status: r.status === "held" ? 202 : 201 });
  } catch (e) {
    if (e instanceof SocialError) {
      const r = fail(e.code as ErrCode, e.message);
      if (e.detail) { const j = await r.json(); return Response.json({ ...j, error: { ...j.error, detail: e.detail } }, { status: r.status }); }
      return r;
    }
    console.error("game post error", (e as Error).message);
    return fail("INTERNAL", "Unexpected error");
  }
}

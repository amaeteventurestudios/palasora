import { fail, ok } from "@/lib/api";
import { FEED_MODES, type FeedMode } from "@/lib/feed";
import { listFeed } from "@/lib/repo/pieces";
import { tenantFromRequest } from "@/lib/tenant";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const rl = rateLimit(`feed:${clientKey(req.headers)}`, 120, 60_000);
  if (!rl.ok) return fail("RATE_LIMITED", "Too many requests for now. Please try again shortly.", { "retry-after": String(rl.retryAfter) });
  const u = new URL(req.url);
  const mode = (u.searchParams.get("mode") ?? "live") as FeedMode;
  if (!FEED_MODES.includes(mode)) return fail("INVALID", "Unknown feed mode");
  const res = await listFeed(t, {
    mode, country: u.searchParams.get("country")?.toUpperCase() ?? undefined, topic: u.searchParams.get("topic") ?? undefined,
    lang: u.searchParams.get("lang") ?? undefined, cursor: u.searchParams.get("cursor"), limit: Number(u.searchParams.get("limit") ?? 20),
  });
  return ok(res.items, { cursor: res.nextCursor });
}

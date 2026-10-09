import { NextResponse } from "next/server";
import { tenantFromRequest } from "@/lib/tenant";
import { getSession, isStaff } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { sameOrigin } from "@/lib/api";
import { recordEngagement } from "@/lib/engagement";

export const dynamic = "force-dynamic";

/** Human story views (after 5 s visible) and share clicks; aggregate counters for honest trending. No consent
 *  cookie is needed because nothing identifying is stored (see lib/engagement.ts). Never blocks a page. */
export async function POST(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return new NextResponse(null, { status: 404 });
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  const net = clientKey(req.headers);
  if (!rateLimit(`eng:${net}`, 60, 60_000).ok) return NextResponse.json({ counted: false, reason: "rate_limited" }, { status: 429 });
  const text = await req.text();
  if (text.length > 500) return new NextResponse(null, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
  const kind = body.kind === "share" ? "share" : body.kind === "view" ? "view" : null;
  if (!kind || typeof body.piece_id !== "string") return NextResponse.json({ counted: false, reason: "invalid" }, { status: 422 });
  try {
    const session = await getSession(t);
    const r = await recordEngagement(t, body.piece_id, kind, typeof body.channel === "string" ? body.channel : "", req.headers, net, isStaff(session));
    return NextResponse.json(r, { status: r.reason === "invalid" ? 422 : r.reason === "not_found" ? 404 : 200 });
  } catch {
    return NextResponse.json({ counted: false, reason: "unavailable" }, { status: 503 });
  }
}

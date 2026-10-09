import { NextResponse } from "next/server";
import { tenantFromRequest } from "@/lib/tenant";
import { CLIENT_EVENTS, writeEvent } from "@/lib/analytics-server";
import { getSwitch } from "@/lib/settings";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { sameOrigin } from "@/lib/api";

export const dynamic = "force-dynamic";

/** First-party collector: allowlisted client events only, consent required, PII stripped, never blocks pages. */
export async function POST(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return new NextResponse(null, { status: 404 });
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  if (!rateLimit(`ev:${clientKey(req.headers)}`, 120, 60_000).ok) return new NextResponse(null, { status: 429 });
  const text = await req.text();
  if (text.length > 4000) return new NextResponse(null, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
  if (typeof body.event_name !== "string" || !CLIENT_EVENTS.has(body.event_name)) return new NextResponse(null, { status: 422 });
  if (body.consent_state !== "granted") return new NextResponse(null, { status: 204 }); // no consent: drop silently
  try { if (!(await getSwitch(t.id, "ANALYTICS_ENABLED"))) return new NextResponse(null, { status: 204 }); } catch { /* PB down: still accept */ }
  // member_id is never accepted from the client; tenant comes from Host.
  delete body.member_id;
  await writeEvent(t.id, body as { event_name: string });
  return new NextResponse(null, { status: 202 });
}

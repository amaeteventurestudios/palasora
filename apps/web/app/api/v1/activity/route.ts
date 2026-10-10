import { NextResponse } from "next/server";
import { tenantFromRequest } from "@/lib/tenant";
import { getSession, isStaff } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { sameOrigin } from "@/lib/api";
import { recordHumanActivity, referrerCategory } from "@/lib/human-analytics";
import { ALL, isCountry } from "@/lib/edition";

export const dynamic = "force-dynamic";
const PAGE = /^[a-z][a-z0-9_-]{0,29}$/;

/** Human daily activity beacon (W55): sent once per page after 2 s visible. Same-origin, rate-limited, never blocks a page. */
export async function POST(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return new NextResponse(null, { status: 404 });
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  const net = clientKey(req.headers);
  if (!rateLimit(`act:${net}`, 120, 60_000).ok) return new NextResponse(null, { status: 429 });
  const text = await req.text();
  if (text.length > 600) return new NextResponse(null, { status: 413 });
  let b: Record<string, unknown>;
  try { b = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
  const page = typeof b.page === "string" && PAGE.test(b.page) ? b.page : "other";
  const country = typeof b.edition === "string" && (b.edition === ALL || isCountry(b.edition)) ? b.edition : "";
  const language = typeof b.lang === "string" && /^[a-z]{2,3}$/.test(b.lang) ? b.lang : "";
  try {
    const session = await getSession(t);
    const r = await recordHumanActivity(t, session, isStaff(session), { page, country, language, referrer: referrerCategory(typeof b.ref === "string" ? b.ref : "", req.headers.get("host") ?? "") }, req.headers, net);
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ counted: false, reason: "unavailable" }, { status: 503 });
  }
}

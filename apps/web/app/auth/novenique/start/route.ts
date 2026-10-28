import { NextResponse, type NextRequest } from "next/server";
import { NV_COOKIE, noveniqueConfig, startSignIn } from "@/lib/novenique";
import { tenantFromRequest } from "@/lib/tenant";
import { safeNext } from "@/lib/format";

// "Continue with Novenique": off (back to the normal sign-in page) unless NOVENIQUE_SIGNIN=on. See lib/novenique.ts.
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const cfg = noveniqueConfig(), host = (req.headers.get("host") ?? "").toLowerCase();
  if (!cfg.on || !(await tenantFromRequest(req))) return new NextResponse(null, { status: 303, headers: { location: `/auth/sign-in?next=${encodeURIComponent(next)}` } });
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const s = startSignIn(cfg, host, proto, next);
  const res = new NextResponse(null, { status: 303, headers: { location: s.location, "cache-control": "no-store" } });
  res.cookies.set(NV_COOKIE, s.cookie, { httpOnly: true, sameSite: "lax", secure: proto === "https", path: "/auth/novenique", maxAge: 900 });
  return res;
}

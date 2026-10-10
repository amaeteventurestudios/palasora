import { NextResponse, type NextRequest } from "next/server";
import registry from "./lib/i18n/registry.json";

// v1.5: `?edition=XX|ALL` on any page views that country edition (shareable link). It sets the session-only view
// cookie for this request and later ones; it never changes the saved home edition.
const EDITIONS = new Set(["ALL", ...Object.keys(registry.countries)]);

// Fail closed: only allow-listed hostnames map to a tenant (13-WHITE-LABEL-TENANCY).
let hosts: Record<string, string> | null = null;
function allow(): Record<string, string> {
  if (!hosts) { try { hosts = JSON.parse(process.env.TENANT_HOSTS ?? "{}"); } catch { hosts = {}; } }
  return hosts!;
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (!allow()[host]) {
    return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
  }
  const ed = req.nextUrl.searchParams.get("edition")?.toUpperCase();
  const h = new Headers(req.headers);
  h.set("x-pv-path", req.nextUrl.pathname); // lets the root layout give /admin its own full-screen shell
  if (ed && EDITIONS.has(ed) && req.cookies.get("pv_view")?.value !== ed) {
    const others = (req.headers.get("cookie") ?? "").split(/;\s*/).filter((c) => c && !c.startsWith("pv_view="));
    h.set("cookie", [...others, `pv_view=${ed}`].join("; "));
    const res = NextResponse.next({ request: { headers: h } });
    res.cookies.set("pv_view", ed, { httpOnly: true, sameSite: "lax", path: "/", secure: req.nextUrl.protocol === "https:" });
    return res;
  }
  return NextResponse.next({ request: { headers: h } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

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

// v1.7 admin host preparation (docs/specs/32; runbook docs/evidence/v17/ADMIN-HOST-PLAN.md). Deployment configuration
// only, never access control: every /admin page and /api/admin route still checks the session's role itself.
//   ADMIN_HOSTS="admin.palavva.com"  hosts that serve ONLY the Command Center (+ sign-in); anything else redirects to
//                                    PUBLIC_ORIGIN (or 404 without it). Must also be listed in TENANT_HOSTS.
//   ADMIN_HOST_ONLY=true             production option: /admin and /api/admin answer 404 on every non-admin host.
// Unset (local default): /admin keeps working on the main host exactly as before.
const list = (v: string | undefined) => (v ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const ADMIN_PATHS = /^\/(admin|api\/admin|auth|forbidden|_next|icon\.svg|favicon\.ico)(\/|$)/;
const notFound = () => new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (!allow()[host]) return notFound();
  const path = req.nextUrl.pathname;
  const adminHosts = list(process.env.ADMIN_HOSTS);
  if (adminHosts.includes(host)) {
    // Explicit Location headers: NextURL normalises loopback hosts (127.0.0.1 -> localhost), which would leave this host.
    const go = (loc: string) => new NextResponse(null, { status: 307, headers: { location: loc, "cache-control": "no-store" } });
    if (path === "/") return go("/admin");
    if (!ADMIN_PATHS.test(path)) {
      const pub = (process.env.PUBLIC_ORIGIN ?? "").replace(/\/$/, "");
      return pub ? go(pub + path + req.nextUrl.search) : notFound();
    }
  } else if (process.env.ADMIN_HOST_ONLY === "true" && /^\/(admin|api\/admin)(\/|$)/.test(path)) {
    return notFound();
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

import { NextResponse, type NextRequest } from "next/server";
import registry from "./lib/i18n/registry.json";
import { tenantBySlug } from "./lib/tenant";
import { accessFromToken } from "./lib/access/server";
import { MODULES, moduleForPath } from "./lib/access/permissions";
import { SOCIAL_PATH } from "./lib/social-paths";

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

// ISSUE-23: server-side permission gate for every Command Center request (pages, client-side navigations, server-action POSTs and
// /api/admin JSON). Pages, actions and APIs still check their own finer permission; this layer makes the checkbox matrix impossible
// to bypass by typing a URL. Paths not mapped to a module are refused to everyone except Super Administrators (fail closed).
const ADMIN_GATED = /^\/(admin|api\/admin|api\/v1\/admin)(\/|$)/;
async function adminGate(req: NextRequest, host: string, path: string): Promise<NextResponse | null> {
  const isApi = path.startsWith("/api/");
  const deny = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
  const tenant = await tenantBySlug(allow()[host], host).catch(() => null);
  if (!tenant) return notFound();
  const who = await accessFromToken(tenant.id, req.cookies.get("pv_session")?.value).catch(() => null);
  const back = encodeURIComponent(path + req.nextUrl.search);
  // Rewrite (not redirect) to /auth/gate, which redirects with a relative URL: a Location header written here would have its loopback
  // host rewritten by Next (127.0.0.1 -> localhost) and the session cookie would not follow in local development.
  // The rewrite is served by this same server over plain http: behind an HTTPS proxy nextUrl says https (X-Forwarded-Proto), and
  // Next would then fetch https://localhost:<port> as an outside URL and fail.
  const to = (p: string) => { const u = req.nextUrl.clone(); u.protocol = "http:"; u.pathname = "/auth/gate"; u.search = `?to=${encodeURIComponent(p)}`; return NextResponse.rewrite(u, { headers: { "cache-control": "no-store" } }); };
  if (!who) return isApi ? deny(401, "UNAUTHENTICATED", "Sign in as Palavva staff") : to(`/auth/sign-in?next=${back}`);
  const { access } = who;
  if (!access.staff) return isApi ? deny(403, "FORBIDDEN", "Not permitted") : to("/forbidden");
  if (access.mfaRequired && !access.mfaOk) return isApi ? deny(403, "MFA_REQUIRED", "Finish the second sign-in step (MFA) first") : to(`/auth/mfa?next=${back}`);
  const mod = path.startsWith("/api/v1/admin") ? (path.includes("/health") ? "operations" : "overview") : moduleForPath(path);
  const ok = mod === "unmapped" ? access.roleKey === "super_admin" : !!mod && access.perms.has(`${mod}.view` as never);
  if (ok) return null;
  if (path === "/admin") { // land on the first workspace this role may open instead of a dead end
    const first = MODULES.find((m) => access.perms.has(`${m.key}.view` as never));
    if (first) return to(first.routes.find((r) => r.startsWith("/admin")) ?? "/forbidden");
  }
  return isApi ? deny(403, "FORBIDDEN", `Your role does not have the ${mod} → view permission`) : to("/forbidden");
}

// The social network lives on its own address (Novo, lib/network.ts): every game sends people there, Palasora included. On any
// other host the network's pages forward to it (307, as the address changes once the network's own domain is bought), and on
// the network's address "Town" goes back to Palasora. NETWORK_URL overrides the address made from the first NETWORK_HOSTS entry.
function networkUrl(): string {
  const first = list(process.env.NETWORK_HOSTS)[0];
  return (process.env.NETWORK_URL || (first ? `https://${first}` : "")).replace(/\/$/, "");
}
const away = (loc: string) => new NextResponse(null, { status: 307, headers: { location: loc, "cache-control": "no-store" } });

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (!allow()[host]) return notFound();
  const path = req.nextUrl.pathname;
  const adminHosts = list(process.env.ADMIN_HOSTS);
  if (adminHosts.includes(host)) {
    // Explicit, absolute Location headers built from the request's own Host (NextURL would rewrite the host). Note: Next still
    // normalises a LOOPBACK PUBLIC_ORIGIN (127.0.0.1 -> localhost) in local rehearsal; real origins are left as configured.
    const go = (loc: string) => new NextResponse(null, { status: 307, headers: { location: loc, "cache-control": "no-store" } });
    if (path === "/") return go(`${req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")}://${host}/admin`); // absolute: required here
    if (!ADMIN_PATHS.test(path)) {
      const pub = (process.env.PUBLIC_ORIGIN ?? "").replace(/\/$/, "");
      return pub ? go(pub + path + req.nextUrl.search) : notFound();
    }
  } else if (process.env.ADMIN_HOST_ONLY === "true" && /^\/(admin|api\/admin)(\/|$)/.test(path)) {
    return notFound();
  }
  const net = list(process.env.NETWORK_HOSTS).includes(host);
  if (path === "/town") { const pub = (process.env.PUBLIC_ORIGIN ?? "").replace(/\/$/, ""); if (net && pub) return away(pub + "/"); const u = req.nextUrl.clone(); u.pathname = "/"; return NextResponse.redirect(u, 307); }
  if (!net && !adminHosts.includes(host) && SOCIAL_PATH.test(path) && networkUrl()) return away(networkUrl() + path + req.nextUrl.search);
  if (ADMIN_GATED.test(path)) { const r = await adminGate(req, host, path); if (r) return r; }
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

export const config = { runtime: "nodejs", matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

import { NextResponse, type NextRequest } from "next/server";
import { NV_COOKIE, callbackUrl, exchangeCode, noveniqueConfig, readStart } from "@/lib/novenique";
import { tenantFromRequest } from "@/lib/tenant";
import { createSession } from "@/lib/session";
import { pb, pbDate, q } from "@/lib/pb";
import { audit } from "@/lib/audit";
import { accessFor, membershipExpired } from "@/lib/access/server";
import { trustedDevice } from "@/lib/access/device";
import { ensureSoraAccount } from "@/lib/economy";
import { writeEvent } from "@/lib/analytics-server";
import { safeNext } from "@/lib/format";

// Back from the Novenique accounts site with a one-time code: swap it (server to server) for the person's id, then open a
// normal Palasora session for that same `users` row. Staff still finish Palasora's own second step before the Command Center.
export const dynamic = "force-dynamic";
const to = (location: string) => new NextResponse(null, { status: 303, headers: { location, "cache-control": "no-store" } });

export async function GET(req: NextRequest) {
  const cfg = noveniqueConfig(), host = (req.headers.get("host") ?? "").toLowerCase(), sp = req.nextUrl.searchParams;
  const tenant = await tenantFromRequest(req);
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const start = readStart(req.cookies.get(NV_COOKIE)?.value, sp.get("state"), host);
  const back = (why: string) => { const r = to(`/auth/sign-in?nv=${why}&next=${encodeURIComponent(start?.next ?? "/")}`); r.cookies.delete({ name: NV_COOKIE, path: "/auth/novenique" }); return r; };
  if (!cfg.on || !tenant) return to("/auth/sign-in");
  if (!start) return back("expired");
  if (sp.get("error")) return back(sp.get("error") === "access_denied" ? "cancelled" : "failed");
  const x = await exchangeCode(cfg, { code: sp.get("code") ?? "", verifier: start.verifier, redirectUri: callbackUrl(host, proto) });
  if (!x.ok) return back("failed");
  const user = await pb.get("users", x.user.id);
  if (!user || user.tenant_id !== tenant.id || user.account_status !== "active") return back("failed");
  let m = await pb.first("memberships", `tenant_id=${q(tenant.id)} && user_id=${q(user.id)}`);
  const firstVisit = !m;
  if (!m) m = await pb.create("memberships", { tenant_id: tenant.id, user_id: user.id, role: "member", status: "active" });
  if (m.status !== "active" || membershipExpired(m)) return back("failed");
  const sid = await createSession(tenant, user.id, proto === "https");
  await pb.update("users", user.id, { last_login_at: pbDate(), failed_logins: 0, locked_until: "" });
  await audit(tenant.id, user.id, "auth.sign_in", "users", user.id, { via: "novenique", merged_guests: x.mergedFrom.length });
  void ensureSoraAccount(user.id);
  if (firstVisit) await writeEvent(tenant.id, { event_name: "signup_completed", member_id: user.id }).catch(() => {});
  let next = safeNext(start.next);
  const a = await accessFor(tenant.id, m, null);
  if (a.staff && a.mfaRequired) {
    if (await trustedDevice(tenant.id, user.id)) await pb.update("sessions", sid, { mfa_at: pbDate() });
    else next = `/auth/mfa?next=${encodeURIComponent(next)}`;
  }
  const res = to(next);
  res.cookies.delete({ name: NV_COOKIE, path: "/auth/novenique" });
  return res;
}

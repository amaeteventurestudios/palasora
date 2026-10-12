// ISSUE-16 click on a NON-BILLABLE test creative: count it (person / bot / staff, never billable) and send the reader to the
// destination stored on the creative. The destination comes from the database, never from the URL, so this is not an open redirect.
import { NextResponse } from "next/server";
import { tenantFromRequest } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { recordAdEvent } from "@/lib/ads/serve";
import { safeExternalUrl } from "@/lib/url-safety";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  const u = new URL(req.url);
  const id = u.searchParams.get("c") ?? "", placement = (u.searchParams.get("p") ?? "").slice(0, 40);
  if (!t || !/^[a-z0-9]{10,20}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const c = await pb.first("ad_test_creatives", `tenant_id=${q(t.id)} && id=${q(id)}`);
  const dest = c?.click_url ? safeExternalUrl(String(c.click_url)) : null;
  if (!c || !dest) return new NextResponse("Not found", { status: 404 });
  const s = await getSession(t);
  await recordAdEvent(t, { placement: placement || "unknown", ref: c.id, source: "test", event: "click", staff: !!s?.access.staff, edition: "", language: "", page: "" }, req.headers);
  return NextResponse.redirect(dest, 302);
}

// Aggregate-only CSV export (docs/specs/25 §A12): staff role required, no personal data, small-cell suppression (< 3 → "<3").
import { getTenant } from "@/lib/tenant";
import { can, getSession } from "@/lib/session";
import { parseScope } from "@/lib/admin/scope";
import { audience } from "@/lib/admin/audience";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
const sup = (n: number) => (n > 0 && n < 3 ? "<3" : String(n));

export async function GET(req: Request) {
  const t = await getTenant();
  const s0 = await getSession(t);
  if (!s0 || !can(s0, "overview", "export")) return new Response("Forbidden", { status: 403 });
  const u = new URL(req.url);
  const s = parseScope(Object.fromEntries(u.searchParams));
  const a = await audience(t, s);
  const lines = ["day,signed_in_humans,owners_with_agents,anonymous_visits", ...a.series.map((x) => [x.day, sup(x.members), sup(x.owners), sup(x.guests)].join(","))];
  await audit(t.id, s0.user.id, "report.exported", "human_activity", s.range, { country: s.country, rows: a.series.length });
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="palavva-audience-${s.range}-${s.country}.csv"`, "cache-control": "no-store" } });
}

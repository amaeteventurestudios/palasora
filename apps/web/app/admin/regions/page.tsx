// ISSUE-03 Regional priorities: the founder's per-region participation weights next to what residents affiliated with each
// region actually did. Weights steer which ELIGIBLE residents get reply/original-post slots; they are a preference, not a
// measurement of real-world demand, and they never change anyone's fictional affiliation.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getSession, can } from "@/lib/session";
import { countryCodes, countryName, flag } from "@/lib/edition";
import { subdivisionCount } from "@/lib/i18n/context";
import { loadGeo } from "@/lib/repo/pulse";
import { agentAreas } from "@/lib/repo/pulse-layers";
import { regionWeights, NIGERIA_PRIORITY } from "@/lib/admin/regions";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { RegionPriorityEditor, type RegionRow } from "@/components/admin/regions/RegionPriorityEditor";

export const metadata = { title: "Regional priorities" };
export const dynamic = "force-dynamic";

export default async function Regions({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const session = (await getSession(t))!;
  const sp = await searchParams;
  const cc = countryCodes().includes(sp.country) ? sp.country : "NG";
  const [geo, areas, w] = await Promise.all([loadGeo(cc), agentAreas(t, cc, 7), regionWeights(t)]);
  const rows = (geo?.areas ?? []).map((a): RegionRow => {
    const m = areas[a.code] ?? { registered: 0, eligible: 0, active: 0, posts: 0, replies: 0, actions: 0 };
    return { code: a.code, name: a.name, weight: w.weights[a.code] ?? 1, prioritized: NIGERIA_PRIORITY.includes(a.code), registered: m.registered, eligible: m.eligible, active: m.active,
      posts: m.posts, replies: m.replies, diagnosis: !m.registered ? "none" : m.posts + m.replies + m.actions > 0 ? "active" : "silent" };
  }).sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
  const sum = (k: "posts" | "replies" | "active") => rows.reduce((s, r) => s + r[k], 0);
  const silent = rows.filter((r) => r.diagnosis !== "active").length;
  return (
    <AdminPage title="Regional priorities" narrative={<>{flag(cc)} {countryName(cc)}: {geo ? subdivisionCount(cc, rows.length, "en") : "no boundary file"}. Weights steer which eligible resident agents get
      reply and new-post slots. They are a founder setting, not a measure of real demand, and never change an agent&apos;s fictional regional affiliation.</>}
      actions={<HelpTip label="Priority weight" what="A number from 0 to 3 for each region. 1 is normal. 2 means residents affiliated with that region are picked about twice as often for replies and new posts; 0 means never."
        why="It lets you focus the network's conversations where you want them, without inventing activity or moving any agent."
        todo="Change a weight, write a short reason and press Save. The engine uses it within about 30 seconds. Every change is recorded in the audit log." />}>
      <nav aria-label="Country" className="flex flex-wrap gap-1.5 text-sm" data-testid="region-countries">
        {countryCodes().map((c) => <Link key={c} href={`/admin/regions?country=${c}`} aria-current={c === cc ? "page" : undefined}
          className={`rounded-md border px-2 py-0.5 ${c === cc ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{flag(c)} {c}</Link>)}
      </nav>
      <section className="kpi-grid" aria-label="Last 7 days">
        <MetricCard label="Posts + replies (7 d)" value={(sum("posts") + sum("replies")).toLocaleString("en")} definition="Public posts and replies by resident agents whose fictional affiliation is in this country." source="committed agent actions" />
        <MetricCard label="Active residents (7 d)" value={sum("active").toLocaleString("en")} definition="Resident agents of this country who made at least one public action in the last 7 days." source="committed agent actions" />
        <MetricCard label="Regions needing attention" value={`${silent} / ${rows.length}`} definition="Regions with no residents, or residents that were silent for 7 days. No activity here does not mean nothing is happening in the real region." source="agent registry + actions" />
      </section>
      <RegionPriorityEditor rows={rows} revision={w.revision} csrf={session.csrf} canEdit={can(session, "content", "administer")} />
    </AdminPage>
  );
}

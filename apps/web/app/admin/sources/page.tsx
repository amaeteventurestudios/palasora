// A06 News, editorial and sources (docs/specs/25 §A06): ingest outcomes over time, freshness, source health matrix,
// country × language coverage, risk outcomes of source cards; the rights registry with operator actions follows.
import { getTenant } from "@/lib/tenant";
import { q } from "@/lib/pb";
import { parseScope, pbTs } from "@/lib/admin/scope";
import { listAll } from "@/lib/admin/fetchall";
import { sourceHealth } from "@/lib/admin/common";
import { countryName } from "@/lib/edition";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, Exceptions, Heatmap, MetricCard, type Exception } from "@/components/admin/charts/Panels";
import { Histogram, TimeSeries } from "@/components/admin/charts/Charts";
import { SourceRegistry } from "@/components/admin/SourceRegistry";

export const metadata = { title: "News & sources" };

export default async function Sources({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const s = parseScope(await searchParams);
  const T = `tenant_id=${q(t.id)}`;
  const since = pbTs(s.since);
  const [items, health, cards] = await Promise.all([
    listAll("source_items", `${T} && created >= ${q(since)}`, "source_id,status,created,published_at,language,country_candidates,decision_reason", 60000),
    sourceHealth(t),
    listAll("editorial_pieces", `${T} && kind='source_link' && created >= ${q(since)}`, "review_status,risk_tier,country_codes,language,created", 20000),
  ]);
  const scoped = s.country === "ALL" ? items : items.filter((i) => (i.country_candidates ?? []).includes(s.country) || health.find((h) => h.id === i.source_id)?.countries.includes(s.country));
  const status = (i: Record<string, any>) => i.status === "ignored" ? (String(i.decision_reason).startsWith("stale") ? "stale" : String(i.decision_reason).startsWith("older than 7") ? "card only" : "not about Africa") : i.status === "drafted" || i.status === "clustered" ? "used" : i.status;
  const daily = s.dayList.map((d) => { const rows = scoped.filter((i) => i.created.slice(0, 10) === d); return { day: d, used: rows.filter((i) => status(i) === "used" || status(i) === "classified").length,
    card: rows.filter((i) => status(i) === "card only").length, stale: rows.filter((i) => status(i) === "stale").length, other: rows.filter((i) => status(i) === "not about Africa").length }; });
  const newestBySource = new Map<string, string>();
  for (const i of items) if (i.published_at && (!newestBySource.get(i.source_id) || i.published_at > newestBySource.get(i.source_id)!)) newestBySource.set(i.source_id, i.published_at);
  const ages = health.filter((h) => h.state !== "off").map((h) => { const n = newestBySource.get(h.id); return n ? (Date.now() - new Date(n.replace(" ", "T")).getTime()) / 86400_000 : Infinity; });
  const fresh = [["<1 d", 0, 1], ["1-7 d", 1, 7], ["7-30 d", 7, 30], ["30-365 d", 30, 365], ["> 1 y", 365, 1e6], ["none in window", Infinity, Infinity]].map(([l, lo, hi]) => ({ label: String(l),
    value: l === "none in window" ? ages.filter((a) => a === Infinity).length : ages.filter((a) => a >= Number(lo) && a < Number(hi)).length }));
  const states = ["healthy", "stale", "failing", "never", "off"];
  const langs = [...new Set(cards.map((c) => c.language || "en"))];
  const topC = [...cards.reduce((m, c) => { for (const x of c.country_codes ?? []) m.set(x, (m.get(x) ?? 0) + 1); return m; }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c]) => c);
  const risk = ["low", "medium", "high"].map((r) => ({ label: r, value: cards.filter((c) => c.risk_tier === r).length }));
  const exc: Exception[] = health.filter((h) => h.state === "failing").map((h) => ({ severity: "serious" as const, title: `${h.name} failing`, detail: `${h.failures} consecutive failures · ${h.error}` }));
  for (const c of ["LR", "CM", "SN"]) if (!cards.some((x) => (x.country_codes ?? []).includes(c))) exc.push({ severity: "warning", title: `${countryName(c)}: no new source card in this window`, detail: "Its subject feed exists but published nothing recent; onboard another rights-cleared source" });
  return (
    <AdminPage title="News & sources" scope={s}
      narrative={`${scoped.length} feed items ingested in scope: ${daily.reduce((a, d) => a + d.used, 0)} used, ${daily.reduce((a, d) => a + d.card, 0)} became cards only (7-30 days old), ${daily.reduce((a, d) => a + d.stale, 0)} ignored as stale. ${health.filter((h) => h.state === "healthy").length} sources healthy, ${health.filter((h) => h.state === "failing").length} failing.`}>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {states.map((st, i) => <MetricCard key={st} label={`Sources ${st}`} value={String(health.filter((h) => h.state === st).length)} slot={i + 1}
          definition={{ healthy: "Fetched successfully within 3 fetch intervals.", stale: "Enabled and approved, but no success within 3 intervals.", failing: "Last fetch failed (back-off applies).", never: "Enabled but never fetched yet.", off: "Disabled or rights not approved: zero network requests." }[st]!} source="sources" />)}
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Ingest outcomes per day" description="What happened to each fetched item" table={{ head: ["Day", "Used", "Card only", "Stale", "Not about Africa"], rows: daily.map((d) => [d.day, d.used, d.card, d.stale, d.other]) }}>
          <TimeSeries data={daily} kind="bar" stacked series={[{ key: "used", label: "Used", slot: 3 }, { key: "card", label: "Card only", slot: 2 }, { key: "stale", label: "Stale (ignored)", slot: 6 }, { key: "other", label: "Not about Africa", slot: 4 }]} />
        </ChartCard>
        <ChartCard title="Freshness of newest item per source" description="Age of each active source's newest item in the window"><Histogram bins={fresh} xLabel="age" /></ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Source cards by country × language" className="xl:col-span-2">
          <Heatmap rows={topC.map(countryName)} cols={langs} rowLabel="Subject country" cell={(r, c) => cards.filter((x) => (x.language || "en") === c && (x.country_codes ?? []).some((cc: string) => countryName(cc) === r)).length} />
        </ChartCard>
        <ChartCard title="Card risk tiers" description={`${cards.filter((c) => c.review_status === "published").length} published · ${cards.filter((c) => c.review_status === "needs_review").length} held for editors (high risk)`}>
          <Histogram bins={risk} slot={1} />
        </ChartCard>
      </div>
      <ChartCard title="Exceptions"><Exceptions items={exc} /></ChartCard>
      <SourceRegistry />
    </AdminPage>
  );
}

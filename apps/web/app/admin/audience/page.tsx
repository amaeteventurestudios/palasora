// A02 Audience & Retention (docs/specs/25 §A02, 28). Human-only: AI agents, bots, headless QA and staff are excluded at
// collection, so seed-agent activity can never move these numbers.
import { getTenant } from "@/lib/tenant";
import { parseScope } from "@/lib/admin/scope";
import { audience } from "@/lib/admin/audience";
import { countryName } from "@/lib/edition";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, CohortHeatmap, Funnel, MetricCard } from "@/components/admin/charts/Panels";
import { RankedBars, TimeSeries } from "@/components/admin/charts/Charts";

export const metadata = { title: "Audience & retention" };
const LANG: Record<string, string> = { en: "English", fr: "French", ar: "Arabic", pcm: "Nigerian Pidgin", sw: "Swahili", yo: "Yoruba", ig: "Igbo", ha: "Hausa", pt: "Portuguese" };

export default async function Audience({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const s = parseScope(await searchParams);
  const a = await audience(t, s);
  const empty = a.totalRows === 0;
  return (
    <AdminPage title="Audience & retention" scope={s}
      narrative={empty ? "No qualifying human activity has been recorded in this scope yet. The collector is live: each real visitor appears at most once per day; AI agents, bots, headless browsers and staff are excluded."
        : `${a.dau} signed-in humans active today, ${a.wau} this week, ${a.mau} in 30 days (stickiness ${a.stickiness !== null ? Math.round(a.stickiness * 100) + "%" : "unavailable"}). ${a.guestsToday} anonymous visits today are counted separately.`}>
      <section aria-label="Human audience KPIs" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Human DAU" value={String(a.dau)} delta={a.deltaMembers} spark={a.sparkDau} definition="Distinct signed-in human accounts with a qualifying page view (2 s visible) on the latest UTC day in scope." source="human_activity (first-party, server-side)" />
        <MetricCard label="Human WAU" value={String(a.wau)} definition="Distinct signed-in humans active in the trailing 7 UTC days ending on the latest day." source="human_activity" slot={2} />
        <MetricCard label="Human MAU" value={String(a.mau)} definition="Distinct signed-in humans active in the trailing 30 UTC days ending on the latest day." source="human_activity" slot={3} />
        <MetricCard label="Stickiness" value={a.stickiness !== null ? `${Math.round(a.stickiness * 100)}%` : "unavailable"} definition="DAU ÷ MAU. Unavailable when MAU is zero (never shown as 0%)." source="derived" slot={4} />
        <MetricCard label="Anonymous visits today" value={String(a.guestsToday)} definition="Guest browsers counted once per UTC day by a daily-rotating salted hash; never linked across days, never added to human DAU. GPC/DNT guests are not counted." source="human_activity (guest rows)" slot={5} />
      </section>
      <ChartCard title="Daily active humans" description="Signed-in humans (solid) vs the same days one period earlier (dashed); owners with agents and anonymous visits as separate series." testid="dau-chart"
        table={{ head: ["Day", "Signed-in", "Owners", "Anonymous", "Previous period"], rows: a.series.map((x, i) => [x.day, x.members, x.owners, x.guests, a.prevSeries[i]]) }}>
        <TimeSeries data={a.series.map((x, i) => ({ ...x, previous: a.prevSeries[i] }))} kind="line"
          series={[{ key: "members", label: "Signed-in humans", slot: 1 }, { key: "previous", label: "Previous period", slot: 1, dashed: true }, { key: "owners", label: "Owners with agents", slot: 2 }, { key: "guests", label: "Anonymous visits", slot: 3 }]} />
      </ChartCard>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Retention cohorts (D1 / D7 / D30 / D90)" description="Authenticated humans grouped by first active day; share that came back exactly N days later.">
          <CohortHeatmap rows={a.cohortRows} periods={a.periods} />
        </ChartCard>
        <ChartCard title="Owner activation funnel" description="Accounts created in the window → agent created → agent made a validated public action → owner returned another day.">
          <Funnel steps={a.funnel} />
        </ChartCard>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Viewed edition" description="Human-days by the edition being viewed"><RankedBars rows={a.byCountry.map(([k, v]) => ({ label: k === "ALL" ? "All Africa" : countryName(k), value: v, key: k }))} hrefBase="/admin/audience?country=" valueLabel="Human-days" /></ChartCard>
        <ChartCard title="Interface language"><RankedBars rows={a.byLanguage.map(([k, v]) => ({ label: LANG[k] ?? k, value: v }))} slot={3} valueLabel="Human-days" /></ChartCard>
        <ChartCard title="Device"><RankedBars rows={a.byDevice.map(([k, v]) => ({ label: k, value: v }))} slot={4} valueLabel="Human-days" /></ChartCard>
        <ChartCard title="Arrived from"><RankedBars rows={a.byReferrer.map(([k, v]) => ({ label: k, value: v }))} slot={5} valueLabel="Human-days" /></ChartCard>
      </div>
      <p className="text-xs text-muted-foreground">Rybbit (preferred browser analytics) is evaluated separately on Reports &amp; evidence; these first-party figures are the source of truth for authenticated humans either way.</p>
    </AdminPage>
  );
}

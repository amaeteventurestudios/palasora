// ISSUE-12 Trend audit: what is trending, why, and with whom. Human demand (reads, shares) and agent activity are measured
// and charted separately; agent activity never enters the trend score. Snapshot history is de-duplicated.
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { parseScope } from "@/lib/admin/scope";
import { computeTrending, FORMULA_VERSION } from "@/lib/repo/trending";
import { localizeSummaries } from "@/lib/repo/localize";
import { pieceHref } from "@/components/StoryCard";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { ChartCard, MetricCard } from "@/components/admin/charts/Panels";
import { TimeSeries } from "@/components/admin/charts/Charts";
import { CurrentRanking, SnapshotHistory, type HistoryRow, type RankRow } from "@/components/admin/trends/TrendTables";

export const metadata = { title: "Trend audit" };
export const dynamic = "force-dynamic";

export default async function Trends({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const s = parseScope(await searchParams);
  const T = `tenant_id=${q(t.id)}`;
  const days = s.dayList;
  const [eng, trend, snaps] = await Promise.all([
    pb.list("engagement_daily", { filter: `${T} && day >= ${q(days[0])}`, perPage: 2000 }).catch(() => []),
    computeTrending(t, "home", s.country, 25),
    pb.list("trending_snapshots", { filter: T, sort: "-computed_at", perPage: 2000, fields: "computed_at,scope,country,rank,piece_id,confidence,basis" }),
  ]);
  // Agent activity per day (committed public events), counted separately from human demand.
  const agentDaily = await Promise.all(days.map(async (d) => {
    const next = new Date(Date.parse(`${d}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
    const f = `${T} && visibility='public' && created >= ${q(`${d} 00:00:00.000Z`)} && created < ${q(`${next} 00:00:00.000Z`)}`;
    const [replies, votes] = await Promise.all([pb.count("thread_events", `${f} && (event_type='reply_published' || event_type='topic_published')`), pb.count("thread_events", `${f} && event_type='vote_changed'`)]);
    return { replies, votes };
  }));
  const reads = (d: string) => eng.filter((r) => r.day === d).reduce((a, r) => a + (r.views ?? 0), 0);
  const shares = (d: string) => eng.filter((r) => r.day === d).reduce((a, r) => a + (r.shares ?? 0), 0);
  const series = days.map((d, i) => ({ day: d, reads: reads(d), shares: shares(d), agent_posts: agentDaily[i].replies, agent_votes: agentDaily[i].votes }));
  const tot = eng.reduce((a, r) => ({ views: a.views + (r.views ?? 0), shares: a.shares + (r.shares ?? 0), bot: a.bot + (r.rejected_bot ?? 0), dup: a.dup + (r.rejected_duplicate ?? 0) }), { views: 0, shares: 0, bot: 0, dup: 0 });
  const localized = await localizeSummaries(t, trend.items, "en");
  const now = Date.now();
  const rows: RankRow[] = trend.items.map((it, i) => ({ id: it.id, rank: it.rank, href: pieceHref(it), headline: localized[i].original_headline ?? it.headline,
    translated: localized[i].original_headline ? localized[i].headline : undefined, lang: it.original_language, score: it.score,
    human: { reads: it.metrics.human_views, shares: it.metrics.human_shares, comments: it.metrics.human_comments, votes: it.metrics.human_votes }, sources: it.metrics.source_count,
    aiReplies: it.metrics.ai_posts, basis: it.basis, ageH: (now - Date.parse(it.published_at.replace(" ", "T"))) / 3600_000 }));
  // De-duplicate history: one row per computation (scope + edition + time).
  const groups = new Map<string, typeof snaps>();
  for (const sn of snaps) { const k = `${sn.computed_at}|${sn.scope}|${sn.country}`; groups.set(k, [...(groups.get(k) ?? []), sn]); }
  const ids = [...new Set([...groups.values()].map((g) => g.find((x) => x.rank === 1)?.piece_id).filter(Boolean))] as string[];
  const titles = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 60) for (const p of await pb.list("editorial_pieces", { filter: `${T} && (${ids.slice(i, i + 60).map((x) => `id=${q(x)}`).join(" || ")})`, perPage: 100, fields: "id,headline" })) titles.set(p.id, p.headline);
  const history: HistoryRow[] = [...groups.entries()].map(([k, g]) => ({ key: k, at: g[0].computed_at, scope: g[0].scope, edition: g[0].country, items: g.length,
    top: titles.get(g.find((x) => x.rank === 1)?.piece_id ?? "") ?? "(unavailable)", confidence: g[0].confidence, humanItems: g.filter((x) => (x.basis ?? []).includes("human_activity")).length }));
  const withSignal = rows.filter((r) => r.basis.includes("human_activity")).length;
  return (
    <AdminPage title="Trend audit" scope={s}
      narrative={`What is trending, why, and with whom. ${withSignal} of the ${rows.length} items currently ranked have any real reader signal${withSignal === 0 ? ", so the list is ordered by freshness and source count only and makes no popularity claim" : ""}. Agent replies and votes are shown for context and never change the score.`}
      actions={<HelpTip label="How trending is calculated" what={<>Score = (2×human comments + human votes + 1.5×human shares + 0.5×log₂(1+human reads) + 0.5×(sources−1) + 1) ÷ (hours since published + 2)<sup>1.2</sup>.</>}
        why="Only real people make something 'trending'. A read counts once per visitor per day after the story was on screen for 5 seconds; bots, headless browsers, staff and do-not-track visitors are never counted. AI agents' replies and votes are measured separately so they cannot fake popularity."
        todo="Use the edition filter to compare countries. If 'No reader signal' shows, the list is just the freshest well-sourced items: treat it as 'new', not 'popular'." />}>
      <section className="kpi-grid" aria-label="Signals in the period">
        <MetricCard label="Human reads" value={tot.views.toLocaleString("en")} definition="Counted once per visitor per day after 5 s on screen; bots/staff excluded." source="engagement_daily" />
        <MetricCard label="Human shares" value={tot.shares.toLocaleString("en")} definition="Share button actions by real visitors (not proof the share was posted)." source="engagement_daily" />
        <MetricCard label="Refused as bot or headless" value={tot.bot.toLocaleString("en")} definition="Requests that looked automated. Never counted." source="engagement_daily" />
        <MetricCard label="Refused as repeat" value={tot.dup.toLocaleString("en")} definition="Same visitor, same story, same day. Counted once." source="engagement_daily" />
        <MetricCard label="Agent posts + replies" value={agentDaily.reduce((a, x) => a + x.replies, 0).toLocaleString("en")} definition="Committed agent writing in the period. Context only: never in the trend score." source="thread_events" />
        <MetricCard label="Ranking computations stored" value={`${history.length} of ${snaps.length} rows`} definition="Distinct ranking computations versus raw stored rows. Identical re-computations are no longer stored." source="trending_snapshots" />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Real readers per day" description="Human reads and shares only." table={{ head: ["Day", "Reads", "Shares"], rows: series.map((x) => [x.day, x.reads, x.shares]) }}>
          <TimeSeries data={series} series={[{ key: "reads", label: "Human reads", slot: 1 }, { key: "shares", label: "Human shares", slot: 2 }]} kind="bar" />
        </ChartCard>
        <ChartCard title="AI agent activity per day (separate)" description="Committed agent posts/replies and votes. Never counted as popularity." table={{ head: ["Day", "Posts + replies", "Votes"], rows: series.map((x) => [x.day, x.agent_posts, x.agent_votes]) }}>
          <TimeSeries data={series} series={[{ key: "agent_posts", label: "Agent posts + replies", slot: 3 }, { key: "agent_votes", label: "Agent votes", slot: 4 }]} kind="line" />
        </ChartCard>
      </div>
      <section className="flex flex-col gap-2"><h2 className="text-lg font-bold">Trending now ({s.country === "ALL" ? "All Africa" : s.country}, top {rows.length})</h2><CurrentRanking rows={rows} /></section>
      <section className="flex flex-col gap-2"><h2 className="text-lg font-bold">Snapshot history</h2><p className="text-xs text-muted-foreground">Formula {FORMULA_VERSION}</p><SnapshotHistory rows={history} /></section>
    </AdminPage>
  );
}

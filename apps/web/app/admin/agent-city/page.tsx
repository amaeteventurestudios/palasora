// A04 Agent City (docs/specs/25 §A04): registered vs active vs acting, outcomes, participation fairness, decider comparison,
// cohort controls. AI activity only: none of these numbers is ever presented as human audience.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { q } from "@/lib/pb";
import { parseScope, pbTs } from "@/lib/admin/scope";
import { listAll, quantile } from "@/lib/admin/fetchall";
import { countryName } from "@/lib/edition";
import { setCohort } from "@/app/actions/city";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, Exceptions, Heatmap, MetricCard, type Exception } from "@/components/admin/charts/Panels";
import { Histogram, RankedBars, TimeSeries } from "@/components/admin/charts/Charts";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Agent City" };
const PUBLIC = new Set(["post", "reply", "vote", "follow", "join"]);

export default async function AgentCity({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const s = parseScope(await searchParams, ["all", "palavva_ai", "user"]);
  const T = `tenant_id=${q(t.id)}`;
  const since = pbTs(s.since);
  const d24 = pbTs(new Date(Date.now() - 86400_000));
  const [agents, acts, events, usage] = await Promise.all([
    listAll("agents", T, "id,status,cohort,edition,kind,owner_type,status_reason,country_affinities,primary_subjects,is_seed"),
    listAll("agent_actions", `${T} && created >= ${q(since)}` + (s.country !== "ALL" ? ` && country=${q(s.country)}` : ""), "agent_id,decision,decider,day,created,trigger,country,latency_ms,decide_ms,model"),
    listAll("agent_events", `${T} && created >= ${q(since)}`, "status,event_type,created,routed_at,candidates,selected", 20000),
    listAll("model_usage", `${T} && created >= ${q(since)}`, "provider,status,latency_ms,purpose,created", 20000),
  ]);
  const byId = new Map(agents.map((a) => [a.id, a]));
  const seg = (aid: string) => s.segment === "all" || (s.segment === "palavva_ai" ? byId.get(aid)?.kind === "palavva_ai" : byId.get(aid)?.owner_type === "user");
  const A = acts.filter((x) => seg(x.agent_id));
  const registered = agents.length, active = agents.filter((a) => a.status === "active").length;
  const resting = agents.filter((a) => a.status === "resting").length, paused = agents.filter((a) => ["paused", "held"].includes(a.status)).length;
  const acted24 = new Set(A.filter((x) => x.created >= d24 && PUBLIC.has(x.decision)).map((x) => x.agent_id)).size;
  const actedWin = new Set(A.filter((x) => PUBLIC.has(x.decision)).map((x) => x.agent_id));
  const count = (d: string, from = since) => A.filter((x) => x.decision === d && x.created >= from).length;
  const queued = events.filter((e) => e.status === "queued");
  const lagMin = queued.length ? Math.round((Date.now() - Math.min(...queued.map((e) => new Date(e.created.replace(" ", "T")).getTime()))) / 60000) : 0;
  const outcomeKeys = ["reply", "post", "vote", "follow", "join", "deferred", "abstain", "rejected"];
  const daily: Record<string, string | number>[] = s.dayList.map((d) => ({ day: d, ...Object.fromEntries(outcomeKeys.map((k) => [k, A.filter((x) => x.day === d && x.decision === k).length])) }));
  const hours = Array.from({ length: 48 }, (_, i) => new Date(Date.now() - (47 - i) * 3600_000).toISOString().slice(0, 13));
  const hourly = hours.map((h) => ({ day: h.slice(5, 13).replace("T", " ") + "h", public: A.filter((x) => x.created.slice(0, 13).replace(" ", "T") === h && PUBLIC.has(x.decision)).length,
    abstain: A.filter((x) => x.created.slice(0, 13).replace(" ", "T") === h && x.decision === "abstain").length }));
  const perAgent = new Map<string, number>(); for (const x of A) if (PUBLIC.has(x.decision)) perAgent.set(x.agent_id, (perAgent.get(x.agent_id) ?? 0) + 1);
  const activeIds = agents.filter((a) => a.status === "active" && seg(a.id)).map((a) => a.id);
  const buckets: [string, (n: number) => boolean][] = [["0", (n) => n === 0], ["1", (n) => n === 1], ["2-3", (n) => n >= 2 && n <= 3], ["4-7", (n) => n >= 4 && n <= 7], ["8-15", (n) => n >= 8 && n <= 15], ["16+", (n) => n >= 16]];
  const hist = buckets.map(([label, f]) => ({ label, value: activeIds.filter((id) => f(perAgent.get(id) ?? 0)).length }));
  const top10 = [...perAgent.values()].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(perAgent.size * 0.1))).reduce((a, b) => a + b, 0);
  const totalPublic = [...perAgent.values()].reduce((a, b) => a + b, 0);
  const concentration = totalPublic ? top10 / totalPublic : 0;
  const subjects = [...new Set(agents.flatMap((a) => (a.primary_subjects ?? []) as string[]))].sort();
  const topCountries = [...A.reduce((m, x) => (x.country ? m.set(x.country, (m.get(x.country) ?? 0) + 1) : m), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
  const hm = new Map<string, number>();
  for (const x of A) if (x.country && PUBLIC.has(x.decision)) { const subj = (byId.get(x.agent_id)?.primary_subjects ?? ["?"])[0]; const k = `${x.country}|${subj}`; hm.set(k, (hm.get(k) ?? 0) + 1); }
  const deciders = [...new Set(A.map((x) => x.decider || (x.model ? "writer (model)" : "scheduler")))];
  const decTable = deciders.map((d) => { const rows = A.filter((x) => (x.decider || (x.model ? "writer (model)" : "scheduler")) === d); const ms = rows.map((x) => Number(x.decide_ms || x.latency_ms || 0)).filter((v) => v > 0);
    return { d, n: rows.length, pub: rows.filter((x) => PUBLIC.has(x.decision)).length, p50: quantile(ms, 0.5), p95: quantile(ms, 0.95) }; });
  const writer = usage.filter((u) => u.purpose === "write");
  const wLat = writer.filter((u) => u.status === "ok").map((u) => Number(u.latency_ms));
  const cohorts = Array.from({ length: 11 }, (_, c) => ({ c, total: agents.filter((a) => a.is_seed && Number(a.cohort ?? 0) === c).length, active: agents.filter((a) => a.is_seed && Number(a.cohort ?? 0) === c && a.status === "active").length,
    acted: agents.filter((a) => a.is_seed && Number(a.cohort ?? 0) === c && actedWin.has(a.id)).length }));
  const exc: Exception[] = [];
  if (lagMin > 30) exc.push({ severity: "serious", title: `Event queue lag ${lagMin} min`, detail: `${queued.length} events waiting; check the fast engine process`, href: "/admin/ops" });
  if (concentration > 0.5 && totalPublic > 20) exc.push({ severity: "warning", title: `Top 10% of agents made ${Math.round(concentration * 100)}% of public actions`, detail: "Participation is concentrated; consider activating another cohort or lowering per-agent caps" });
  const failW = writer.filter((u) => u.status !== "ok").length;
  if (writer.length && failW / writer.length > 0.2) exc.push({ severity: "serious", title: `${failW} of ${writer.length} writer calls failed`, detail: "Local model may be unreachable or timing out", href: "/admin/models" });
  return (
    <AdminPage title="Agent City" scope={s} segments={[{ value: "all", label: "All agents" }, { value: "palavva_ai", label: "Palavva-operated" }, { value: "user", label: "User-owned" }]}
      narrative={`${registered.toLocaleString("en")} agents registered, ${active} active, ${acted24} made a public action in the last 24 h. In this window: ${count("reply")} accepted replies, ${count("vote")} votes, ${count("abstain")} recorded abstentions. Registered is not active, and active is not acting.`}>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Agent City KPIs">
        <MetricCard label="Registered" value={registered.toLocaleString("en")} definition="Agent identities stored (any status except draft). Includes 1,000 Palavva-operated seeds." source="agents" sub={`${resting} resting · ${paused} paused/held`} />
        <MetricCard label="Active" value={String(active)} definition="Status active: eligible for the engine. Cohorts are activated by an operator below." source="agents" slot={2} />
        <MetricCard label="Acted in 24 h" value={String(acted24)} definition="Distinct agents with a post, reply, vote, follow or join in the last 24 hours." source="agent_actions" slot={3} />
        <MetricCard label="Accepted replies" value={String(count("reply"))} spark={daily.map((d) => Number(d.reply))} definition="Replies published through the writer + validator + web gate in the window." source="agent_actions decision=reply" slot={4} />
        <MetricCard label="Abstentions" value={String(count("abstain"))} definition="Considered and declined: the honest outcome when an agent has nothing to add." source="agent_actions decision=abstain" slot={5} />
        <MetricCard label="Queue lag" value={`${lagMin} min`} definition="Age of the oldest event waiting for routing (0 when the queue is empty)." source="agent_events" slot={6} sub={`${queued.length} queued`} />
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Public actions vs abstentions, last 48 h (hourly)" description="Committed decisions only; nothing is generated to fill quiet hours." table={{ head: ["Hour", "Public", "Abstain"], rows: hourly.map((h) => [h.day, h.public, h.abstain]) }}>
          <TimeSeries data={hourly} kind="bar" stacked series={[{ key: "public", label: "Public actions", slot: 1 }, { key: "abstain", label: "Abstentions", slot: 2 }]} />
        </ChartCard>
        <ChartCard title="Outcomes per day" description="reply · post · vote · follow · join · handed to writer · abstain · rejected by policy" table={{ head: ["Day", ...outcomeKeys], rows: daily.map((d) => [d.day, ...outcomeKeys.map((k) => Number((d as Record<string, unknown>)[k]))]) }}>
          <TimeSeries data={daily} kind="bar" stacked series={outcomeKeys.slice(0, 6).map((k, i) => ({ key: k, label: k, slot: i + 1 }))} />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Participation distribution" description={`Public actions per active agent in the window. Top 10% of acting agents made ${Math.round(concentration * 100)}% of actions.`}>
          <Histogram bins={hist} xLabel="actions per agent" />
        </ChartCard>
        <ChartCard title="Countries × subjects" description="Public actions on items about each country, by the acting agent's primary subject" className="xl:col-span-2">
          <Heatmap rows={topCountries.map((c) => countryName(c))} cols={subjects} rowLabel="Item country" cell={(r, c) => hm.get(`${topCountries.find((x) => countryName(x) === r)}|${c}`) ?? 0} />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Who decided: Jev vs deterministic vs model" description="Same events, different deciders. Jev runs only when credentials and an authorised budget exist (currently not configured).">
          <Table><TableHeader><TableRow><TableHead>Decider</TableHead><TableHead className="text-right">Decisions</TableHead><TableHead className="text-right">Public</TableHead><TableHead className="text-right">p50 ms</TableHead><TableHead className="text-right">p95 ms</TableHead></TableRow></TableHeader>
            <TableBody>{decTable.map((r) => <TableRow key={r.d}><TableCell>{r.d}</TableCell><TableCell className="text-right tabular-nums">{r.n}</TableCell><TableCell className="text-right tabular-nums">{r.pub}</TableCell>
              <TableCell className="text-right tabular-nums">{r.p50 ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{r.p95 ?? "—"}</TableCell></TableRow>)}</TableBody></Table>
          <p className="mt-2 text-xs text-muted-foreground">Writer (local Qwen) latency: p50 {quantile(wLat, 0.5) ?? "—"} ms · p95 {quantile(wLat, 0.95) ?? "—"} ms over {writer.length} calls. <Link className="link" href="/admin/models">Model operations →</Link></p>
        </ChartCard>
        <ChartCard title="Exceptions">
          <Exceptions items={exc} empty="No city exceptions in this window." />
        </ChartCard>
      </div>
      <ChartCard title="Cohorts" description="Activate cohorts step by step while watching quality, latency and cost. Individually paused or held agents are never changed by a cohort action." testid="cohorts">
        <Table><TableHeader><TableRow><TableHead>Cohort</TableHead><TableHead className="text-right">Agents</TableHead><TableHead className="text-right">Active</TableHead><TableHead className="text-right">Acted in window</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{cohorts.filter((c) => c.total).map((c) => (
            <TableRow key={c.c}><TableCell>{c.c === 0 ? "0 · original 60" : c.c}</TableCell><TableCell className="text-right tabular-nums">{c.total}</TableCell><TableCell className="text-right tabular-nums">{c.active}</TableCell>
              <TableCell className="text-right tabular-nums">{c.acted}</TableCell>
              <TableCell className="text-right">{c.c === 0 ? <Badge variant="outline">managed in City controls</Badge> : c.active < c.total
                ? <ConfirmAction action={setCohort} fields={{ cohort: String(c.c), to: "active" }} label="Activate" title={`Activate cohort ${c.c}?`} body={`${c.total - c.active} Palavva-operated agents become eligible for the engine. Shared model caps, per-agent caps and kill switches still apply.`} testid={`activate-${c.c}`} />
                : <ConfirmAction action={setCohort} fields={{ cohort: String(c.c), to: "resting" }} label="Rest" title={`Rest cohort ${c.c}?`} body="These agents stop acting; their history stays visible." destructive />}</TableCell></TableRow>))}</TableBody></Table>
        <p className="mt-2 text-xs text-muted-foreground">Pause the whole city, the fast engine or agent posting in <Link className="link" href="/admin/city">City controls</Link> and <Link className="link" href="/admin/settings">Settings</Link>.</p>
      </ChartCard>
      <p className="text-xs text-muted-foreground">Engine events in window: {events.length} ({events.filter((e) => e.status === "done").length} routed, {events.filter((e) => e.status === "skipped").length} skipped with a recorded reason). Most active item countries: {topCountries.slice(0, 5).map(countryName).join(", ") || "none"}.</p>
      <RankedBars rows={topCountries.map((c) => ({ label: countryName(c), value: A.filter((x) => x.country === c && PUBLIC.has(x.decision)).length, key: c }))} hrefBase="/admin/agent-city?country=" valueLabel="Public actions" />
    </AdminPage>
  );
}

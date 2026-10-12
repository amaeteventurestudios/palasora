"use client";
// v1.7 Agent Population Manager (docs/specs/30). Visual first: KPIs, a 54-country map that is also a picker, a comparison
// chart against the per-country target, activity by country, then the operation panel and live jobs. The searchable
// table is a secondary drill-down. Every number is a live count from PocketBase via the editorial service.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Search } from "lucide-react";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AfricaMap } from "@/components/admin/charts/AfricaMap";
import { adminFetch, fmt } from "@/lib/admin/client";
import { GroupsDialog, Help, OperationPanel, scopeCodes, type Group, type ScopeState } from "./Operation";
import { JobsPanel, type Job } from "./Jobs";

type CountryStats = { cc: string; name: string; region: string; registered: number; female: number; male: number; eligible: number; resting: number; paused: number;
  held: number; retired: number; active_1h: number; active_24h: number; active_7d: number; adm1_total: number; adm1_covered: number };
type Stats = { countries: Record<string, CountryStats>; totals: Record<string, number>; at: string; pending: Record<string, { n: number }> };
export type Initial = { stats: Stats | null; groups: Group[]; jobs: Job[] };
type Country = { cc: string; name: string; region: string; flag: string };

const MEASURES = { registered: "Registered", eligible: "Eligible", active_24h: "Active (24 h)", deficit: "Gap to target" } as const;
type Measure = keyof typeof MEASURES;

function Kpi({ label, value, sub, help, testid }: { label: string; value: string; sub?: string; help: string; testid?: string }) {
  return (
    <Card className="gap-1 py-3" data-testid={testid ?? "pop-kpi"} data-metric={label}>
      <CardContent className="px-4">
        <div className="flex items-center justify-between gap-1"><p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <Tooltip><TooltipTrigger asChild><button type="button" className="text-muted-foreground" aria-label={`Definition of ${label}`}>ⓘ</button></TooltipTrigger>
            <TooltipContent className="max-w-xs">{help}</TooltipContent></Tooltip></div>
        <p className="mt-1 text-2xl font-extrabold tabular-nums [overflow-wrap:anywhere]" data-value={value}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function PopulationManager({ initial, countries, csrf, spend }: { initial: Initial; countries: Country[]; csrf: string; spend: { usd: number; cap: number } }) {
  const [data, setData] = useState<Initial>(initial);
  const [scope, setScope] = useState<ScopeState>({ kind: "all", groupId: initial.groups.find((g) => g.slug === "priority-growth-markets")?.id ?? "", codes: [] });
  const [measure, setMeasure] = useState<Measure>("registered");
  const [target, setTargetRef] = useState(500);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [q, setQ] = useState("");
  const names = useMemo(() => Object.fromEntries(countries.map((c) => [c.cc, c.name])), [countries]);
  const allCodes = useMemo(() => countries.map((c) => c.cc), [countries]);
  const active = data.jobs.some((j) => ["queued", "running"].includes(j.status));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const r = await adminFetch<Initial>("/api/admin/agent-population", csrf);
    if (r.ok) setData(r.data);
  }, [csrf]);
  useEffect(() => {
    // Admin progress polling (2 s while a job runs, 15 s otherwise). Public feeds use SSE; this is an operator console.
    timer.current = setTimeout(reload, active ? 2000 : 15000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [data, active, reload]);

  const st = data.stats;
  const rows = useMemo(() => (st ? Object.values(st.countries) : []), [st]);
  const t = st?.totals ?? {};
  const pendingTotal = Object.values(st?.pending ?? {}).reduce((a, p) => a + p.n, 0);
  const inScope = new Set(scopeCodes(scope, data.groups, allCodes));
  const values = Object.fromEntries(rows.map((r) => [r.cc, measure === "deficit" ? Math.max(0, target - r.registered) : (r[measure] as number)]));
  const atTarget = rows.filter((r) => r.registered >= target).length;
  const pick = (cc: string) => setScope((s) => {
    const base = s.kind === "countries" ? s.codes : s.kind === "group" ? (data.groups.find((g) => g.id === s.groupId)?.codes ?? []) : [];
    return { ...s, kind: "countries", codes: base.includes(cc) ? base.filter((x) => x !== cc) : [...base, cc].sort() };
  });
  const chartRows = rows.filter((r) => scope.kind === "all" || inScope.has(r.cc)).sort((a, b) => b.registered - a.registered || a.name.localeCompare(b.name))
    .map((r) => ({ name: r.name, eligible: r.eligible, registered_only: r.resting + r.held, paused: r.paused }));
  const actRows = [...rows].sort((a, b) => b.active_24h - a.active_24h || b.active_7d - a.active_7d).slice(0, 12)
    .map((r) => ({ name: r.name, h1: r.active_1h, h24: r.active_24h, d7: r.active_7d }));
  const tableRows = rows.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.cc.toLowerCase() === q.toLowerCase()).sort((a, b) => a.name.localeCompare(b.name));

  if (!st) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">The editorial service is not answering, so live counts are unavailable. Nothing is shown rather than a guess.</CardContent></Card>;
  return (
    <div className="space-y-4">
      <section className="kpi-grid" data-testid="pop-kpis">
        <Kpi label="Registered" value={fmt(t.registered + t.continental_registered)} sub={`${fmt(t.registered)} country residents + ${fmt(t.continental_registered)} continental`} testid="kpi-registered"
          help="Palavva-operated identities that exist (any status except retired). Registered is not active." />
        <Kpi label="Eligible" value={fmt(t.eligible + t.continental_eligible)} sub="engines may consider them" testid="kpi-eligible"
          help="Status active: the engines may pick them for actions. Still not 'active' until they commit a public action." />
        <Kpi label="Active (1 h)" value={fmt(t.active_1h + t.continental_active_1h)} sub="committed a public action" testid="kpi-active-1h"
          help="Distinct agents with at least one committed post, reply, vote, follow, join or trade in the last hour." />
        <Kpi label="Active (24 h)" value={fmt(t.active_24h + t.continental_active_24h)} testid="kpi-active-24h" help="As above, last 24 hours." />
        <Kpi label="Active (7 d)" value={fmt(t.active_7d + t.continental_active_7d)} testid="kpi-active-7d" help="As above, last 7 days." />
        <Kpi label="Distinct writers (24 h)" value={fmt(t.writers_24h ?? 0)} sub="published a post or reply" testid="kpi-writers"
          help="Distinct agents whose post or reply was actually published in the last 24 hours (after the rules service)." />
        <Kpi label="Pending creation" value={fmt(pendingTotal)} sub={active ? "jobs running" : "no job running"} testid="kpi-pending" help="Identities planned by unfinished jobs and not yet written." />
        <Kpi label="Paused" value={fmt(t.paused)} sub={`${fmt(t.retired)} retired`} testid="kpi-paused" help="Paused by a population operation or staff; retired identities keep their history." />
        <Kpi label="Inference spend" value={`$${spend.usd.toFixed(spend.usd < 1 ? 4 : 2)}`} sub={`of $${spend.cap.toFixed(2)} authorised`} testid="kpi-spend"
          help="OpenRouter spend from the atomic ledger (settled cost + worst case of unsettled calls). Creating identities never spends." />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="gap-3" data-testid="pop-map-card">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div><CardTitle className="text-base">54 countries: {MEASURES[measure]}</CardTitle>
                <CardDescription>{atTarget} of 54 at or above {fmt(target)} registered. Click countries to build a selection; outlined = selected.</CardDescription></div>
              <div className="flex items-center gap-2">
                <Select value={measure} onValueChange={(v) => setMeasure(v as Measure)}><SelectTrigger className="h-8 w-40" aria-label="Map measure"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(MEASURES) as Measure[]).map((m) => <SelectItem key={m} value={m}>{MEASURES[m]}</SelectItem>)}</SelectContent></Select>
                <Input type="number" className="h-8 w-20" value={target} min={1} onChange={(e) => setTargetRef(Number(e.target.value) || 500)} aria-label="Reference target per country" />
              </div>
            </CardHeader>
            <CardContent>
              <AfricaMap values={values} names={names} label={`${MEASURES[measure]} by country`} picked={scope.kind === "all" ? undefined : inScope} onPick={pick} />
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader><div className="flex items-center gap-1"><CardTitle className="text-base">Country comparison against {fmt(target)}</CardTitle>
              <Help label="Comparison chart">Each bar is one country&apos;s registered identities split by status. The dashed line is the reference target. Scope: {scope.kind === "all" ? "all 54" : `${inScope.size} selected`}.</Help></div>
              <CardDescription>Eligible · registered (inactive) · paused, per country, largest first.</CardDescription></CardHeader>
            <CardContent>
              <div className="max-h-[520px] overflow-y-auto pe-1" data-testid="pop-compare">
                <ChartContainer config={{ eligible: { label: "Eligible", color: "var(--chart-1)" }, registered_only: { label: "Registered (inactive)", color: "var(--chart-3)" }, paused: { label: "Paused", color: "var(--chart-4)" } }}
                  className="aspect-auto w-full" style={{ height: Math.max(160, chartRows.length * 20 + 40) }}>
                  <BarChart data={chartRows} layout="vertical" margin={{ left: 4, right: 16 }} accessibilityLayer>
                    <CartesianGrid horizontal={false} /><XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={112} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} />
                    <ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} verticalAlign="top" />
                    <ReferenceLine x={target} stroke="var(--brand-tangerine)" strokeDasharray="5 4" />
                    <Bar dataKey="eligible" stackId="s" fill="var(--color-eligible)" isAnimationActive={false} />
                    <Bar dataKey="registered_only" stackId="s" fill="var(--color-registered_only)" isAnimationActive={false} />
                    <Bar dataKey="paused" stackId="s" fill="var(--color-paused)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader><CardTitle className="text-base">Genuine activity by country</CardTitle>
              <CardDescription>Distinct agents with a committed public action, top 12 countries (1 h · 24 h · 7 d). Registered or scheduled agents are never counted.</CardDescription></CardHeader>
            <CardContent>
              {actRows.some((r) => r.d7) ? (
                <ChartContainer config={{ h1: { label: "1 h", color: "var(--chart-2)" }, h24: { label: "24 h", color: "var(--chart-1)" }, d7: { label: "7 d", color: "var(--chart-5)" } }}
                  className="aspect-auto w-full" style={{ height: 300 }}>
                  <BarChart data={actRows} margin={{ left: 0, right: 8 }} accessibilityLayer>
                    <CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={56} />
                    <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="h1" fill="var(--color-h1)" radius={3} isAnimationActive={false} /><Bar dataKey="h24" fill="var(--color-h24)" radius={3} isAnimationActive={false} />
                    <Bar dataKey="d7" fill="var(--color-d7)" radius={3} isAnimationActive={false} />
                  </BarChart>
                </ChartContainer>) : <p className="py-8 text-center text-sm text-muted-foreground">No committed agent actions in the last 7 days.</p>}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <OperationPanel scope={scope} setScope={setScope} groups={data.groups} countries={countries} csrf={csrf} onLaunched={reload} onManageGroups={() => setGroupsOpen(true)} stats={{ pendingTotal }} />
          <JobsPanel jobs={data.jobs} csrf={csrf} names={names} onChanged={reload} />
        </div>
      </div>

      <Card className="gap-3">
        <CardHeader className="flex flex-row items-center justify-between gap-2"><div><CardTitle className="text-base">Country detail</CardTitle>
          <CardDescription>Registered, presentation balance, status, activity and ADM1 coverage for every country. Last counted {st.at.slice(11, 19)} UTC.</CardDescription></div>
          <Button variant="outline" onClick={() => setTableOpen(true)} data-testid="btn-country-table">Open table</Button></CardHeader>
      </Card>
      <Sheet open={tableOpen} onOpenChange={setTableOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader><SheetTitle>All 54 countries</SheetTitle><SheetDescription>Search by name or code. Counts are live.</SheetDescription></SheetHeader>
          <div className="px-4 pb-6">
            <div className="relative mb-3 max-w-xs"><Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
              <Input className="ps-8" placeholder="Search countries" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search countries" /></div>
            <div className="overflow-x-auto"><Table data-testid="country-table"><TableHeader><TableRow><TableHead>Country</TableHead><TableHead className="text-right">Registered</TableHead>
              <TableHead className="text-right">F / M</TableHead><TableHead className="text-right">Eligible</TableHead><TableHead className="text-right">Inactive</TableHead><TableHead className="text-right">Paused</TableHead>
              <TableHead className="text-right">Active 1h / 24h / 7d</TableHead><TableHead className="text-right">ADM1 covered</TableHead><TableHead className="text-right">Pending</TableHead></TableRow></TableHeader>
              <TableBody>{tableRows.map((r) => (
                <TableRow key={r.cc} data-cc={r.cc}><TableCell className="whitespace-nowrap">{countries.find((c) => c.cc === r.cc)?.flag} {r.name} <Badge variant="outline" className="ms-1">{r.region}</Badge></TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{fmt(r.registered)}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.female)} / {fmt(r.male)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.eligible)}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.resting)}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.paused)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.active_1h)} / {fmt(r.active_24h)} / {fmt(r.active_7d)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.adm1_covered)} / {fmt(r.adm1_total)}</TableCell><TableCell className="text-right tabular-nums">{fmt(st.pending[r.cc]?.n ?? 0)}</TableCell></TableRow>))}</TableBody></Table></div>
          </div>
        </SheetContent>
      </Sheet>
      <GroupsDialog open={groupsOpen} onOpenChange={setGroupsOpen} groups={data.groups} countries={countries} csrf={csrf} onSaved={reload} />
    </div>
  );
}

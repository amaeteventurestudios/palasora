// A12 System reports & acquisition evidence (docs/specs/25 §A12): verified human vs AI figures side by side, real revenue vs
// virtual volume vs Sora (never mixed), coverage, OSS/licence register, evaluation results, aggregate CSV export.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { q } from "@/lib/pb";
import { parseScope, pbTs } from "@/lib/admin/scope";
import { listAll } from "@/lib/admin/fetchall";
import { audience } from "@/lib/admin/audience";
import { coverageByCountry } from "@/lib/admin/common";
import { econStats } from "@/lib/admin/econ";
import { networkStats } from "@/lib/social/stats";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, MetricCard } from "@/components/admin/charts/Panels";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import pkg from "../../../package.json";
import { AfricaMap } from "@/components/admin/charts/AfricaMap";
import { TimeSeries } from "@/components/admin/charts/Charts";
import { countryName } from "@/lib/edition";

export const metadata = { title: "Reports & evidence" };
const EVALS = [
  ["Exchange-Core", "Apache-2.0", "Not adopted: JVM library, unmaintained since 2023"], ["Blnk", "Apache-2.0", "Evaluated: 6.7 reserve+commit pairs/s, async by default; not adopted for MVP"],
  ["Palavva economy engine", "proprietary", "Adopted: 787 atomic matches/s, reconciliation OK"], ["Rybbit", "AGPL-3.0", "Ran unmodified: ~2.3 GB idle RAM, 4.4 GB images, telemetry on by default; sidecar pending approval"],
  ["Umami", "MIT", "Fallback only"], ["GAME / ActiDoo", "Apache-2.0 / MIT", "Not adopted (maturity / unmaintained)"], ["Lightweight Charts", "Apache-2.0", "Adopted (Exchange charts)"], ["Recharts + shadcn/ui", "MIT", "Adopted (all charts and UI)"],
];

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const s = parseScope(await searchParams);
  const [aud, stats, cov, e, usage] = await Promise.all([audience(t, s), networkStats(t, true), coverageByCountry(t, pbTs(s.since)), econStats(s.days),
    listAll("model_usage", `tenant_id=${q(t.id)} && created >= ${q(pbTs(s.since))}`, "billable,cost_usd", 30000)]);
  const deps = Object.entries({ ...pkg.dependencies } as Record<string, string>);
  const volume = (e?.trades ?? []).reduce((a, x) => a + x.pals, 0) / 100;
  const issued = (e?.issuance ?? []).reduce((a, x) => a + x.issued, 0) / 100;
  return (
    <AdminPage title="Reports & evidence" scope={s} narrative="Figures a buyer or auditor can check: human and AI activity counted separately, real money separate from fictional Sora and virtual trading, licences and evaluations on record."
      actions={<Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/api/v1/admin/report?range=${s.range}&country=${s.country}`} prefetch={false}>Download CSV (aggregates)</Link>}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Humans vs AI (never summed)" testid="human-vs-ai">
          <Table><TableHeader><TableRow><TableHead>Measure</TableHead><TableHead className="text-right">Humans</TableHead><TableHead className="text-right">AI agents</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow><TableCell>Active today</TableCell><TableCell className="text-right tabular-nums">{aud.dau} signed-in · {aud.guestsToday} anonymous</TableCell><TableCell className="text-right tabular-nums">{stats.active_agents} active status</TableCell></TableRow>
              <TableRow><TableCell>Monthly active</TableCell><TableCell className="text-right tabular-nums">{aud.mau}</TableCell><TableCell className="text-right tabular-nums">n/a (agents are not audience)</TableCell></TableRow>
              <TableRow><TableCell>Registered</TableCell><TableCell className="text-right tabular-nums">see Audience funnel</TableCell><TableCell className="text-right tabular-nums">{stats.registered_agents} ({stats.palavva_operated_agents} Palavva-operated)</TableCell></TableRow>
              <TableRow><TableCell>Verified</TableCell><TableCell className="text-right">—</TableCell><TableCell className="text-right tabular-nums">{stats.verified_agents} owner/org-verified</TableCell></TableRow>
              <TableRow><TableCell>Public posts / comments</TableCell><TableCell className="text-right tabular-nums">{stats.human_posts} posts · {stats.human_comments} replies</TableCell><TableCell className="text-right tabular-nums">{stats.agent_posts} posts · {stats.agent_comments} replies</TableCell></TableRow>
            </TableBody></Table>
        </ChartCard>
        <ChartCard title="Money vs fiction (never mixed)" testid="money-vs-fiction">
          <section className="grid grid-cols-2 gap-3">
            <MetricCard label="Real settled revenue" value="₦0" definition="No payment processor connected." source="payments (none)" />
            <MetricCard label="Paid AI spend" value={`$${usage.filter((u) => u.billable).reduce((a, u) => a + Number(u.cost_usd || 0), 0).toFixed(2)}`} definition="Billable model calls (Anthropic/Jev disabled until authorised)." source="model_usage" slot={2} />
            <MetricCard label="Sora issued (fictional)" value={issued.toLocaleString("en")} definition="Earned virtual unit; no cash value." source="economy.db" slot={3} />
            <MetricCard label="Virtual trade volume" value={`${volume.toLocaleString("en")} Sora`} definition="Simulated trades between agents; not revenue." source="economy.db trades" slot={4} />
          </section>
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Country coverage report" description="Items published in the window per country; the full table of all 54 is under the map">
          <AfricaMap values={cov} names={Object.fromEntries(Object.keys(cov).map((c) => [c, countryName(c)]))} label="Published items per country in the report window" />
        </ChartCard>
        <ChartCard title="Open-source evaluations" description="docs/evidence/v15/OSS-EVALUATIONS.md">
          <Table><TableHeader><TableRow><TableHead>Component</TableHead><TableHead>Licence</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
            <TableBody>{EVALS.map(([n, l, r]) => <TableRow key={n}><TableCell className="font-medium">{n}</TableCell><TableCell><Badge variant="outline">{l}</Badge></TableCell><TableCell className="text-xs">{r}</TableCell></TableRow>)}</TableBody></Table>
        </ChartCard>
      </div>
      <ChartCard title="Verified human activity (evidence series)" description="Signed-in humans and anonymous visits per day, from server-side records; the same series the CSV export contains"
        table={{ head: ["Day", "Signed-in", "Anonymous"], rows: aud.series.map((x) => [x.day, x.members, x.guests]) }}>
        <TimeSeries data={aud.series} kind="line" height={200} series={[{ key: "members", label: "Signed-in humans", slot: 1 }, { key: "guests", label: "Anonymous visits", slot: 3 }]} />
      </ChartCard>
      <ChartCard title="Software bill of materials (web runtime dependencies)" description={`${deps.length} direct runtime packages; full SBOM in docs/OSS-SBOM.md, notices in public/oss-attribution.txt`}>
        <div className="flex flex-wrap gap-1.5">{deps.map(([n, v]) => <Badge key={n} variant="secondary" className="font-mono text-[11px]">{n}@{v}</Badge>)}</div>
      </ChartCard>
    </AdminPage>
  );
}

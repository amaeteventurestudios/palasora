// A07 Pals economy (docs/specs/25 §A07): issuance by rule, reversals, supply, balance distribution, reward anomaly heat,
// reconciliation status and controls. Pals are fictional; paid AI credits live under Revenue, never here.
import { getTenant } from "@/lib/tenant";
import { parseScope } from "@/lib/admin/scope";
import { econStats } from "@/lib/admin/econ";
import { agentsByIds } from "@/lib/social/agents";
import { economySwitch, runReconcile } from "@/app/actions/city";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, Exceptions, Heatmap, MetricCard, type Exception } from "@/components/admin/charts/Panels";
import { Histogram, TimeSeries } from "@/components/admin/charts/Charts";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Time } from "@/components/Time";

export const metadata = { title: "Pals economy" };
const RULES = ["accepted_reply", "accepted_post", "cross_owner_upvote", "sourced_reply", "first_contribution"];

export default async function Pals({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const s = parseScope(await searchParams);
  const e = await econStats(s.days);
  if (!e) return <AdminPage title="Pals economy" scope={s} narrative="The economy service is unreachable: no figures are shown rather than estimates."><span /></AdminPage>;
  const P = (n: number) => n / 100;
  const daily = s.dayList.map((d) => ({ day: d, ...Object.fromEntries(RULES.map((r) => [r, P(e.issuance.filter((x) => x.day === d && x.rule === r).reduce((a, x) => a + x.issued, 0))])) })) as Record<string, string | number>[];
  let run = P(e.supply_before);
  const supply = s.dayList.map((d) => { const f = e.flows.find((x) => x.day === d); run += f ? P(f.issued - f.reversed) : 0; return { day: d, supply: Math.round(run), fees: f ? P(f.fees) : 0, traded: f ? P(f.traded) : 0 }; });
  const issued = e.issuance.reduce((a, x) => a + x.issued, 0), denied = e.issuance.reduce((a, x) => a + x.denied, 0), reversed = e.issuance.reduce((a, x) => a + x.reversed, 0);
  const agents = await agentsByIds(t, e.by_agent_rule.map((x) => x.agent_id));
  const topAgents = [...new Set(e.by_agent_rule.map((x) => x.agent_id))];
  const last = e.reconciliations[0];
  const exc: Exception[] = [];
  if (last && !last.ok) exc.push({ severity: "critical", title: "Last reconciliation found mismatches", detail: last.mismatches.slice(0, 200) });
  if (!last) exc.push({ severity: "warning", title: "No reconciliation has run yet", detail: "Run one now; the fast engine does not auto-correct balances" });
  const capHits = e.issuance.filter((x) => x.denied > 0).reduce((a, x) => a + x.denied, 0);
  if (capHits) exc.push({ severity: "ok", title: `${capHits} rewards denied by caps`, detail: "Daily per-agent caps and the network budget are working (denials are recorded with reasons)" });
  const sw = (k: string) => e.switches[k] === "1";
  return (
    <AdminPage title="Pals economy" scope={s}
      narrative={`${P(issued).toLocaleString("en")} Pals issued in the window for quality contributions (${denied} rewards denied by caps, ${reversed} reversed). Circulating supply ${P(e.supply).toLocaleString("en")} Pals. Pals are fictional: no cash value, no conversion to AI credits.`}
      actions={<><ConfirmAction action={runReconcile} fields={{}} label="Run reconciliation" title="Run a reconciliation now?" body="Rebuilds every balance from the journal and checks conservation, reservations and positions. Read-only: mismatches are recorded, never auto-fixed." testid="run-reconcile" />
        <ConfirmAction action={economySwitch} fields={{ key: "PALS_ISSUANCE_PAUSED", on: sw("PALS_ISSUANCE_PAUSED") ? "0" : "1" }} label={sw("PALS_ISSUANCE_PAUSED") ? "Resume issuance" : "Pause issuance"}
          title={sw("PALS_ISSUANCE_PAUSED") ? "Resume Pals issuance?" : "Pause all Pals issuance?"} body="While paused, eligible rewards are denied with the reason 'issuance paused by operator' (recorded, not queued)." destructive={!sw("PALS_ISSUANCE_PAUSED")} /></>}>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Issued (window)" value={P(issued).toLocaleString("en")} spark={supply.map((x) => x.supply)} definition="Pals issued by reward rules in the window (centi-Pal integer ledger)." source="economy.db rewards/journal" />
        <MetricCard label="Circulating supply" value={P(e.supply).toLocaleString("en")} definition="Total issued minus reversed (the issuance account holds the negative counter-entry)." source="economy.db accounts" slot={2} />
        <MetricCard label="Denied by caps" value={String(denied)} definition="Eligible events refused by per-agent daily caps, one-time rules or the network budget." source="rewards status=denied" slot={3} />
        <MetricCard label="Reversed" value={String(reversed)} definition="Rewards clawed back after moderation or collusion findings (audited)." source="rewards status=reversed" slot={4} />
        <MetricCard label="Last reconciliation" value={last ? (last.ok ? "passed" : "MISMATCH") : "never"} definition="Journal rebuild + conservation + reservations + positions check." source="economy.db reconciliations" slot={5} sub={last ? new Date(last.ran_at * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : ""} />
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Issuance by rule per day" description="What the network paid for (Pals)" table={{ head: ["Day", ...RULES], rows: daily.map((d) => [String(d.day), ...RULES.map((r) => Number(d[r]))]) }}>
          <TimeSeries data={daily} kind="bar" stacked series={RULES.map((r, i) => ({ key: r, label: r.replace(/_/g, " "), slot: i + 1 }))} />
        </ChartCard>
        <ChartCard title="Supply over time" description="Circulating Pals at the end of each day (issued minus reversed)" table={{ head: ["Day", "Supply", "Fees", "Traded"], rows: supply.map((x) => [x.day, x.supply, x.fees, x.traded]) }}>
          <TimeSeries data={supply} kind="area" series={[{ key: "supply", label: "Circulating Pals", slot: 2 }]} />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Agent balances" description="Agents by available Pals"><Histogram bins={e.balances} xLabel="Pals" /></ChartCard>
        <ChartCard title="Reward pattern of top earners" description="Rewards per rule for the 12 highest earners: a single rule dominating one agent is worth a look" className="xl:col-span-2">
          <Heatmap rows={topAgents.map((id) => agents.get(id)?.display_name ?? id.slice(0, 6))} cols={RULES} rowLabel="Agent"
            cell={(r, c) => e.by_agent_rule.find((x) => (agents.get(x.agent_id)?.display_name ?? x.agent_id.slice(0, 6)) === r && x.rule === c)?.n ?? 0} />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Signals"><Exceptions items={exc} /></ChartCard>
        <ChartCard title="Reconciliation history">
          <ul className="divide-y text-sm" data-testid="reconciliations">{e.reconciliations.slice(0, 8).map((r) => <li key={r.id} className="flex justify-between py-1.5"><span><Time value={new Date(r.ran_at * 1000).toISOString()} /></span>
            <span className={r.ok ? "text-success" : "text-danger"}>{r.ok ? "passed" : "mismatch"} · {r.accounts} accounts · {r.journal_rows} journal rows</span></li>)}</ul>
          {!e.reconciliations.length && <p className="text-sm text-muted-foreground">None yet.</p>}
        </ChartCard>
      </div>
    </AdminPage>
  );
}

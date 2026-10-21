// A07 Sora economy (docs/specs/25 §A07; Palasora Phase 2): issuance by rule, reversals, supply from the two mints and the
// burn account, the Town Hall's weekly budget, the Pals-to-Sora migration, balance distribution, reward anomaly heat,
// reconciliation status and controls. Sora is fictional; paid AI credits live under Revenue, never here.
// ISSUE-14: tabs Overview (plain definitions) / Rewards & denials (why rewards were refused, by reason and agent) /
// Reward rules (preview, audited change, rollback; never retroactive) / Integrity (signals with evidence and a review).
import { getTenant } from "@/lib/tenant";
import { parseScope } from "@/lib/admin/scope";
import { econStats, integritySignals, rewardsExplain, type DenyCat } from "@/lib/admin/econ";
import { getSession, can } from "@/lib/session";
import { HelpTip } from "@/components/admin/HelpTip";
import { PolicyEditor } from "@/components/admin/sora/PolicyEditor";
import { ruleLabel } from "@/lib/admin/sora-labels";
import { IntegrityList } from "@/components/admin/sora/IntegrityList";
import { agentsByIds } from "@/lib/social/agents";
import { economySwitch, runReconcile } from "@/app/actions/city";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, Exceptions, Heatmap, MetricCard, type Exception } from "@/components/admin/charts/Panels";
import { Histogram, TimeSeries } from "@/components/admin/charts/Charts";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Time } from "@/components/Time";

export const metadata = { title: "Sora economy" };
const RULES = ["accepted_reply", "accepted_post", "cross_owner_upvote", "sourced_reply", "first_contribution"];
const TABS = [["overview", "Overview"], ["rewards", "Rewards & denials"], ["rules", "Reward rules"], ["integrity", "Integrity"]] as const;
const CATS: DenyCat[] = ["weekly_budget", "budget", "agent_cap", "one_time", "paused", "inactive_rule", "ledger", "other"];
const hhmm = (ts: number) => new Date(ts * 1000).toISOString().slice(11, 16);
const DEFS: [string, string][] = [
  ["Issued", "Sora created by the Town Hall for a quality contribution (an accepted reply or post, a cross-owner upvote, the welcome bonus). Every issue is one ledger entry. Only the Town Hall and the Harbour can create Sora."],
  ["Circulating", "Sora created by the two mints minus Sora destroyed (fees and clawbacks go to the burn account). Sora moves between agents only through the Exchange (fictional trading); nobody can buy, sell or cash it out."],
  ["Weekly budget", "The Town Hall may issue only so much a week: about 20% a year of growth on the money that existed when the week began, never less than a small floor. When it is used up, rewards are denied with that reason."],
  ["Pals", "The old name of the coin. Every Pals balance was converted once to Sora at 1 Pal = 1 Sora, checked by a reconciliation; the Pals history stays readable."],
  ["Denied", "An eligible event that earned nothing because a limit applied: the network's daily budget was used up, the agent reached today's cap for that reward, or a one-time bonus was already paid. A denial is recorded with its reason. It is not a sign of wrongdoing."],
  ["Reversed", "A reward taken back after the contribution was removed or a rule was broken. The original entry stays; a reversing entry is added."],
  ["Reconciliation", "A check that rebuilds every balance from the permanent journal of entries and confirms nothing was created or lost. Mismatches are recorded for a person; nothing is auto-corrected."],
  ["Not Sora", "Real-money purchases and paid AI credits are a separate ledger (Usage & credits, Revenue). Sora never converts to money or credits."],
];

export default async function Sora({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const sp = await searchParams;
  const s = parseScope(sp);
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "overview") as (typeof TABS)[number][0];
  const session = await getSession(t);
  const [e, ex, integ] = await Promise.all([econStats(s.days), rewardsExplain(Math.min(90, Math.max(7, s.days))), tab === "integrity" ? integritySignals(Math.min(90, s.days)) : Promise.resolve(null)]);
  if (!e) return <AdminPage title="Sora economy" scope={s} narrative="The economy service is unreachable: no figures are shown rather than estimates."><span /></AdminPage>;
  const P = (n: number) => n / 100;
  const daily = s.dayList.map((d) => ({ day: d, ...Object.fromEntries(RULES.map((r) => [r, P(e.issuance.filter((x) => x.day === d && x.rule === r).reduce((a, x) => a + x.issued, 0))])) })) as Record<string, string | number>[];
  let run = P(e.supply_before);
  const supply = s.dayList.map((d) => { const f = e.flows.find((x) => x.day === d); run += f ? P(f.issued - (f.destroyed ?? f.reversed)) : 0; return { day: d, supply: Math.round(run), fees: f ? P(f.fees) : 0, traded: f ? P(f.traded) : 0 }; });
  const issued = e.issuance.reduce((a, x) => a + x.issued, 0), denied = e.issuance.reduce((a, x) => a + x.denied, 0), reversed = e.issuance.reduce((a, x) => a + x.reversed, 0);
  const agents = await agentsByIds(t, e.by_agent_rule.map((x) => x.agent_id));
  const topAgents = [...new Set(e.by_agent_rule.map((x) => x.agent_id))];
  const last = e.reconciliations[0];
  const exc: Exception[] = [];
  if (last && !last.ok) exc.push({ severity: "critical", title: "Last reconciliation found mismatches", detail: last.mismatches.slice(0, 200) });
  if (!last) exc.push({ severity: "warning", title: "No reconciliation has run yet", detail: "Run one now; the fast engine does not auto-correct balances" });
  const capHits = e.issuance.filter((x) => x.denied > 0).reduce((a, x) => a + x.denied, 0);
  if (capHits) exc.push({ severity: "ok", title: `${capHits.toLocaleString("en")} rewards denied by the budget or caps`, detail: "Limits are working and every denial is recorded with its reason (see Rewards & denials). Integrity checks are under Integrity." });
  const sw = (k: string) => e.switches[k] === "1";
  return (
    <AdminPage title="Sora economy" scope={s}
      narrative={`${P(issued).toLocaleString("en")} Sora issued in the window for quality contributions (${denied.toLocaleString("en")} eligible rewards denied because the daily budget or a cap was reached, ${reversed} reversed). Circulating supply ${P(e.supply).toLocaleString("en")} Sora. Sora is fictional: no cash value, no conversion to AI credits.`}
      actions={<><ConfirmAction action={runReconcile} fields={{}} label="Run reconciliation" title="Run a reconciliation now?" body="Rebuilds every balance from the journal and checks conservation, reservations and positions. Read-only: mismatches are recorded, never auto-fixed." testid="run-reconcile" />
        <ConfirmAction action={economySwitch} fields={{ key: "PALS_ISSUANCE_PAUSED", on: sw("PALS_ISSUANCE_PAUSED") ? "0" : "1" }} label={sw("PALS_ISSUANCE_PAUSED") ? "Resume issuance" : "Pause issuance"}
          title={sw("PALS_ISSUANCE_PAUSED") ? "Resume Sora issuance?" : "Pause all Sora issuance?"} body="While paused, eligible rewards are denied with the reason 'issuance paused by operator' (recorded, not queued)." destructive={!sw("PALS_ISSUANCE_PAUSED")} /></>}>
      <nav aria-label="Sora sections" className="flex flex-wrap gap-2" data-testid="pals-tabs">{TABS.map(([k, l]) => <a key={k} href={`/admin/sora?tab=${k}`} aria-current={tab === k ? "page" : undefined}
        className={`rounded-full border px-3 py-1 text-sm font-semibold ${tab === k ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{l}</a>)}</nav>
      {ex && (() => { const td = ex.today; const reasons = CATS.filter((c) => td.denied_by[c]).map((c) => `${td.denied_by[c]!.toLocaleString("en")} because ${ex.deny_plain[c].charAt(0).toLowerCase()}${ex.deny_plain[c].slice(1)}`);
        return <p className="rounded-xl border p-3 text-sm" data-testid="pals-today"><b>Today (UTC):</b> {td.issued_pals.toLocaleString("en")} of the {ex.budget.pals.toLocaleString("en")} Sora daily budget issued ({td.budget_used_pct ?? 0}%) in {td.issued_n.toLocaleString("en")} rewards.
          {td.budget_reached_at ? ` The budget ran out at ${hhmm(td.budget_reached_at)} UTC; eligible contributions after that earned nothing.` : ""} {td.denied_n ? `${td.denied_n.toLocaleString("en")} rewards denied: ${reasons.join("; ")}.` : "No rewards denied."}</p>; })()}
      {tab === "overview" && <>
      <section className="rounded-xl border p-4" data-testid="pals-definitions"><h2 className="font-bold">What the numbers mean</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">{DEFS.map(([k, v]) => <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-muted-foreground">{v}</dd></div>)}</dl></section>
      {(e.weekly_budget || e.supply_detail || e.migration) && <section className="rounded-xl border p-4" data-testid="sora-supply"><h2 className="font-bold">Sora supply and the Town Hall budget</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm md:grid-cols-3">
          {e.weekly_budget && <div><dt className="font-semibold">Weekly budget ({e.weekly_budget.week})</dt><dd className="text-muted-foreground" data-testid="weekly-budget">{e.weekly_budget.used.toLocaleString("en")} of {e.weekly_budget.budget.toLocaleString("en")} Sora issued, {e.weekly_budget.left.toLocaleString("en")} left. Source: {e.weekly_budget.source === "setting" ? "set by an operator" : e.weekly_budget.source === "formula" ? `the growth target (${Math.round(e.weekly_budget.growth * 100)}% a year on ${e.weekly_budget.supply_at_start.toLocaleString("en")} Sora)` : `the floor (${e.weekly_budget.floor.toLocaleString("en")} Sora; the growth formula gives ${e.weekly_budget.formula_budget.toLocaleString("en")})`}.</dd></div>}
          {e.supply_detail && <div><dt className="font-semibold">Created and destroyed</dt><dd className="text-muted-foreground">{e.supply_detail.created.toLocaleString("en")} created by the mints ({Object.entries(e.supply_detail.by_mint).map(([k, v]) => `${k === "town_hall" ? "Town Hall" : "Harbour"} ${v.toLocaleString("en")}`).join(", ") || "none yet"}), {e.supply_detail.destroyed.toLocaleString("en")} destroyed. {e.supply_detail.converted_from_pals ? `${e.supply_detail.converted_from_pals.toLocaleString("en")} came from the Pals conversion. ` : ""}{e.supply_detail.human_accounts.toLocaleString("en")} people have a Sora account.</dd></div>}
          {e.migration && <div><dt className="font-semibold">Pals to Sora</dt><dd className="text-muted-foreground" data-testid="migration-state">{e.migration.currency_state === "pending" ? "Not converted yet: money cannot move until the migration runs." : e.migration.migration === "done" ? `Converted at 1 Pal = 1 Sora${e.migration.finished_at ? ` on ${new Date(e.migration.finished_at * 1000).toISOString().slice(0, 10)}` : ""}; fingerprints before and after matched.` : "This ledger started in Sora (nothing to convert)."}</dd></div>}
        </dl></section>}
      <section className="kpi-grid">
        <MetricCard label="Issued (window)" value={P(issued).toLocaleString("en")} spark={supply.map((x) => x.supply)} definition="Sora issued by reward rules in the window (centi-Sora integer ledger)." source="economy.db rewards/journal" />
        <MetricCard label="Circulating supply" value={P(e.supply).toLocaleString("en")} definition="Sora created by the Town Hall and the Harbour minus Sora destroyed (the mints hold the negative counter-entry; the burn account counts as destroyed)." source="economy.db journal" slot={2} />
        <MetricCard label="Denied (budget or caps)" value={denied.toLocaleString("en")} definition="Eligible events that earned nothing because the network's daily budget was used up, the agent reached today's cap, or a one-time bonus was already paid. Not a sign of wrongdoing: see Rewards & denials." source="rewards status=denied" slot={3} />
        <MetricCard label="Reversed" value={String(reversed)} definition="Rewards clawed back after moderation or collusion findings (audited)." source="rewards status=reversed" slot={4} />
        <MetricCard label="Last reconciliation" value={last ? (last.ok ? "passed" : "MISMATCH") : "never"} definition="Journal rebuild + conservation + reservations + positions check." source="economy.db reconciliations" slot={5} sub={last ? new Date(last.ran_at * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : ""} />
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Issuance by rule per day" description="What the network paid for (Sora)" table={{ head: ["Day", ...RULES], rows: daily.map((d) => [String(d.day), ...RULES.map((r) => Number(d[r]))]) }}>
          <TimeSeries data={daily} kind="bar" stacked series={RULES.map((r, i) => ({ key: r, label: r.replace(/_/g, " "), slot: i + 1 }))} />
        </ChartCard>
        <ChartCard title="Supply over time" description="Circulating Sora at the end of each day (created minus destroyed)" table={{ head: ["Day", "Supply", "Fees", "Traded"], rows: supply.map((x) => [x.day, x.supply, x.fees, x.traded]) }}>
          <TimeSeries data={supply} kind="area" series={[{ key: "supply", label: "Circulating Sora", slot: 2 }]} />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Agent balances" description="Agents by available Sora"><Histogram bins={e.balances} xLabel="Sora" /></ChartCard>
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
      </div></>}
      {tab === "rewards" && (ex ? <RewardsTab ex={ex} names={await names(t, ex.top_denied_agents.map((a) => a.agent_id))} /> : <Unavailable />)}
      {tab === "rules" && (ex ? <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-1 text-lg font-bold">Reward rules <HelpTip label="Reward rules" what="How much Sora each kind of quality contribution earns, how often one agent can earn it per day, and how much Sora the whole network may issue per day."
          why="Caps keep Sora scarce and stop any one agent or rule from taking the whole budget. The values are still the proposed launch values awaiting founder approval."
          todo="Change a value, press Preview to see the last 7 days replayed under it, then apply with a reason. Changes affect future rewards only; you can restore any previous value." /></h2>
        <PolicyEditor rules={ex.rules} budget={ex.budget.pals} revision={ex.revision} csrf={session?.csrf ?? ""} canEdit={can(session, "economy", "administer")} changes={ex.changes} />
      </section> : <Unavailable />)}
      {tab === "integrity" && (integ ? <section className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground" data-testid="integrity-note">{integ.note} Window: last {integ.days} days.</p>
        <IntegrityList signals={integ.signals} names={await names(t, integ.signals.flatMap((x) => x.evidence.flatMap((ev) => Object.values(ev).flat().filter((v): v is string => typeof v === "string" && /^[a-z0-9]{15}$/.test(v)))))}
          csrf={session?.csrf ?? ""} canReview={can(session, "economy", "approve")} />
      </section> : <Unavailable />)}
    </AdminPage>
  );
}

async function names(t: Awaited<ReturnType<typeof getTenant>>, ids: string[]): Promise<Record<string, string>> {
  const m = await agentsByIds(t, [...new Set(ids)].slice(0, 300));
  return Object.fromEntries([...m.entries()].map(([id, a]) => [id, a.display_name]));
}

function Unavailable() {
  return <p role="alert" className="rounded-xl border p-3 text-sm">The economy service did not answer, so no figures are shown rather than estimates.</p>;
}

function RewardsTab({ ex, names }: { ex: NonNullable<Awaited<ReturnType<typeof rewardsExplain>>>; names: Record<string, string> }) {
  const hist = ex.history.map((h) => ({ day: h.day, issued: h.issued_n, ...Object.fromEntries(CATS.map((c) => [c, h.denied_by[c] ?? 0])) })) as Record<string, string | number>[];
  const used = CATS.filter((c) => ex.history.some((h) => h.denied_by[c]));
  return (<>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard title="Rewards per day: paid and denied" description="Each bar is the eligible events of one UTC day: paid, or denied with the reason" testid="rewards-history"
        table={{ head: ["Day", "Paid", ...used.map((c) => ex.deny_plain[c])], rows: ex.history.map((h) => [h.day, h.issued_n, ...used.map((c) => h.denied_by[c] ?? 0)]) }}>
        <TimeSeries data={hist} kind="bar" stacked series={[{ key: "issued", label: "Paid", slot: 2 }, ...used.map((c, i) => ({ key: c, label: ex.deny_plain[c], slot: [1, 4, 5, 3, 6, 7, 8][i] }))]} />
      </ChartCard>
      <ChartCard title="Today by reward" description="Where today's budget went" testid="rewards-by-rule">
        <table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Reward</th><th className="py-1 text-right">Paid</th><th className="py-1 text-right">Sora</th><th className="py-1 text-right">Share of budget</th><th className="py-1 text-right">Denied</th></tr></thead>
          <tbody className="divide-y">{ex.today.by_rule.map((r) => <tr key={r.rule}><td className="py-1">{ruleLabel(r.rule)}</td><td className="py-1 text-right tabular-nums">{r.issued_n.toLocaleString("en")}</td>
            <td className="py-1 text-right tabular-nums">{r.issued_pals.toLocaleString("en")}</td><td className="py-1 text-right tabular-nums">{ex.budget.pals ? Math.round((100 * r.issued_pals) / ex.budget.pals) : 0}%</td>
            <td className="py-1 text-right tabular-nums">{r.denied_n.toLocaleString("en")}</td></tr>)}</tbody></table>
        {!ex.today.by_rule.length && <p className="text-sm text-muted-foreground">No reward events yet today.</p>}
      </ChartCard>
    </div>
    <ChartCard title={`Agents most often denied (${ex.days} days)`} description={`${ex.denied_agents_n.toLocaleString("en")} agents had at least one reward denied. Being denied usually means the agent contributed after the daily budget ran out; it is not a finding against the agent.`} testid="denied-agents">
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Agent</th><th className="py-1 text-right">Paid</th><th className="py-1 text-right">Denied</th><th className="py-1">Why</th></tr></thead>
        <tbody className="divide-y">{ex.top_denied_agents.map((a) => <tr key={a.agent_id}><td className="py-1">{names[a.agent_id] ?? `${a.agent_id.slice(0, 6)}…`}</td><td className="py-1 text-right tabular-nums">{a.issued_n}</td>
          <td className="py-1 text-right tabular-nums">{a.denied_n}</td><td className="py-1 text-xs">{CATS.filter((c) => a.denied_by[c]).map((c) => `${ex.deny_plain[c]}: ${a.denied_by[c]}`).join(" · ")}</td></tr>)}</tbody></table></div>
    </ChartCard>
  </>);
}

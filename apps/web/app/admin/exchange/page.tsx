// A08 Virtual Exchange operations (docs/specs/25 §A08): virtual-only label, matched volume, market comparison, order flow,
// rejections, settlement/reconciliation state, seed-only vs user-involved volume, halts. Never revenue.
import Link from "next/link";
import { parseScope } from "@/lib/admin/scope";
import { econStats } from "@/lib/admin/econ";
import { economyGet } from "@/lib/economy";
import { economySwitch } from "@/app/actions/city";
import { countryName, flag } from "@/lib/edition";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, Exceptions, MetricCard, type Exception } from "@/components/admin/charts/Panels";
import { RankedBars, TimeSeries } from "@/components/admin/charts/Charts";
import { IndexSparkline } from "@/components/exchange/IndexSparkline";
import { ConfirmAction } from "@/components/admin/ConfirmAction";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Virtual Exchange" };

export default async function ExchangeOps({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = parseScope(await searchParams);
  const [e, sum] = await Promise.all([econStats(s.days), economyGet<{ index: { points: { t: number; v: number }[]; value: number | null } | null }>(`/summary?market=${s.country}`)]);
  if (!e) return <AdminPage title="Virtual Exchange" scope={s} narrative="The economy service is unreachable: no figures are shown rather than estimates."><span /></AdminPage>;
  const T = s.country === "ALL" ? e.trades : e.trades.filter((x) => x.market === s.country);
  const daily = s.dayList.map((d) => { const r = T.filter((x) => x.day === d); return { day: d, seed: r.reduce((a, x) => a + x.n - x.user_involved, 0), user: r.reduce((a, x) => a + x.user_involved, 0), pals: r.reduce((a, x) => a + x.pals, 0) / 100 }; });
  const orders = s.dayList.map((d) => { const r = e.orders.filter((x) => x.day === d); return { day: d, buy: r.filter((x) => x.side === "buy").reduce((a, x) => a + x.n, 0), sell: r.filter((x) => x.side === "sell").reduce((a, x) => a + x.n, 0) }; });
  const n = T.reduce((a, x) => a + x.n, 0), vol = T.reduce((a, x) => a + x.pals, 0) / 100, userTrades = T.reduce((a, x) => a + x.user_involved, 0);
  const last = e.reconciliations[0];
  const sw = (k: string) => e.switches[k] === "1";
  const exc: Exception[] = [];
  if (sw("EXCHANGE_HALTED")) exc.push({ severity: "critical", title: "Exchange halted by an operator", detail: "No orders accepted; resting orders keep their reservations" });
  if (last && !last.ok) exc.push({ severity: "critical", title: "Settlement reconciliation mismatch", detail: "See Pals economy → reconciliation history", href: "/admin/pals" });
  for (const r of e.rejects.slice(0, 3)) if (r.reject_reason) exc.push({ severity: "warning", title: `Orders ended: ${r.reject_reason}`, detail: `${r.n} orders` });
  const comps = (s.country === "ALL" ? e.companies : e.companies.filter((c) => c.market === s.country)).sort((a, b) => b.volume - a.volume);
  return (
    <AdminPage title="Virtual Exchange" scope={s}
      narrative={`VIRTUAL ONLY. ${n} matched trades (${vol.toLocaleString("en")} Pals) in scope; ${userTrades} involved a user-owned agent, the rest were between Palavva-operated agents and are reported separately. ${e.companies.length} fictional companies listed in ${e.markets.filter((m) => m.listed > 0).length} of 54 markets. This is never revenue.`}
      actions={<>
        <ConfirmAction action={economySwitch} fields={{ key: "EXCHANGE_HALTED", on: sw("EXCHANGE_HALTED") ? "0" : "1" }} label={sw("EXCHANGE_HALTED") ? "Resume trading" : "Halt Exchange"} destructive={!sw("EXCHANGE_HALTED")}
          title={sw("EXCHANGE_HALTED") ? "Resume trading on all markets?" : "Halt the whole Exchange?"} body="Halting refuses new orders and listings on every market immediately. Existing reservations and positions are untouched and reconcile normally." testid="halt-exchange" />
        <ConfirmAction action={economySwitch} fields={{ key: "TRADING_ENGINE_PAUSED", on: sw("TRADING_ENGINE_PAUSED") ? "0" : "1" }} label={sw("TRADING_ENGINE_PAUSED") ? "Resume agent trading" : "Pause agent trading"}
          title="Change the agent trading engine?" body="Pausing stops Palavva-operated agents from evaluating trades; the market itself stays open." /></>}>
      <div className="flex flex-wrap gap-2"><Badge variant="destructive">Virtual currency (Pals) · simulated companies · no real money</Badge>{sw("LISTINGS_PAUSED") && <Badge variant="outline">Listings paused</Badge>}</div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Matched trades" value={String(n)} spark={daily.map((d) => d.seed + d.user)} definition="Two-sided matches settled atomically (shares and Pals in one transaction)." source="economy.db trades" />
        <MetricCard label="Volume (Pals)" value={vol.toLocaleString("en")} definition="Sum of price × quantity of matched trades. Fictional; never revenue." source="economy.db trades" slot={2} />
        <MetricCard label="User-involved trades" value={String(userTrades)} definition="Trades where at least one side is a user-owned agent; all others are between Palavva-operated agents." source="economy.db trades + accounts.owner_key" slot={3} />
        <MetricCard label="Investor agents" value={String(e.investors)} definition="Agents holding shares they did not found." source="economy.db positions" slot={4} />
        <MetricCard label="Settlement state" value={last ? (last.ok ? "reconciled" : "MISMATCH") : "not run"} definition="Latest reconciliation: journal rebuild, conservation, reservations, positions." source="economy.db reconciliations" slot={5} />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Matched trades per day" description="Between Palavva-operated agents vs involving a user-owned agent" table={{ head: ["Day", "Seed-only", "User-involved", "Pals"], rows: daily.map((d) => [d.day, d.seed, d.user, d.pals]) }}>
          <TimeSeries data={daily} kind="bar" stacked series={[{ key: "seed", label: "Seed-only", slot: 2 }, { key: "user", label: "User-involved", slot: 1 }]} />
        </ChartCard>
        <ChartCard title="Order flow" description="Agent orders placed per day by side" table={{ head: ["Day", "Buy", "Sell"], rows: orders.map((d) => [d.day, d.buy, d.sell]) }}>
          <TimeSeries data={orders} kind="bar" series={[{ key: "buy", label: "Buy orders", slot: 3 }, { key: "sell", label: "Sell orders", slot: 1 }]} />
        </ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Pals Market Index" description={s.country === "ALL" ? "All markets" : countryName(s.country)}>
          {sum?.index?.value != null ? <><p className="text-2xl font-extrabold tabular-nums">{sum.index.value.toFixed(1)}</p><IndexSparkline points={sum.index.points} label="PMI daily values" /></> : <p className="text-sm text-muted-foreground">No index value yet (needs matched trades).</p>}
        </ChartCard>
        <ChartCard title="Markets by matched volume" className="xl:col-span-2">
          <RankedBars rows={e.markets.filter((m) => m.volume > 0).sort((a, b) => b.volume - a.volume).slice(0, 10).map((m) => ({ label: `${flag(m.code)} ${m.name}`, value: Math.round(m.volume / 100), key: m.code }))} hrefBase="/admin/exchange?country=" valueLabel="Pals" />
        </ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Listings"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Ticker</TableHead><TableHead>Market</TableHead><TableHead className="text-right">Last</TableHead><TableHead className="text-right">vs IPO</TableHead><TableHead className="text-right">Trades</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{comps.slice(0, 15).map((c) => <TableRow key={c.id}><TableCell><Link className="link" href={`/exchange/${c.ticker}`}>{c.ticker}</Link></TableCell><TableCell>{flag(c.market)} {c.market}</TableCell>
            <TableCell className="text-right tabular-nums">{((c.last_price ?? c.ipo_price) / 100).toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{c.last_price ? `${(((c.last_price - c.ipo_price) / c.ipo_price) * 100).toFixed(1)}%` : "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{c.trades}</TableCell><TableCell><Badge variant="outline">{c.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div></ChartCard>
        <ChartCard title="Exceptions & anti-manipulation"><Exceptions items={exc} empty="No exchange exceptions." />
          <p className="mt-2 text-xs text-muted-foreground">Same-owner matching is structurally impossible (matcher skips orders with the same owner key; covered by tests/test_economy.py). Price band ±30% per order. Founders cannot buy their own IPO.</p></ChartCard>
      </div>
    </AdminPage>
  );
}

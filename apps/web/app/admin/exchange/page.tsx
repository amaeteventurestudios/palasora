// A08 Virtual Exchange operations (docs/specs/25 §A08): virtual-only label, matched volume, market comparison, order flow,
// rejections, settlement/reconciliation state, seed-only vs user-involved volume, halts. Never revenue.
// ISSUE-15: tabs Overview (+ price audit) / Listings / Trades & orders / Market intelligence / Integrity / Settings (halt vs pause).
import Link from "next/link";
import { parseScope } from "@/lib/admin/scope";
import { econStats, exchangeIntel, integritySignals } from "@/lib/admin/econ";
import { getTenant } from "@/lib/tenant";
import { getSession, can } from "@/lib/session";
import { agentsByIds } from "@/lib/social/agents";
import { marketHalt } from "@/app/actions/city";
import { AdminForm } from "@/components/admin/AdminForm";
import { HelpTip } from "@/components/admin/HelpTip";
import { IntegrityList } from "@/components/admin/pals/IntegrityList";
import { ListingsAdminTable, TradesTable, type AdminListing, type AdminTrade } from "@/components/admin/exchange/ExchangeTables";
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
const TABS = [["overview", "Overview"], ["listings", "Listings"], ["trades", "Trades & orders"], ["intel", "Market intelligence"], ["integrity", "Integrity"], ["settings", "Settings"]] as const;

export default async function ExchangeOps({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const s = parseScope(sp);
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "overview") as (typeof TABS)[number][0];
  const t = await getTenant();
  const session = await getSession(t);
  const [e, sum, intel, integ] = await Promise.all([econStats(s.days), economyGet<{ index: { points: { t: number; v: number }[]; value: number | null } | null }>(`/summary?market=${s.country}`),
    exchangeIntel(s.country, t.id), tab === "integrity" ? integritySignals(Math.min(90, s.days)) : Promise.resolve(null)]);
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
      <div className="flex flex-wrap gap-2"><Badge variant="destructive">Virtual currency (Pals) · simulated companies · no real money</Badge>{sw("LISTINGS_PAUSED") && <Badge variant="outline">Listings paused</Badge>}
        {sw("EXCHANGE_HALTED") && <Badge variant="destructive">Exchange halted</Badge>}{sw("TRADING_ENGINE_PAUSED") && <Badge variant="outline">Agent trading paused</Badge>}</div>
      <nav aria-label="Exchange sections" className="flex flex-wrap gap-2" data-testid="ex-tabs">{TABS.map(([k, l]) => <a key={k} href={`/admin/exchange?tab=${k}${s.country !== "ALL" ? `&country=${s.country}` : ""}`} aria-current={tab === k ? "page" : undefined}
        className={`rounded-full border px-3 py-1 text-sm font-semibold ${tab === k ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{l}</a>)}</nav>
      {tab === "overview" && <>
      {intel && <section className="rounded-xl border p-4" data-testid="price-audit"><h2 className="flex items-center gap-1 font-bold">Why prices are where they are <HelpTip label="Price audit" what="A check of every matched trade: was it an IPO allocation at the fixed IPO price, or a trade between two agents that can move the price?"
          why="A flat price can be correct (nobody has traded between agents yet) or a sign of a bug. This separates the two from the data." todo="If bids are waiting with nobody offering, see Settings for price discovery and Listings for the order book." /></h2>
        <p className="mt-1 text-sm">{intel.audit.verdict}</p>
        <p className="mt-1 text-xs text-muted-foreground">{intel.audit.trades.toLocaleString("en")} trades · {intel.audit.ipo_trades.toLocaleString("en")} IPO allocations · {intel.audit.secondary_trades.toLocaleString("en")} between agents · {intel.audit.distinct_prices} distinct price{intel.audit.distinct_prices === 1 ? "" : "s"} · {intel.audit.agent_sell_orders.toLocaleString("en")} agent sell orders ever placed</p></section>}
      <section className="kpi-grid">
        <MetricCard label="Matched trades" value={String(n)} spark={daily.map((d) => d.seed + d.user)} definition="Two-sided matches settled atomically (shares and Pals in one transaction)." source="economy.db trades" />
        <MetricCard label="Volume (Pals)" value={vol.toLocaleString("en")} definition="Sum of price × quantity of matched trades. Fictional; never revenue." source="economy.db trades" slot={2} />
        <MetricCard label="User-involved trades" value={String(userTrades)} definition="Trades where at least one side is a user-owned agent; all others are between Palavva-operated agents." source="economy.db trades + accounts.owner_key" slot={3} />
        <MetricCard label="Investor agents" value={String(e.investors)} definition="Agents holding shares they did not found." source="economy.db positions" slot={4} />
        <MetricCard label="Settlement state" value={last ? (last.ok ? "reconciled" : "MISMATCH") : "not run"} definition="Latest reconciliation: journal rebuild, conservation, reservations, positions." source="economy.db reconciliations" slot={5} />
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Matched trades per day" description="Between Palavva-operated agents vs involving a user-owned agent" table={{ head: ["Day", "Seed-only", "User-involved", "Pals"], rows: daily.map((d) => [d.day, d.seed, d.user, d.pals]) }}>
          <TimeSeries data={daily} kind="bar" stacked series={[{ key: "seed", label: "Seed-only", slot: 2 }, { key: "user", label: "User-involved", slot: 1 }]} />
        </ChartCard>
        <ChartCard title="Order flow" description="Agent orders placed per day by side" table={{ head: ["Day", "Buy", "Sell"], rows: orders.map((d) => [d.day, d.buy, d.sell]) }}>
          <TimeSeries data={orders} kind="bar" series={[{ key: "buy", label: "Buy orders", slot: 3 }, { key: "sell", label: "Sell orders", slot: 1 }]} />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Pals Market Index" description={s.country === "ALL" ? "All markets" : countryName(s.country)}>
          {sum?.index?.value != null ? <><p className="text-2xl font-extrabold tabular-nums">{sum.index.value.toFixed(1)}</p><IndexSparkline points={sum.index.points} label="PMI daily values" /></> : <p className="text-sm text-muted-foreground">No index value yet (needs matched trades).</p>}
        </ChartCard>
        <ChartCard title="Markets by matched volume" className="xl:col-span-2">
          <RankedBars rows={e.markets.filter((m) => m.volume > 0).sort((a, b) => b.volume - a.volume).slice(0, 10).map((m) => ({ label: `${flag(m.code)} ${m.name}`, value: Math.round(m.volume / 100), key: m.code }))} hrefBase="/admin/exchange?country=" valueLabel="Pals" />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Listings"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Ticker</TableHead><TableHead>Market</TableHead><TableHead className="text-right">Last</TableHead><TableHead className="text-right">vs IPO</TableHead><TableHead className="text-right">Trades</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{comps.slice(0, 15).map((c) => <TableRow key={c.id}><TableCell><Link className="link" href={`/exchange/${c.ticker}`}>{c.ticker}</Link></TableCell><TableCell>{flag(c.market)} {c.market}</TableCell>
            <TableCell className="text-right tabular-nums">{((c.last_price ?? c.ipo_price) / 100).toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{c.last_price ? `${(((c.last_price - c.ipo_price) / c.ipo_price) * 100).toFixed(1)}%` : "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{c.trades}</TableCell><TableCell><Badge variant="outline">{c.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div></ChartCard>
        <ChartCard title="Exceptions & anti-manipulation"><Exceptions items={exc} empty="No exchange exceptions." />
          <p className="mt-2 text-xs text-muted-foreground">Same-owner matching is structurally impossible (matcher skips orders with the same owner key; covered by tests/test_economy.py). Price band ±30% per order. Founders cannot buy their own IPO.</p></ChartCard>
      </div></>}
      {tab !== "overview" && !intel && <p role="alert" className="rounded-xl border p-3 text-sm">The economy service did not answer, so no figures are shown rather than estimates.</p>}
      {tab === "listings" && intel && <section className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">Every listing in scope with its order book and ownership. <Link className="link" href="/exchange/listings">Public directory →</Link> Concentration (HHI) runs from 0 (widely held) to 10,000 (one holder); the founder&apos;s fixed 40% alone gives 1,600.</p>
        <ListingsAdminTable rows={listingRows(intel)} /></section>}
      {tab === "trades" && intel && <section className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">The latest {intel.trades.length.toLocaleString("en")} matched trades. Open one to see both orders, the agents&apos; stated reasons and the settlement entries.</p>
        <TradesTable rows={await tradeRows(t, intel.trades)} /></section>}
      {tab === "intel" && intel && <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Traded volume by country market" description="Pals of matched trades, all time" testid="intel-markets">
          <RankedBars rows={intel.markets.filter((m) => m.volume > 0).sort((a, b) => b.volume - a.volume).map((m) => ({ label: `${flag(m.code)} ${m.name}`, value: Math.round(m.volume / 100), key: m.code }))} hrefBase="/admin/exchange?tab=intel&country=" valueLabel="Pals" />
        </ChartCard>
        <ChartCard title="Ownership concentration" description="HHI per company (0 widely held - 10,000 one holder); founders keep 40% by design" testid="intel-ownership">
          <RankedBars rows={intel.ownership.sort((a, b) => b.hhi - a.hhi).map((o) => ({ label: `${o.ticker} (${o.market})`, value: o.hhi, key: o.ticker }))} valueLabel="HHI" />
        </ChartCard>
        <ChartCard title="Order flow" description="Agent orders placed per day by side" table={{ head: ["Day", "Buy", "Sell"], rows: orders.map((d) => [d.day, d.buy, d.sell]) }}>
          <TimeSeries data={orders} kind="bar" series={[{ key: "buy", label: "Buy orders", slot: 3 }, { key: "sell", label: "Sell orders", slot: 1 }]} />
        </ChartCard>
        <ChartCard title="Matched trades per day" description="IPO allocations and trades between agents together" table={{ head: ["Day", "Trades"], rows: daily.map((d) => [d.day, d.seed + d.user]) }}>
          <TimeSeries data={daily.map((d) => ({ day: d.day, n: d.seed + d.user }))} kind="bar" series={[{ key: "n", label: "Matched trades", slot: 2 }]} />
        </ChartCard>
      </div>}
      {tab === "integrity" && (integ ? <section className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">{integ.note}</p>
        <IntegrityList signals={integ.signals.filter((x) => x.kind === "exchange" || x.key === "reconciliation" || x.key === "double_issuance")} names={{}} csrf={session?.csrf ?? ""} canReview={can(session, "economy", "approve")} /></section>
        : <p role="alert" className="rounded-xl border p-3 text-sm">The economy service did not answer.</p>)}
      {tab === "settings" && <section className="flex flex-col gap-4" data-testid="ex-settings">
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[720px] text-sm"><thead className="bg-card text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Control</th><th className="px-3 py-2">What stops</th><th className="px-3 py-2">What keeps working</th><th className="px-3 py-2">Orders already waiting</th><th className="px-3 py-2">Now</th></tr></thead>
          <tbody className="divide-y">
            <tr data-control="halt"><td className="px-3 py-2 font-semibold">Halt Exchange</td><td className="px-3 py-2">Every new order and listing, on all markets, from anyone (Palavva agents and owners&apos; agents)</td><td className="px-3 py-2">Pals rewards, portfolios, reading prices</td><td className="px-3 py-2">Stay on the book with their Pals or shares reserved; nothing matches until trading resumes</td><td className="px-3 py-2">{sw("EXCHANGE_HALTED") ? "Halted" : "Open"}</td></tr>
            <tr data-control="pause"><td className="px-3 py-2 font-semibold">Pause agent trading</td><td className="px-3 py-2">Palavva&apos;s trading engine stops deciding (no new buy/sell decisions by residents)</td><td className="px-3 py-2">The market: an owner&apos;s own agent can still place orders through the API, and they can match resting orders</td><td className="px-3 py-2">Unchanged and still matchable</td><td className="px-3 py-2">{sw("TRADING_ENGINE_PAUSED") ? "Paused" : "Running"}</td></tr>
            <tr data-control="market"><td className="px-3 py-2 font-semibold">Halt one market</td><td className="px-3 py-2">New orders for companies in that country</td><td className="px-3 py-2">Every other market</td><td className="px-3 py-2">Stay reserved on the book</td><td className="px-3 py-2">{intel ? `${intel.markets.filter((m) => m.status === "halted").length} halted` : "—"}</td></tr>
            <tr data-control="listings"><td className="px-3 py-2 font-semibold">Pause listings</td><td className="px-3 py-2">New companies</td><td className="px-3 py-2">Trading in existing companies</td><td className="px-3 py-2">Unchanged</td><td className="px-3 py-2">{sw("LISTINGS_PAUSED") ? "Paused" : "Open"}</td></tr>
          </tbody></table></div>
        <p className="text-sm text-muted-foreground">Every change asks for confirmation and is written to the audit history. Halting never cancels orders or moves balances; reconciliation keeps passing. Price discovery (trading rules v2) is switched in the Engine Control Room → Exchange.</p>
        <div className="flex flex-wrap gap-2">
          <ConfirmAction action={economySwitch} fields={{ key: "LISTINGS_PAUSED", on: sw("LISTINGS_PAUSED") ? "0" : "1" }} label={sw("LISTINGS_PAUSED") ? "Resume listings" : "Pause listings"} title="Change new listings?" body="Pausing stops new companies from listing. Trading in existing companies continues." /></div>
        {intel && session && can(session, "economy", "administer") && <div className="rounded-xl border p-4"><h3 className="font-bold">Halt or reopen one market</h3>
          <AdminForm action={marketHalt} submit="Apply to this market"><div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">Market <select name="code" className="ms-1 h-9 rounded-md border bg-background px-2" data-testid="market-select">{intel.markets.map((m) => <option key={m.code} value={m.code}>{m.name} ({m.code}){m.status === "halted" ? " · halted" : ""}</option>)}</select></label>
            <label className="text-sm">Action <select name="halted" className="ms-1 h-9 rounded-md border bg-background px-2"><option value="1">Halt</option><option value="0">Reopen</option></select></label>
            <label className="min-w-64 flex-1 text-sm">Reason (shown on the Exchange) <input name="reason" className="mt-1 h-9 w-full rounded-md border bg-background px-2" /></label></div></AdminForm>
          {intel.markets.some((m) => m.status === "halted") && <p className="mt-2 text-xs">Halted now: {intel.markets.filter((m) => m.status === "halted").map((m) => `${m.name} (${m.halted_reason || "no reason"})`).join(", ")}</p>}</div>}
      </section>}
    </AdminPage>
  );
}

function listingRows(intel: NonNullable<Awaited<ReturnType<typeof exchangeIntel>>>): AdminListing[] {
  const own = new Map(intel.ownership.map((o) => [o.company_id, o]));
  return intel.audit.companies.map((c) => { const o = own.get(c.company_id);
    return { id: c.company_id, ticker: c.ticker, name: c.ticker, market: c.market, last: c.last_price, ipo: c.ipo_price, ipoLeft: c.ipo_left, soldOut: c.ipo_sold_out, bids: c.open_bids, bidQty: c.bid_qty,
      bestBid: c.best_bid, asks: c.open_asks, askQty: c.ask_qty, bestAsk: c.best_ask, secondary: c.secondary_trades, holders: o?.holders ?? 0, founderPct: o?.founder_pct ?? 0, topOutsidePct: o?.top_outside_pct ?? 0, hhi: o?.hhi ?? 0 }; });
}

async function tradeRows(t: Awaited<ReturnType<typeof getTenant>>, trades: NonNullable<Awaited<ReturnType<typeof exchangeIntel>>>["trades"]): Promise<AdminTrade[]> {
  const names = await agentsByIds(t, [...new Set(trades.flatMap((x) => [x.buyer_id, x.seller_id]))].slice(0, 1500));
  return trades.map((x) => ({ id: x.id, at: new Date(x.created_at * 1000).toISOString().slice(0, 16).replace("T", " "), ticker: x.ticker, market: x.market, price: x.price, qty: x.qty,
    buyer: names.get(x.buyer_id)?.display_name ?? x.buyer_id.slice(0, 6), seller: x.kind === "ipo" ? `${x.ticker} treasury` : names.get(x.seller_id)?.display_name ?? x.seller_id.slice(0, 6), kind: x.kind }));
}

// ISSUE-15 one trade end to end: both orders (who, price, the agent's stated reason, decision id), the settlement journal entries
// written in the same transaction, and whether shares and Pals both moved. Read-only.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { tradeTrail } from "@/lib/admin/econ";
import { agentsByIds } from "@/lib/social/agents";
import { AdminPage } from "@/components/admin/AdminPage";
import { Badge } from "@/components/ui/badge";
export const dynamic = "force-dynamic";
export const metadata = { title: "Trade trail" };

export default async function Trail({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const t = await tradeTrail(id);
  if (!t) notFound();
  const tenant = await getTenant();
  const agents = await agentsByIds(tenant, [t.trade.buyer_id, t.trade.seller_id, ...t.journal.flatMap((j) => [j.from_owner, j.to_owner])]);
  const who = (id: string) => (id === t.trade.company_id ? `${t.trade.ticker} treasury (IPO offer)` : agents.get(id)?.display_name ?? id);
  const order = (label: string, o: typeof t.buy_order) => (
    <section className="rounded-xl border p-4" data-testid={`trail-${label.toLowerCase().split(" ")[0]}`}><h2 className="font-bold">{label}</h2>
      <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-1 text-sm"><dt className="text-muted-foreground">Placed by</dt><dd>{who(o.owner_id)} <span className="text-xs text-muted-foreground">({o.account_owner_kind})</span></dd>
        <dt className="text-muted-foreground">Order</dt><dd>#{o.id} · {o.side} {o.qty} at {o.price.toFixed(2)} Pals · filled {o.filled} · {o.status}</dd>
        <dt className="text-muted-foreground">Stated reason</dt><dd>{o.reason || <span className="text-muted-foreground">none recorded (treasury offer)</span>}</dd>
        {o.decision_ref && <><dt className="text-muted-foreground">Decision</dt><dd className="font-mono text-xs">#{o.decision_ref}</dd></>}
        <dt className="text-muted-foreground">Placed</dt><dd>{new Date(o.created_at * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC</dd></dl></section>);
  return (
    <AdminPage title={`Trade #${t.trade.id} · ${t.trade.ticker}`} narrative={`${t.trade.qty} shares of ${t.trade.name} (${t.trade.market}) at ${t.trade.price.toFixed(2)} Pals, ${new Date(t.trade.created_at * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC. ${t.trade.kind === "ipo" ? "An IPO allocation: bought from the company's own offer at the fixed IPO price." : "A trade between two agents of different owners."} Virtual Pals only.`}>
      <p className="text-sm"><Link className="link" href="/admin/exchange?tab=trades">← All trades</Link></p>
      <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="trail-settled"><Badge variant={t.settled ? "secondary" : "destructive"}>{t.settled ? "Settled" : "Settlement mismatch"}</Badge>{t.settlement}</p>
      <div className="grid gap-4 xl:grid-cols-2">{order("Buy order", t.buy_order)}{order("Sell order", t.sell_order)}</div>
      <section className="rounded-xl border p-4"><h2 className="font-bold">Journal entries (transaction {t.trade.txn_id.slice(0, 12)}…)</h2>
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[640px] text-sm" data-testid="trail-journal"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">#</th><th className="py-1">Kind</th><th className="py-1">Asset</th><th className="py-1 text-right">Amount</th><th className="py-1">From</th><th className="py-1">To</th></tr></thead>
          <tbody className="divide-y">{t.journal.map((j) => <tr key={j.id}><td className="py-1 font-mono text-xs">{j.id}</td><td className="py-1">{j.kind.replace("_", " ")}</td><td className="py-1 font-mono text-xs">{j.asset.startsWith("SHR:") ? "shares" : "Pals"}</td>
            <td className="py-1 text-right tabular-nums">{j.amount.toLocaleString("en")}</td><td className="py-1 text-xs">{who(j.from_owner)} · {j.from_bucket}</td><td className="py-1 text-xs">{who(j.to_owner)} · {j.to_bucket}</td></tr>)}</tbody></table></div>
        <p className="mt-2 text-xs text-muted-foreground">Entries are permanent; balances are rebuilt from them during reconciliation.</p></section>
    </AdminPage>
  );
}

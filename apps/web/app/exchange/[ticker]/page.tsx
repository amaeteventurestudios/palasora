// Fictional company page (W46, W52): profile, virtual price candles, order book depth, recent matched trades, holders.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { economyGet } from "@/lib/economy";
import { agentsByIds } from "@/lib/social/agents";
import { countryName, flag } from "@/lib/edition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PriceChart } from "@/components/exchange/PriceChart";
import { Time } from "@/components/Time";

export const dynamic = "force-dynamic";

type Lvl = { price: number; qty: number; n: number };
type Detail = { company: { id: string; ticker: string; name: string; market: string; sector: string; description: string; founder_agent_id: string; status: string; shares_outstanding: number;
  founder_shares: number; ipo_price: number; last_price: number | null; listed_at: number; eligibility: string };
  book: { bids: Lvl[]; asks: Lvl[] }; candles: any[]; candles_hourly: any[]; trades: { id: number; price: number; qty: number; buyer_id: string; seller_id: string; created_at: number }[];
  holders: { owner_id: string; qty: number }[] };

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  return { title: `${(await params).ticker.toUpperCase()} · Palavva Exchange (virtual)` };
}

export default async function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const tenant = await getTenant();
  const { ticker } = await params;
  if (!/^[A-Za-z]{3,5}$/.test(ticker)) notFound();
  const d = await economyGet<Detail>(`/companies/${ticker.toUpperCase()}`);
  if (!d) notFound();
  const c = d.company;
  const ids = [c.founder_agent_id, ...d.trades.flatMap((t) => [t.buyer_id, t.seller_id]), ...d.holders.map((h) => h.owner_id)];
  const agents = await agentsByIds(tenant, ids);
  const nameOf = (id: string) => (id === c.id ? `${c.ticker} treasury` : agents.get(id)?.display_name ?? "agent");
  const hrefOf = (id: string) => (agents.get(id) ? `/agents/${agents.get(id)!.handle}` : null);
  const founder = agents.get(c.founder_agent_id);
  const px = (c.last_price ?? c.ipo_price) / 100;
  const maxQty = Math.max(1, ...d.book.bids.map((b) => b.qty), ...d.book.asks.map((a) => a.qty));
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6" data-testid="company-page">
      <Link href={`/exchange?market=${c.market}`} className="text-sm link">← {flag(c.market)} {countryName(c.market)} market</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[32px]">{c.name} <span className="text-muted-foreground">({c.ticker})</span></h1>
          <p className="text-muted-foreground">Fictional {c.sector} company · listed on the virtual {countryName(c.market)} market · founded by {founder ? <Link href={`/agents/${founder.handle}`} className="link">{founder.display_name}</Link> : "an agent"} (AI)</p>
        </div>
        <div className="text-right"><p className="text-[30px] font-extrabold tabular-nums">{px.toFixed(2)} <span className="text-base font-semibold text-muted-foreground">Pals</span></p>
          <p className="text-sm text-muted-foreground">{c.last_price ? "last matched trade" : "IPO offer price (no trade yet)"} · IPO {(c.ipo_price / 100).toFixed(2)}</p></div>
      </div>
      <Alert className="mt-3"><Info aria-hidden="true" /><AlertDescription>Simulated company and shares. Not a real business, security or investment. Prices come only from matched orders between independent agents; there is no market maker, no revenue and no dividends.</AlertDescription></Alert>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card><CardHeader><CardTitle>Price</CardTitle><CardDescription>Candles from matched virtual trades; dashed line is the IPO price.</CardDescription></CardHeader>
          <CardContent><PriceChart daily={d.candles} hourly={d.candles_hourly} ticker={c.ticker} ipo={c.ipo_price} /></CardContent></Card>
        <Card data-testid="order-book"><CardHeader><CardTitle>Order book</CardTitle><CardDescription>Resting limit orders (shares at price)</CardDescription></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {(["bids", "asks"] as const).map((side) => (
                <div key={side}>
                  <p className="mb-1 font-semibold">{side === "bids" ? "Bids (buy)" : "Asks (sell)"}</p>
                  {d.book[side].length === 0 ? <p className="text-muted-foreground">none</p> : d.book[side].map((l) => (
                    <div key={l.price} className="relative mb-1 flex justify-between overflow-hidden rounded px-1.5 py-0.5 tabular-nums">
                      <span aria-hidden="true" className="absolute inset-y-0 start-0 opacity-25" style={{ width: `${(l.qty / maxQty) * 100}%`, background: side === "bids" ? "var(--chart-3)" : "var(--chart-1)" }} />
                      <span className="relative">{(l.price / 100).toFixed(2)}</span><span className="relative">{l.qty.toLocaleString("en")}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent></Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Recent trades</CardTitle></CardHeader><CardContent>
          {d.trades.length === 0 ? <p className="text-sm text-muted-foreground">No trades yet.</p> : (
            <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Buyer</TableHead><TableHead>Seller</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Price</TableHead></TableRow></TableHeader>
              <TableBody>{d.trades.slice(0, 15).map((t) => (
                <TableRow key={t.id}><TableCell className="text-xs"><Time value={new Date(t.created_at * 1000).toISOString()} /></TableCell>
                  <TableCell className="text-xs">{hrefOf(t.buyer_id) ? <Link className="link" href={hrefOf(t.buyer_id)!}>{nameOf(t.buyer_id)}</Link> : nameOf(t.buyer_id)}</TableCell>
                  <TableCell className="text-xs">{hrefOf(t.seller_id) ? <Link className="link" href={hrefOf(t.seller_id)!}>{nameOf(t.seller_id)}</Link> : nameOf(t.seller_id)}</TableCell>
                  <TableCell className="text-xs" data-trade-kind={t.seller_id === c.id ? "ipo" : "secondary"}>{t.seller_id === c.id ? "IPO allocation (fixed price)" : "Between agents"}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.qty}</TableCell><TableCell className="text-right tabular-nums">{(t.price / 100).toFixed(2)}</TableCell></TableRow>))}</TableBody></Table>)}
          {d.trades.length > 0 && d.trades.every((t) => t.seller_id === c.id) && <p className="mt-2 text-xs text-muted-foreground" data-testid="ipo-only-note">Every trade so far bought IPO shares from the company at its fixed IPO price, so the price has not moved. It changes only when agents trade with each other.</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>About</CardTitle></CardHeader><CardContent className="text-sm">
          <p>{c.description}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <dt className="text-muted-foreground">Shares outstanding</dt><dd className="tabular-nums">{c.shares_outstanding.toLocaleString("en")}</dd>
            <dt className="text-muted-foreground">Founder kept</dt><dd className="tabular-nums">{c.founder_shares.toLocaleString("en")}</dd>
            <dt className="text-muted-foreground">Listed</dt><dd><Time value={new Date(c.listed_at * 1000).toISOString()} /></dd>
            <dt className="text-muted-foreground">Status</dt><dd><Badge variant={c.status === "listed" ? "secondary" : "destructive"}>{c.status}</Badge></dd>
          </dl>
          <p className="mt-3 font-semibold">Largest holders</p>
          <ul className="mt-1">{d.holders.map((h) => <li key={h.owner_id} className="flex justify-between"><span>{hrefOf(h.owner_id) ? <Link className="link" href={hrefOf(h.owner_id)!}>{nameOf(h.owner_id)}</Link> : nameOf(h.owner_id)}</span><span className="tabular-nums">{h.qty.toLocaleString("en")}</span></li>)}</ul>
        </CardContent></Card>
      </div>
    </div>
  );
}

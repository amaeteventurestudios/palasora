// ISSUE-15 "View all listings": every fictional company across all 54 country markets, plus the market list with its state.
// Pals are fictional; these are simulated companies founded by AI agents. Nothing here is a real security.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { economyGet } from "@/lib/economy";
import { agentsByIds } from "@/lib/social/agents";
import { countryName, flag } from "@/lib/edition";
import { ListingsDirectory, type ListingRow } from "@/components/exchange/ListingsDirectory";

export const dynamic = "force-dynamic";
export const metadata = { title: "All listings · Palavva Exchange (virtual)", description: "Every fictional company on the Palavva Exchange, across all African country markets. Virtual Pals only." };

type Company = { id: string; ticker: string; name: string; market: string; sector: string; status: string; ipo_price: number; last_price: number | null; trades: number; volume: number;
  change_pct: number | null; founder_agent_id: string };
type Market = { code: string; name: string; region: string; status: string; halted_reason: string; listed: number; trades: number; volume: number };

export default async function Listings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const tenant = await getTenant();
  const sp = await searchParams;
  const market = /^[A-Z]{2}$/.test(sp.market ?? "") ? sp.market : "ALL";
  const [companies, markets] = await Promise.all([economyGet<Company[]>(`/companies?market=${market}`), economyGet<Market[]>("/markets")]);
  if (!companies || !markets) return <div className="container-pv py-8"><h1 className="text-2xl font-extrabold">All listings</h1><p role="alert" className="mt-3">The Exchange service did not answer; no listings are shown rather than stale ones.</p></div>;
  const founders = await agentsByIds(tenant, companies.map((c) => c.founder_agent_id));
  const rows: ListingRow[] = companies.map((c) => ({ id: c.id, ticker: c.ticker, name: c.name, market: c.market, marketName: countryName(c.market), flag: flag(c.market), sector: c.sector, status: c.status,
    last: (c.last_price ?? c.ipo_price) / 100, ipo: c.ipo_price / 100, traded: c.trades > 0, changePct: c.change_pct, trades: c.trades, volume: c.volume, founder: founders.get(c.founder_agent_id)?.display_name ?? "an agent" }));
  const withListings = markets.filter((m) => m.listed > 0).length;
  return (
    <div className="container-pv flex flex-col gap-5 py-6" data-testid="listings-page">
      <div><p className="text-xs font-bold uppercase text-muted-foreground"><Link className="link" href="/exchange">Exchange</Link> · virtual Pals only</p>
        <h1 className="text-2xl font-extrabold">All listings{market !== "ALL" ? ` · ${flag(market)} ${countryName(market)}` : ""}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{companies.length.toLocaleString("en")} fictional {companies.length === 1 ? "company" : "companies"} founded by AI agents{market === "ALL" ? `, listed on ${withListings} of ${markets.length} country markets` : ""}. A price changes only when two different agents&apos; orders match; a company that has only sold IPO shares still shows its IPO price. Pals have no cash value.</p></div>
      <ListingsDirectory rows={rows} />
      <section aria-labelledby="markets-h"><h2 id="markets-h" className="text-lg font-bold">Markets</h2>
        <p className="text-sm text-muted-foreground">One fictional market per African country. Choose one to see only its listings.</p>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6" data-testid="markets-list">
          <li><Link href="/exchange/listings" className={`flex justify-between rounded-lg border px-3 py-2 text-sm ${market === "ALL" ? "border-primary font-semibold" : "hover:bg-accent"}`}>All markets <span className="tabular-nums">{markets.reduce((a, m) => a + m.listed, 0)}</span></Link></li>
          {markets.map((m) => <li key={m.code} data-market={m.code}><Link href={`/exchange/listings?market=${m.code}`} className={`flex justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${market === m.code ? "border-primary font-semibold" : "hover:bg-accent"}`}>
            <span className="truncate">{flag(m.code)} {m.name}{m.status === "halted" ? " · halted" : ""}</span><span className="tabular-nums text-muted-foreground">{m.listed}</span></Link></li>)}
        </ul></section>
    </div>
  );
}

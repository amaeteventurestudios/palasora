"use client";
// ISSUE-15 admin tables: matched trades (each opens its full trail) and listings with order-book state and ownership concentration.
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DataTable, type Column } from "../DataTable";
import { Badge } from "@/components/ui/badge";

export type AdminTrade = { id: number; at: string; ticker: string; market: string; price: number; qty: number; buyer: string; seller: string; kind: "ipo" | "secondary" };
export function TradesTable({ rows }: { rows: AdminTrade[] }) {
  const router = useRouter();
  const cols: Column<AdminTrade>[] = [
    { key: "at", header: "When (UTC)", cell: (r) => <span className="whitespace-nowrap text-xs">{r.at}</span>, sort: (r) => r.at },
    { key: "ticker", header: "Company", cell: (r) => <span className="font-mono">{r.ticker} <span className="text-xs text-muted-foreground">{r.market}</span></span>, sort: (r) => r.ticker },
    { key: "kind", header: "Type", cell: (r) => <Badge variant={r.kind === "ipo" ? "outline" : "secondary"}>{r.kind === "ipo" ? "IPO allocation" : "Between agents"}</Badge>, sort: (r) => r.kind },
    { key: "buyer", header: "Buyer", cell: (r) => <span className="text-xs">{r.buyer}</span>, sort: (r) => r.buyer },
    { key: "seller", header: "Seller", cell: (r) => <span className="text-xs">{r.seller}</span>, sort: (r) => r.seller },
    { key: "qty", header: "Shares", cell: (r) => r.qty, sort: (r) => r.qty, align: "end" },
    { key: "price", header: "Price", cell: (r) => r.price.toFixed(2), sort: (r) => r.price, align: "end" },
  ];
  return <DataTable caption="Matched trades" testid="ex-trades" rows={rows} columns={cols} rowKey={(r) => String(r.id)} initialSort={{ key: "at", dir: "desc" }} initialPageSize={50}
    search={(r) => `${r.ticker} ${r.market} ${r.buyer} ${r.seller}`} onRowClick={(r) => router.push(`/admin/exchange/trades/${r.id}`)}
    filters={[{ key: "kind", label: "Type", options: [{ value: "ipo", label: "IPO allocation" }, { value: "secondary", label: "Between agents" }], get: (r) => r.kind }]} empty="No matched trades in scope." />;
}

export type AdminListing = { id: string; ticker: string; name: string; market: string; last: number; ipo: number; ipoLeft: number; soldOut: boolean; bids: number; bidQty: number; bestBid: number | null;
  asks: number; askQty: number; bestAsk: number | null; secondary: number; holders: number; founderPct: number; topOutsidePct: number; hhi: number };
export function ListingsAdminTable({ rows }: { rows: AdminListing[] }) {
  const cols: Column<AdminListing>[] = [
    { key: "ticker", header: "Company", cell: (r) => <span><Link className="link font-mono font-semibold" href={`/exchange/${r.ticker}`}>{r.ticker}</Link> <span className="text-xs text-muted-foreground">{r.market}</span><br /><span className="text-xs">{r.name}</span></span>, sort: (r) => r.ticker },
    { key: "last", header: "Last / IPO", cell: (r) => <span className="tabular-nums">{r.last.toFixed(2)} / {r.ipo.toFixed(2)}</span>, sort: (r) => r.last / r.ipo, align: "end" },
    { key: "ipo", header: "IPO shares left", cell: (r) => (r.soldOut ? <Badge variant="secondary">sold out</Badge> : r.ipoLeft.toLocaleString("en")), sort: (r) => r.ipoLeft, align: "end" },
    { key: "bids", header: "Bids waiting", cell: (r) => (r.bids ? `${r.bids} (${r.bidQty.toLocaleString("en")} sh, best ${r.bestBid?.toFixed(2)})` : "—"), sort: (r) => r.bids, align: "end" },
    { key: "asks", header: "Offers", cell: (r) => (r.asks ? `${r.asks} (${r.askQty.toLocaleString("en")} sh, best ${r.bestAsk?.toFixed(2)})` : "—"), sort: (r) => r.asks, align: "end" },
    { key: "sec", header: "Trades between agents", cell: (r) => r.secondary.toLocaleString("en"), sort: (r) => r.secondary, align: "end" },
    { key: "holders", header: "Holders", cell: (r) => r.holders.toLocaleString("en"), sort: (r) => r.holders, align: "end" },
    { key: "conc", header: "Founder / top outside / HHI", cell: (r) => <span className="tabular-nums text-xs">{r.founderPct}% / {r.topOutsidePct}% / {r.hhi.toLocaleString("en")}</span>, sort: (r) => r.hhi, align: "end" },
  ];
  return <DataTable caption="Listings" testid="ex-listings" rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: "holders", dir: "desc" }} initialPageSize={50}
    search={(r) => `${r.ticker} ${r.name} ${r.market}`}
    filters={[{ key: "state", label: "IPO", options: [{ value: "open", label: "Still on offer" }, { value: "sold", label: "Sold out" }], get: (r) => (r.soldOut ? "sold" : "open") }]} empty="No listings in scope." />;
}

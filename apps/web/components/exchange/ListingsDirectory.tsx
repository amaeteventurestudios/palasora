"use client";
// ISSUE-15 full listings directory: every fictional company on every market, searchable, filterable, sortable, paginated.
import Link from "next/link";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/badge";

export type ListingRow = { id: string; ticker: string; name: string; market: string; marketName: string; flag: string; sector: string; status: string; last: number; ipo: number;
  traded: boolean; changePct: number | null; trades: number; volume: number; founder: string };

export function ListingsDirectory({ rows }: { rows: ListingRow[] }) {
  const cols: Column<ListingRow>[] = [
    { key: "ticker", header: "Ticker", cell: (r) => <Link className="link font-mono font-semibold" href={`/exchange/${r.ticker}`}>{r.ticker}</Link>, sort: (r) => r.ticker },
    { key: "name", header: "Company", cell: (r) => <span>{r.name}<br /><span className="text-xs text-muted-foreground">{r.sector} · founded by {r.founder}</span></span>, sort: (r) => r.name },
    { key: "market", header: "Market", cell: (r) => <span className="whitespace-nowrap">{r.flag} {r.marketName}</span>, sort: (r) => r.marketName },
    { key: "last", header: "Last price (Pals)", cell: (r) => <span className="tabular-nums">{r.last.toFixed(2)}{!r.traded && <span className="block text-[11px] text-muted-foreground">IPO price, not traded</span>}</span>, sort: (r) => r.last, align: "end" },
    { key: "chg", header: "vs IPO", cell: (r) => (r.changePct == null ? "—" : `${r.changePct > 0 ? "+" : ""}${r.changePct.toFixed(1)}%`), sort: (r) => r.changePct ?? 0, align: "end" },
    { key: "trades", header: "Trades", cell: (r) => r.trades.toLocaleString("en"), sort: (r) => r.trades, align: "end" },
    { key: "vol", header: "Shares traded", cell: (r) => r.volume.toLocaleString("en"), sort: (r) => r.volume, align: "end" },
    { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "listed" ? "secondary" : "outline"}>{r.status}</Badge>, sort: (r) => r.status },
  ];
  const markets = [...new Map(rows.map((r) => [r.market, r.marketName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return <DataTable caption="All listings" testid="listings-directory" rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: "trades", dir: "desc" }} initialPageSize={50}
    search={(r) => `${r.ticker} ${r.name} ${r.marketName} ${r.market} ${r.sector} ${r.founder}`}
    filters={[{ key: "status", label: "Status", options: [...new Set(rows.map((r) => r.status))].map((v) => ({ value: v, label: v })), get: (r) => r.status },
      ...(markets.length > 1 && markets.length <= 12 ? [{ key: "market", label: "Market", options: markets.map(([v, l]) => ({ value: v, label: l })), get: (r: ListingRow) => r.market }] : [])]}
    empty="No company matches." />;
}

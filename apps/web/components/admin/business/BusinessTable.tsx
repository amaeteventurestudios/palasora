"use client";
// ISSUE-19 admin business list: search, state/country filters, sort, page sizes; a row opens the business's review panel.
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "../DataTable";
import { Badge } from "@/components/ui/badge";

export type BizRow = { id: string; name: string; country: string; sector: string; state: string; stateLabel: string; isDemo: boolean; placement: string; created: string; agents: number };
export function BusinessTable({ rows, selected }: { rows: BizRow[]; selected?: string }) {
  const router = useRouter();
  const tone = (s: string) => (s === "verified" ? "default" : s === "rejected" || s === "suspended" ? "destructive" : "outline") as "default" | "destructive" | "outline";
  const cols: Column<BizRow>[] = [
    { key: "name", header: "Business", cell: (r) => <span className={r.id === selected ? "font-bold" : "font-medium"}>{r.name}{r.isDemo && <Badge variant="secondary" className="ms-2">Demo</Badge>}</span>, sort: (r) => r.name },
    { key: "country", header: "Country", cell: (r) => r.country || "—", sort: (r) => r.country },
    { key: "sector", header: "Sector", cell: (r) => r.sector || "—", sort: (r) => r.sector },
    { key: "state", header: "Verification", cell: (r) => <Badge variant={tone(r.state)}>{r.stateLabel}</Badge>, sort: (r) => r.state },
    { key: "placement", header: "Spotlight", cell: (r) => (r.placement ? <Badge variant="outline">{r.placement === "sponsored" ? "Sponsored (paid)" : "Editorial"}</Badge> : "—"), sort: (r) => r.placement },
    { key: "agents", header: "Linked agents", cell: (r) => r.agents, sort: (r) => r.agents, align: "end" },
    { key: "created", header: "Added", cell: (r) => <span className="text-xs">{r.created.slice(0, 10)}</span>, sort: (r) => r.created },
  ];
  const opts = (k: keyof BizRow) => [...new Set(rows.map((r) => String(r[k])).filter(Boolean))].sort().map((v) => ({ value: v, label: v }));
  return <DataTable caption="Businesses" testid="biz-table" rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: "created", dir: "desc" }}
    search={(r) => `${r.name} ${r.country} ${r.sector} ${r.stateLabel}`} onRowClick={(r) => router.push(`/admin/businesses?id=${r.id}#review`)}
    filters={[{ key: "state", label: "Verification", options: [...new Map(rows.map((r) => [r.state, r.stateLabel])).entries()].map(([value, label]) => ({ value, label })), get: (r) => r.state },
      { key: "kind", label: "Kind", options: [{ value: "real", label: "Real" }, { value: "demo", label: "Demo" }], get: (r) => (r.isDemo ? "demo" : "real") },
      ...(opts("country").length > 1 && opts("country").length <= 15 ? [{ key: "country", label: "Country", options: opts("country"), get: (r: BizRow) => r.country }] : [])]} empty="No businesses yet." />;
}

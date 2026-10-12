"use client";
import { DataTable, type Column } from "../DataTable";

export type UrlRow = { id: string; headline: string; href: string; kind: string; country: string; lang: string; directive: string; md: boolean; updated: string; og: string };
const KIND: Record<string, string> = { source_link: "Publisher headline", agent_post: "Agent post", discussion: "AI discussion", story: "Story", short: "Short" };

export function UrlTable({ rows }: { rows: UrlRow[] }) {
  const cols: Column<UrlRow>[] = [
    { key: "h", header: "Page", cell: (r) => <a className="line-clamp-1 max-w-[46ch] hover:underline" href={r.href} dir="auto">{r.headline}</a>, sort: (r) => r.headline },
    { key: "k", header: "Type", cell: (r) => KIND[r.kind] ?? r.kind, sort: (r) => r.kind },
    { key: "c", header: "Country", cell: (r) => r.country, sort: (r) => r.country },
    { key: "l", header: "Language", cell: (r) => r.lang, sort: (r) => r.lang },
    { key: "d", header: "Requested directive", cell: (r) => <span className="text-xs">{r.directive}</span>, sort: (r) => r.directive },
    { key: "m", header: "Markdown", cell: (r) => (r.md ? <a className="link text-xs" href={`/md/${r.href.split("/").pop()}`}>.md</a> : <span className="text-xs text-muted-foreground">publisher text: none</span>) },
    { key: "o", header: "Share image", cell: (r) => <a className="link text-xs" href={r.og}>1200×630</a> },
    { key: "u", header: "Updated", cell: (r) => <span className="whitespace-nowrap text-xs">{r.updated.slice(0, 10)}</span>, sort: (r) => r.updated, align: "end" },
  ];
  return <DataTable caption="Public URLs" testid="urls" rows={rows} columns={cols} rowKey={(r) => r.id} search={(r) => `${r.headline} ${r.href}`} initialSort={{ key: "u", dir: "desc" }} initialPageSize={50}
    filters={[{ key: "k", label: "Type", options: Object.entries(KIND).map(([value, label]) => ({ value, label })), get: (r) => r.kind },
      { key: "l", label: "Language", options: [...new Set(rows.map((r) => r.lang))].sort().map((v) => ({ value: v, label: v })), get: (r) => r.lang }]} empty="No published pages." />;
}

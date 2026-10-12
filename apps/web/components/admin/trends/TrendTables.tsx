"use client";
// ISSUE-12 trend tables: the current ranking with a per-item score explanation, and de-duplicated snapshot history.
import { DataTable, type Column } from "../DataTable";
import { Badge } from "@/components/ui/badge";

export type RankRow = { id: string; rank: number; href: string; headline: string; translated?: string; lang: string; score: number; human: { reads: number; shares: number; comments: number; votes: number };
  sources: number; aiReplies: number; basis: string[]; ageH: number };
export type HistoryRow = { key: string; at: string; scope: string; edition: string; top: string; items: number; confidence: string; humanItems: number };

const BASIS: Record<string, string> = { human_activity: "Real readers", verified_coverage: "Several sources", editorial_selection: "Recency only (no reader signal)" };

export function CurrentRanking({ rows }: { rows: RankRow[] }) {
  const cols: Column<RankRow>[] = [
    { key: "rank", header: "#", cell: (r) => r.rank, sort: (r) => r.rank, align: "end" },
    { key: "headline", header: "Discussion", cell: (r) => (<div className="max-w-[48ch]"><a href={r.href} className="font-medium hover:underline" dir="auto">{r.headline}</a>
      {r.translated && <p className="text-xs text-muted-foreground">English (machine): {r.translated}</p>}</div>), sort: (r) => r.headline },
    { key: "human", header: "Readers: reads / shares", cell: (r) => <span className="tabular-nums">{r.human.reads} / {r.human.shares}</span>, sort: (r) => r.human.reads + r.human.shares, align: "end" },
    { key: "ai", header: "Agent replies (not in score)", cell: (r) => <span className="tabular-nums text-muted-foreground">{r.aiReplies}</span>, sort: (r) => r.aiReplies, align: "end" },
    { key: "sources", header: "Sources", cell: (r) => r.sources, sort: (r) => r.sources, align: "end" },
    { key: "why", header: "Why it ranks", cell: (r) => <span className="flex flex-wrap gap-1">{r.basis.map((b) => <Badge key={b} variant={b === "human_activity" ? "default" : "outline"}>{BASIS[b] ?? b}</Badge>)}</span> },
    { key: "score", header: "Score", cell: (r) => <span className="tabular-nums" title={`age ${r.ageH.toFixed(1)} h`}>{r.score.toFixed(3)}</span>, sort: (r) => r.score, align: "end" },
  ];
  return <DataTable caption="Current trend ranking" testid="trend-current" rows={rows} columns={cols} rowKey={(r) => r.id} search={(r) => `${r.headline} ${r.translated ?? ""}`}
    filters={[{ key: "basis", label: "Signal", options: [{ value: "human", label: "Has real readers" }, { value: "none", label: "No reader signal" }], get: (r) => (r.basis.includes("human_activity") ? "human" : "none") }]}
    empty="Nothing published in the last 7 days for this edition." />;
}

export function SnapshotHistory({ rows }: { rows: HistoryRow[] }) {
  const cols: Column<HistoryRow>[] = [
    { key: "at", header: "Computed (UTC)", cell: (r) => <span className="whitespace-nowrap">{r.at.slice(0, 16)}</span>, sort: (r) => r.at },
    { key: "scope", header: "List", cell: (r) => (r.scope === "home" ? "Trending in this edition" : "Elsewhere in Africa"), sort: (r) => r.scope },
    { key: "edition", header: "Edition", cell: (r) => (r.edition === "ALL" ? "All Africa" : r.edition), sort: (r) => r.edition },
    { key: "top", header: "Top item", cell: (r) => <span className="line-clamp-1 max-w-[46ch]" dir="auto">{r.top}</span> },
    { key: "human", header: "Items with reader signal", cell: (r) => `${r.humanItems} of ${r.items}`, sort: (r) => r.humanItems, align: "end" },
    { key: "conf", header: "Confidence", cell: (r) => <Badge variant={r.confidence === "measured" ? "default" : "outline"}>{r.confidence === "measured" ? "Measured" : "No popularity signal"}</Badge>, sort: (r) => r.confidence },
  ];
  return <DataTable caption="Snapshot history" testid="trend-history" rows={rows} columns={cols} rowKey={(r) => r.key} initialSort={{ key: "at", dir: "desc" }}
    search={(r) => `${r.top} ${r.edition}`} filters={[{ key: "scope", label: "List", options: [{ value: "home", label: "This edition" }, { value: "africa", label: "Elsewhere" }], get: (r) => r.scope },
      { key: "conf", label: "Confidence", options: [{ value: "measured", label: "Measured" }, { value: "no_popularity_signal", label: "No signal" }], get: (r) => r.confidence }]}
    empty="No snapshots yet." />;
}

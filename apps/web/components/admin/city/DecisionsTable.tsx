"use client";
// ISSUE-06 agent decisions with identity: who, what action, on what, why (plain), cost and latency. Raw reason expands.
import Link from "next/link";
import { DataTable, type Column } from "../DataTable";
import { Badge } from "@/components/ui/badge";

export type DecisionRow = { id: string; at: string; agent: string; handle: string; country: string; decision: string; trigger: string; target: string; targetHref: string; reason: string; tokens: number; ms: number; usdKnown: boolean };
const D: Record<string, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  reply: { label: "Replied", tone: "default" }, post: { label: "Posted", tone: "default" }, vote: { label: "Voted", tone: "secondary" }, follow: { label: "Followed / joined", tone: "secondary" },
  join: { label: "Joined SubPal", tone: "secondary" }, abstain: { label: "Chose not to act", tone: "outline" }, rejected: { label: "Refused by rules", tone: "destructive" },
  blocked: { label: "Blocked", tone: "destructive" }, hold: { label: "Held for a person", tone: "secondary" }, deferred: { label: "Waiting (limit)", tone: "outline" }, error: { label: "Error", tone: "destructive" } };
const TRIG: Record<string, string> = { news_item: "new publisher item", original: "original-post slot", reply_to_me: "someone answered it", event: "new post or reply", operator_test: "manual test run", owner_task: "owner task", "originals-scheduler": "original-post slot" };

export function DecisionsTable({ rows }: { rows: DecisionRow[] }) {
  const cols: Column<DecisionRow>[] = [
    { key: "at", header: "When (UTC)", cell: (r) => <span className="whitespace-nowrap text-xs">{r.at.slice(5, 16)}</span>, sort: (r) => r.at },
    { key: "agent", header: "Agent", cell: (r) => r.handle ? <Link className="font-medium hover:underline" href={`/agents/${r.handle}`}>{r.agent}</Link> : <span className="text-muted-foreground">(deleted)</span>, sort: (r) => r.agent },
    { key: "c", header: "Country", cell: (r) => r.country, sort: (r) => r.country },
    { key: "d", header: "Action", cell: (r) => <Badge variant={(D[r.decision] ?? D.error).tone}>{(D[r.decision] ?? { label: r.decision }).label}</Badge>, sort: (r) => r.decision },
    { key: "t", header: "Because of", cell: (r) => <span className="text-xs">{TRIG[r.trigger] ?? r.trigger}</span>, sort: (r) => r.trigger },
    { key: "on", header: "On", cell: (r) => r.targetHref ? <Link className="line-clamp-1 max-w-[30ch] text-xs hover:underline" href={r.targetHref} dir="auto">{r.target}</Link> : <span className="text-xs text-muted-foreground">{r.target || "-"}</span> },
    { key: "why", header: "Why", cell: (r) => <details className="max-w-[46ch] text-xs"><summary className="line-clamp-2 cursor-pointer">{r.reason}</summary><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.reason}</p></details> },
    { key: "tok", header: "Tokens · time", cell: (r) => <span className="whitespace-nowrap text-xs tabular-nums">{r.tokens || "-"} · {r.ms ? `${(r.ms / 1000).toFixed(1)} s` : "-"}</span>, sort: (r) => r.tokens, align: "end" },
  ];
  return <DataTable caption="Recent agent decisions" testid="decisions" rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: "at", dir: "desc" }} initialPageSize={50}
    search={(r) => `${r.agent} ${r.handle} ${r.target} ${r.reason}`} filters={[{ key: "d", label: "Action", options: Object.entries(D).map(([value, v]) => ({ value, label: v.label })), get: (r) => r.decision }]}
    empty="No decisions recorded yet." />;
}

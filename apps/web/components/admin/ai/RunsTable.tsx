"use client";
// ISSUE-08: every model run traced to what happened next (published, held, refused with the rule, abstained, failed).
import { DataTable, type Column } from "../DataTable";
import { Badge } from "@/components/ui/badge";

export type RunRow = { id: string; at: string; stage: string; who: string; provider: string; model: string; paid: boolean; status: string; outcome: string; outcomeReason: string;
  ms: number; tin: number; tout: number; prompt: string };
const OUT: Record<string, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  published: { label: "Published", tone: "default" }, held: { label: "Held for a person", tone: "secondary" }, refused: { label: "Refused by rules", tone: "destructive" },
  abstained: { label: "Chose not to write", tone: "outline" }, failed: { label: "Model call failed", tone: "destructive" }, used: { label: "Used internally", tone: "secondary" }, unknown: { label: "No outcome recorded", tone: "outline" } };

export function RunsTable({ rows }: { rows: RunRow[] }) {
  const cols: Column<RunRow>[] = [
    { key: "at", header: "When (UTC)", cell: (r) => <span className="whitespace-nowrap text-xs">{r.at.slice(5, 16)}</span>, sort: (r) => r.at },
    { key: "stage", header: "Stage", cell: (r) => <span className="text-xs">{r.stage}</span>, sort: (r) => r.stage },
    { key: "who", header: "Agent / role", cell: (r) => <span className="text-xs">{r.who}</span>, sort: (r) => r.who },
    { key: "model", header: "Model", cell: (r) => <span className="text-xs">{r.model} {r.paid ? <Badge variant="outline">paid</Badge> : <Badge variant="secondary">local</Badge>}</span>, sort: (r) => r.model },
    { key: "out", header: "What happened", cell: (r) => <span className="flex flex-col gap-0.5"><Badge variant={OUT[r.outcome].tone} className="w-fit">{OUT[r.outcome].label}</Badge>
      {r.outcomeReason && <span className="max-w-[40ch] text-[11px] text-muted-foreground">{r.outcomeReason}</span>}</span>, sort: (r) => r.outcome },
    { key: "ms", header: "Latency", cell: (r) => `${(r.ms / 1000).toFixed(1)} s`, sort: (r) => r.ms, align: "end" },
    { key: "tok", header: "Tokens in/out", cell: (r) => `${r.tin}/${r.tout}`, sort: (r) => r.tin + r.tout, align: "end" },
    { key: "p", header: "Prompt", cell: (r) => <span className="font-mono text-[11px]">{r.prompt}</span>, sort: (r) => r.prompt },
  ];
  return <DataTable caption="Recent model runs" testid="ai-runs" rows={rows} columns={cols} rowKey={(r) => r.id} search={(r) => `${r.who} ${r.stage} ${r.model} ${r.outcomeReason} ${r.prompt}`}
    initialSort={{ key: "at", dir: "desc" }} initialPageSize={50}
    filters={[{ key: "out", label: "Outcome", options: Object.entries(OUT).map(([value, v]) => ({ value, label: v.label })), get: (r) => r.outcome },
      { key: "paid", label: "Cost", options: [{ value: "paid", label: "Paid" }, { value: "local", label: "Local" }], get: (r) => (r.paid ? "paid" : "local") },
      { key: "stage", label: "Stage", options: [...new Set(rows.map((r) => r.stage))].map((v) => ({ value: v, label: v })), get: (r) => r.stage }]} empty="No model runs in the last 24 hours." />;
}

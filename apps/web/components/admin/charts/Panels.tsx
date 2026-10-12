// Server-rendered analytical panels (no client JS): metric card, chart card, cohort heatmap, funnel, exceptions.
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, Minus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "./Charts";
import { HelpTip } from "../HelpTip";
import { cn } from "@/lib/utils";

export function MetricCard({ label, value, delta, definition, source, spark, slot = 1, sub, testid }: { label: string; value: string; delta?: number | null; definition: string; source: string;
  spark?: number[]; slot?: number; sub?: string; testid?: string }) {
  return (
    <Card className="gap-1 py-4" data-testid={testid ?? "metric-card"} data-metric={label}>
      <CardContent className="px-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          {/* ISSUE-06: tap/keyboard-friendly "?" (was a hover-only tooltip that phones could not open). */}
          <HelpTip label={label} what={definition} source={source} />
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="min-w-0 text-[26px] font-extrabold leading-none tabular-nums [overflow-wrap:anywhere]" data-value={value}>{value}</p>
          {delta !== undefined && (delta === null ? <Badge variant="outline" className="text-[11px]">new</Badge> : (
            <span className={cn("inline-flex items-center text-xs font-semibold", delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted-foreground")}>
              {delta > 0 ? <ArrowUpRight className="size-3.5" aria-hidden="true" /> : delta < 0 ? <ArrowDownRight className="size-3.5" aria-hidden="true" /> : <Minus className="size-3.5" aria-hidden="true" />}
              {Math.abs(delta).toFixed(0)}%<span className="sr-only"> versus the previous period</span></span>))}
        </div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        {spark && spark.length > 1 && <div className="mt-2"><Sparkline values={spark} slot={slot} label={`${label} per day`} /></div>}
      </CardContent>
    </Card>
  );
}

export function ChartCard({ title, description, children, className, table, footer, testid }: { title: string; description?: string; children: React.ReactNode; className?: string;
  table?: { head: string[]; rows: (string | number)[][] }; footer?: React.ReactNode; testid?: string }) {
  return (
    <Card className={cn("gap-3", className)} data-testid={testid}>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
      <CardContent>{children}
        {table && table.rows.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">View as table</summary>
          <div className="mt-2 max-h-64 overflow-auto"><table className="w-full"><thead><tr>{table.head.map((h) => <th key={h} className="pb-1 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className={cn("py-0.5", typeof c === "number" && "text-right tabular-nums")}>{typeof c === "number" ? c.toLocaleString("en") : c}</td>)}</tr>)}</tbody></table></div></details>}
        {footer && <div className="mt-2 text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}

const SEQ = ["var(--seq-100)", "var(--seq-250)", "var(--seq-400)", "var(--seq-550)", "var(--seq-700)"];
export function CohortHeatmap({ rows, periods }: { rows: { cohort: string; size: number; cells: ({ n: number; d: number } | null)[] }[]; periods: string[] }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No authenticated human cohorts in this window yet. Cohorts appear as owners sign in on different days.</p>;
  return (
    <div className="overflow-x-auto" data-testid="cohort-heatmap">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead><tr><th className="text-start font-semibold">Cohort (first active)</th><th className="text-right font-semibold">Humans</th>{periods.map((p) => <th key={p} className="text-center font-semibold">{p}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.cohort}><td className="whitespace-nowrap pe-2">{r.cohort}</td><td className="pe-2 text-right tabular-nums">{r.size}</td>
            {r.cells.map((c, i) => {
              if (!c) return <td key={i} className="rounded bg-muted/50 text-center text-muted-foreground" title="window not complete yet">…</td>;
              const p = c.d ? c.n / c.d : 0;
              return <td key={i} className="min-w-12 rounded px-1 py-1.5 text-center tabular-nums" title={`${c.n} of ${c.d} returned`}
                style={{ background: p ? SEQ[Math.min(4, Math.floor(p * 5))] : "var(--muted)", color: p ? (p > 0.6 ? "#ffffff" : "#0b1a33") : undefined }}>{Math.round(p * 100)}%<span className="sr-only"> ({c.n} of {c.d})</span></td>;
            })}</tr>))}</tbody>
      </table>
      <p className="mt-1 text-xs text-muted-foreground">Cell = share of the cohort with a qualifying return on day N (window convention: exact day N ±0; incomplete windows shown as …). Hover for numerator/denominator.</p>
    </div>
  );
}

export function Funnel({ steps }: { steps: { label: string; n: number; note?: string }[] }) {
  const top = Math.max(1, steps[0]?.n ?? 1);
  return (
    <ol className="flex flex-col gap-2" data-testid="funnel">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].n : s.n;
        return (
          <li key={s.label}>
            <div className="flex items-baseline justify-between text-sm"><span className="font-medium">{i + 1}. {s.label}</span>
              <span className="tabular-nums">{s.n.toLocaleString("en")}{i > 0 && <span className="ms-2 text-xs text-muted-foreground">{prev ? Math.round((s.n / prev) * 100) : 0}% of previous</span>}</span></div>
            <div className="mt-1 h-3 rounded bg-muted"><div className="h-3 rounded" style={{ width: `${(s.n / top) * 100}%`, background: `var(--seq-${[700, 550, 400, 250, 250][Math.min(i, 4)]})` }} /></div>
            {s.note && <p className="mt-0.5 text-xs text-muted-foreground">{s.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export type Exception = { severity: "critical" | "serious" | "warning" | "ok"; title: string; detail: string; href?: string; when?: string };
const SEV = { critical: { Icon: CircleAlert, cls: "text-[var(--status-critical)]", label: "Critical" }, serious: { Icon: AlertTriangle, cls: "text-[var(--status-serious)]", label: "Serious" },
  warning: { Icon: AlertTriangle, cls: "text-[var(--status-warning)]", label: "Warning" }, ok: { Icon: CircleCheck, cls: "text-[var(--status-good)]", label: "OK" } };
export function Exceptions({ items, empty = "Nothing needs attention." }: { items: Exception[]; empty?: string }) {
  if (!items.length) return <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><CircleCheck className="size-4 text-[var(--status-good)]" aria-hidden="true" />{empty}</p>;
  return (
    <ul className="divide-y" data-testid="exceptions">{items.map((x, i) => {
      const s = SEV[x.severity];
      return (
        <li key={i} className="flex gap-3 py-2.5 text-sm">
          <s.Icon className={cn("mt-0.5 size-4 shrink-0", s.cls)} aria-hidden="true" />
          <div className="min-w-0 flex-1"><p className="font-medium"><span className="sr-only">{s.label}: </span>{x.href ? <Link href={x.href} className="hover:underline">{x.title}</Link> : x.title}</p>
            <p className="text-xs text-muted-foreground">{x.detail}{x.when ? ` · ${x.when}` : ""}</p></div>
          <Badge variant="outline" className="shrink-0 self-start text-[11px]">{s.label}</Badge>
        </li>);
    })}</ul>
  );
}

/** Generic matrix heatmap (rows × columns of counts), one sequential hue; zero cells are neutral; each cell has a title. */
export function Heatmap({ rows, cols, cell, rowLabel = "", unit = "" }: { rows: string[]; cols: string[]; cell: (r: string, c: string) => number; rowLabel?: string; unit?: string }) {
  const vals = rows.flatMap((r) => cols.map((c) => cell(r, c)));
  const max = Math.max(0, ...vals);
  if (!rows.length || !cols.length || max === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No activity in this scope.</p>;
  return (
    <div className="overflow-x-auto" data-testid="heatmap">
      <table className="border-separate border-spacing-0.5 text-[11px]">
        <thead><tr><th className="text-start font-semibold">{rowLabel}</th>{cols.map((c) => <th key={c} className="px-1 font-semibold">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r}><td className="whitespace-nowrap pe-2">{r}</td>{cols.map((c) => {
          const v = cell(r, c);
          return <td key={c} title={`${r} × ${c}: ${v}${unit}`} className="min-w-9 rounded px-1 py-1 text-center tabular-nums"
            style={{ background: v ? SEQ[Math.min(4, Math.floor((v / max) * 4.999))] : "var(--muted)", color: v ? (Math.floor((v / max) * 4.999) >= 2 ? "#ffffff" : "#0b1a33") : undefined }}>{v || ""}</td>;
        })}</tr>)}</tbody>
      </table>
    </div>
  );
}

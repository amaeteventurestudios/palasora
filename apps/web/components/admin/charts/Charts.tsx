"use client";
// Command Center chart library (docs/specs/25 component list). Recharts via shadcn ChartContainer, validated palette
// (--chart-1..6, see app/globals.css), thin marks, 4px rounded bar ends, recessive grid, tooltips on every mark, never a
// dual y-axis (two measures = two charts). Animations off: faster on low-end devices and screenshots show final state.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis, Cell } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useRouter } from "next/navigation";

export type Series = { key: string; label: string; slot?: number; dashed?: boolean };
const color = (s: Series, i: number) => `var(--chart-${s.slot ?? i + 1})`;
const cfgOf = (series: Series[]): ChartConfig => Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: color(s, i) }]));
const shortDay = (d: string) => (d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d);

export function Sparkline({ values, slot = 1, label }: { values: number[]; slot?: number; label: string }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-8 w-full" role="img" aria-label={`${label}: ${values.join(", ")}`}>
      <ChartContainer config={{ v: { label, color: `var(--chart-${slot})` } }} className="aspect-auto h-8 w-full">
        <LineChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}><Line dataKey="v" stroke="var(--color-v)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart>
      </ChartContainer>
    </div>
  );
}

export function TimeSeries({ data, series, kind = "area", height = 260, stacked = false, yLabel }: { data: Record<string, string | number>[]; series: Series[]; kind?: "area" | "line" | "bar";
  height?: number; stacked?: boolean; yLabel?: string }) {
  const config = cfgOf(series);
  const common = { data, margin: { left: 4, right: 12, top: 8 }, accessibilityLayer: true };
  const axes = (<><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={shortDay} minTickGap={24} />
    <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fontSize: 11 } : undefined} />
    <ChartTooltip content={<ChartTooltipContent labelFormatter={(l) => String(l)} />} />{series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}</>);
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      {kind === "bar" ? (
        <BarChart {...common}>{axes}{series.map((s) => <Bar key={s.key} dataKey={s.key} stackId={stacked ? "a" : undefined} fill={`var(--color-${s.key})`} radius={stacked ? 0 : 4} isAnimationActive={false} />)}</BarChart>
      ) : kind === "line" ? (
        <LineChart {...common}>{axes}{series.map((s) => <Line key={s.key} dataKey={s.key} stroke={`var(--color-${s.key})`} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} dot={false} isAnimationActive={false} />)}</LineChart>
      ) : (
        <AreaChart {...common}>{axes}{series.map((s) => <Area key={s.key} dataKey={s.key} type="monotone" stackId={stacked ? "a" : undefined} stroke={`var(--color-${s.key})`} strokeWidth={2}
          strokeDasharray={s.dashed ? "5 4" : undefined} fill={s.dashed ? "transparent" : `var(--color-${s.key})`} fillOpacity={0.18} isAnimationActive={false} />)}</AreaChart>
      )}
    </ChartContainer>
  );
}

export function RankedBars({ rows, slot = 2, height, valueLabel = "Value", hrefBase }: { rows: { label: string; value: number; key?: string }[]; slot?: number; height?: number; valueLabel?: string; hrefBase?: string }) {
  const router = useRouter();
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No data in this scope.</p>;
  const h = height ?? Math.max(120, rows.length * 30 + 24);
  return (
    <ChartContainer config={{ value: { label: valueLabel, color: `var(--chart-${slot})` } }} className="aspect-auto w-full" style={{ height: h }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 28 }} accessibilityLayer>
        <CartesianGrid horizontal={false} /><XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis dataKey="label" type="category" width={118} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)" }}
          onClick={(d: { payload?: { key?: string } }) => { if (hrefBase && d?.payload?.key) router.push(`${hrefBase}${d.payload.key}`); }} cursor={hrefBase ? "pointer" : undefined} />
      </BarChart>
    </ChartContainer>
  );
}

export function Histogram({ bins, slot = 4, xLabel }: { bins: { label: string; value: number }[]; slot?: number; xLabel?: string }) {
  return (
    <ChartContainer config={{ value: { label: "Count", color: `var(--chart-${slot})` } }} className="aspect-auto h-[200px] w-full">
      <BarChart data={bins} margin={{ left: 4, right: 8, bottom: xLabel ? 14 : 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} label={xLabel ? { value: xLabel, position: "insideBottom", offset: -10, fontSize: 11 } : undefined} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} /><ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} isAnimationActive={false}>{bins.map((b) => <Cell key={b.label} />)}</Bar>
      </BarChart>
    </ChartContainer>
  );
}

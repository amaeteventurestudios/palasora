"use client";
// Country comparison (A08 secondary view): listings and matched-trade volume per market, only markets with any listing.
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = { volume: { label: "Volume (Sora)", color: "var(--chart-2)" }, listed: { label: "Listed companies", color: "var(--chart-1)" } } satisfies ChartConfig;

export function MarketsBar({ rows }: { rows: { code: string; name: string; listed: number; volume: number }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No market has a listing yet.</p>;
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }} accessibilityLayer>
        <CartesianGrid horizontal={false} />
        <YAxis dataKey="name" type="category" width={96} tickLine={false} axisLine={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="volume" fill="var(--color-volume)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}

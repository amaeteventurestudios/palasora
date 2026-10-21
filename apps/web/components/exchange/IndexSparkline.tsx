"use client";
// Sora Market Index sparkline on TradingView Lightweight Charts (Apache-2.0; attribution in docs/OSS-ATTRIBUTION.md).
// Points are stored index values computed from matched virtual trades; with fewer than two points nothing is drawn.
import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";

export function IndexSparkline({ points, label }: { points: { t: number; v: number }[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || points.length < 2) return;
    const css = getComputedStyle(document.documentElement);
    const line = css.getPropertyValue("--chart-3").trim() || "#1BAF7A";
    const chart = createChart(el, {
      autoSize: true, handleScroll: false, handleScale: false,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: css.getPropertyValue("--chart-axis").trim(), attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } }, rightPriceScale: { visible: false }, timeScale: { visible: false, borderVisible: false },
      crosshair: { horzLine: { visible: false, labelVisible: false }, vertLine: { labelVisible: false } },
    });
    const s = chart.addSeries(AreaSeries, { lineColor: line, lineWidth: 2, topColor: `${line}55`, bottomColor: `${line}00`, priceLineVisible: false, lastValueVisible: false });
    s.setData(points.map((p) => ({ time: p.t as UTCTimestamp, value: p.v })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points]);
  if (points.length < 2) return <p className="text-xs text-muted-foreground">The index line appears after matched trades on two different days.</p>;
  return <div ref={ref} className="h-[36px] w-full" role="img" aria-label={label} />;
}

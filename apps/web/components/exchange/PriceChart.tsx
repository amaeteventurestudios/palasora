"use client";
// Virtual price series on TradingView Lightweight Charts (Apache-2.0). Candles are aggregated from STORED matched trades
// (economy.db `trades`); before the first trade the chart says so instead of drawing an invented line.
import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart, type UTCTimestamp } from "lightweight-charts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export function PriceChart({ daily, hourly, ticker, ipo }: { daily: Candle[]; hourly: Candle[]; ticker: string; ipo: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<"1H" | "1D">(daily.length >= 5 ? "1D" : "1H");
  const data = period === "1D" ? daily : hourly;
  useEffect(() => {
    const el = ref.current;
    if (!el || !data.length) return;
    const css = getComputedStyle(document.documentElement);
    const up = css.getPropertyValue("--chart-3").trim(), down = css.getPropertyValue("--status-critical").trim() || "#d03b3b";
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: css.getPropertyValue("--chart-axis").trim(), attributionLogo: true },
      grid: { vertLines: { color: css.getPropertyValue("--chart-grid").trim() }, horzLines: { color: css.getPropertyValue("--chart-grid").trim() } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: period === "1H" },
    });
    const candles = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
    candles.setData(data.map((d) => ({ time: d.t as UTCTimestamp, open: d.o / 100, high: d.h / 100, low: d.l / 100, close: d.c / 100 })));
    candles.createPriceLine({ price: ipo / 100, color: css.getPropertyValue("--chart-axis").trim(), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "IPO" });
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, color: `${css.getPropertyValue("--chart-2").trim()}66` });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vol.setData(data.map((d) => ({ time: d.t as UTCTimestamp, value: d.v })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data, period, ipo]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{data.length ? `${data.reduce((s, d) => s + d.v, 0).toLocaleString("en")} shares in ${data.length} ${period === "1D" ? "day" : "hour"} candles from matched virtual trades` : ""}</p>
        <ToggleGroup type="single" size="sm" variant="outline" value={period} onValueChange={(v) => v && setPeriod(v as "1H" | "1D")} aria-label="Candle period">
          <ToggleGroupItem value="1H">1H</ToggleGroupItem><ToggleGroupItem value="1D">1D</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {data.length ? <div ref={ref} className="h-[280px] w-full sm:h-[340px]" role="img" aria-label={`${ticker} virtual price candles`} />
        : <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No matched trades yet: no price history to draw. The IPO offer is {(ipo / 100).toFixed(2)} Sora.</div>}
    </div>
  );
}

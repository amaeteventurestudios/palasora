"use client";
// v1.7 (spec 34): latest matched trades that update from COMMITTED trade_executed events (SSE), newest first, with a brief
// highlight. Events are emitted only after the economy ledger commits the match; nothing is synthesised client-side.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLive } from "@/components/live/LiveEvents";
import { useFlash } from "@/components/social/LiveBits";

type Row = { id: string; ticker: string; market: string; qty: number; price: number; at: number; fresh?: boolean };

export function LiveTrades({ initial, market, where }: { initial: Row[]; market: string; where: string }) {
  const ctx = useLive();
  const [rows, setRows] = useState<Row[]>(initial);
  const [flash, fire] = useFlash();
  useEffect(() => ctx?.subscribe((e) => {
    if (e.type !== "trade_executed") return;
    const p = e.payload ?? {};
    if (market !== "ALL" && p.market !== market) return;
    setRows((xs) => [{ id: `ev-${e.seq}`, ticker: String(p.ticker ?? ""), market: String(p.market ?? ""), qty: Number(p.qty) || 0, price: Number(p.price) || 0,
      at: Date.parse(e.created.replace(" ", "T")) / 1000 || Date.now() / 1000, fresh: true }, ...xs].slice(0, 8));
    fire();
  }), [ctx, market, fire]);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No matched trade {where} yet. This list updates live when one happens.</p>;
  return (
    <ul className="divide-y text-sm" data-testid="live-trades">{rows.map((t, i) => (
      <li key={t.id} className={`flex items-center justify-between gap-2 py-1.5 ${i === 0 && t.fresh && flash ? "live-flash" : ""}`}>
        <Link href={`/exchange/${t.ticker}`} className="font-semibold hover:underline">{t.ticker}</Link>
        <span className="tabular-nums">{t.qty.toLocaleString("en")} sh @ {t.price.toFixed(2)} Sora/share</span>
        <span className="text-xs text-muted-foreground">{new Date(t.at * 1000).toISOString().slice(11, 16)} UTC</span></li>))}</ul>
  );
}

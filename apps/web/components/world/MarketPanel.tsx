"use client";
// The player market: the Market Hall over the world. The board shows each good's price and what is on offer, every stall
// selling now and the viewer's own businesses; a good's page shows its order book, two weeks of prices, its stalls and the
// last trades, and lets an owner offer their business's goods (or bid for some) at their own price. Orders go out as
// owner requests that the town's next hour runs through the Actions gate.
import { useCallback, useEffect, useState } from "react";
import { loadGood, loadMarket, requestMarket } from "@/app/actions/town-market";
import { MARKET_LABEL, MARKET_REFUSAL, type Good, type GoodView, type Hall, type MarketKind, type Who } from "@/lib/world/market";
import { BUSINESS_LABEL, townTime } from "@/lib/world/layout";
import { sora2 } from "@/lib/world/card";
import { pct } from "@/lib/world/exchange";

const btn = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-50";
const biz = (w: { type: string; business: string }) => `${BUSINESS_LABEL[w.type] ?? "Business"} ${w.business}`;
const who = (w: Who) => w.business ? `${w.name} · ${biz(w)}` : w.name;

export function MarketPanel({ onOpen }: { onOpen(good: Good): void }) {
  const [h, setH] = useState<Hall | null | undefined>();
  useEffect(() => { loadMarket().then(setH).catch(() => setH(null)); }, []);
  if (h === undefined) return <p className="text-sm text-[#4b5566]" data-testid="market-loading">Walking round the Market Hall…</p>;
  if (!h) return <p className="text-sm text-[#4b5566]">The Market Hall is unreachable right now.</p>;
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="market">
      <p className="text-[#4b5566]">Crops, tools and materials change hands here at prices people and their agents set. Tap a good to see its stalls.</p>
      <ul className="flex flex-col gap-2" data-testid="market-goods">{h.goods.map((g) => (
        <li key={g.good}><button type="button" onClick={() => onOpen(g.good)} data-testid="market-row" data-good={g.good}
          className="w-full rounded-xl border border-black/10 p-2.5 text-left hover:bg-black/[0.03]">
          <span className="flex items-baseline justify-between gap-2"><span className="font-semibold">{g.label}</span>
            <span className="font-semibold tabular-nums">{sora2(g.price)} <span className={`text-xs font-normal ${g.change_pct < 0 ? "text-[#b23a2e]" : g.change_pct > 0 ? "text-[#3f8f5a]" : "text-[#4b5566]"}`}>{pct(g.change_pct)}</span></span></span>
          <span className="block text-xs text-[#4b5566]">{g.for_sale ? `${g.for_sale} for sale from ${g.sellers} stall${g.sellers === 1 ? "" : "s"}, from ${sora2(g.ask ?? 0)}` : "Nothing for sale"}
            {g.wanted ? ` · ${g.wanted} wanted up to ${sora2(g.bid ?? 0)}` : ""}</span>
          <span className="block text-xs text-[#4b5566]">{g.trades_day ? `${g.volume_day} sold in the last day` : g.traded ? "No trades in the last day" : `No trades yet · usual price ${sora2(g.ref)}`}</span>
        </button></li>))}</ul>

      {h.mine.length > 0 && <section aria-label="Your businesses" className="rounded-2xl bg-[#fffaf0] p-3" data-testid="market-mine">
        <h3 className="font-semibold">Your business{h.mine.length > 1 ? "es" : ""}</h3>
        <ul className="mt-1 flex flex-col gap-1.5">{h.mine.map((m) => {
          const held = Object.entries(m.stock).filter(([, q]) => (q ?? 0) > 0);
          return <li key={m.business}><span className="font-semibold">{biz(m)}</span> <span className="text-[#4b5566]">· {sora2(m.cash)} to spend</span>
            <span className="block text-xs">{held.length ? <>In store: {held.map(([g, q], i) => <span key={g}>{i ? ", " : ""}<button type="button" className="underline" onClick={() => onOpen(g as Good)}>{q} {g}</button></span>)}</> : "Nothing to sell yet"}
              {m.orders.length ? ` · ${m.orders.length} order${m.orders.length > 1 ? "s" : ""} open` : ""}</span></li>;
        })}</ul></section>}
      {h.signed_in && h.mine.length === 0 && <p className="text-[#4b5566]" data-testid="market-no-business">Run a business to trade here: a farm sells crops, a workshop sells tools. Find a place from the main menu.</p>}
      {!h.signed_in && <p className="text-[#4b5566]" data-testid="market-sign-in">Sign in to open a stall for your business.</p>}

      <section aria-label="At the stalls now"><h3 className="font-semibold">At the stalls now</h3>
        {h.stalls.length ? <ul className="mt-1 flex flex-col gap-1" data-testid="market-stalls">{h.stalls.map((s) => (
          <li key={`${s.business || s.owner}-${s.good}`} className="flex items-baseline justify-between gap-2">
            <button type="button" className="min-h-9 text-left underline-offset-2 hover:underline" onClick={() => s.good && onOpen(s.good)}>{who(s)}</button>
            <span className="shrink-0 tabular-nums">{s.qty} {s.good} at {sora2(s.price)}</span></li>))}</ul> : <p className="mt-1 text-[#4b5566]">No one is selling right now.</p>}
      </section>
      <p className="text-xs text-[#4b5566]">A price has to stay within {h.rules.band_pct}% of the usual one. An offer waits up to {h.rules.order_hours / 24} days; businesses short of supplies buy fair offers every afternoon.</p>
    </div>
  );
}

function Spark({ pts }: { pts: { day: number; avg: number }[] }) {
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.day), ys = pts.map((p) => p.avg);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 280, H = 48, P = 4;
  const at = (p: { day: number; avg: number }) => `${P + ((p.day - x0) / Math.max(1, x1 - x0)) * (W - 2 * P)},${H - P - ((p.avg - y0) / Math.max(0.01, y1 - y0)) * (H - 2 * P)}`;
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-full" role="img" aria-label={`Average price by day, from ${sora2(ys[0])} to ${sora2(ys[ys.length - 1])}`} data-testid="good-spark">
    <polyline fill="none" stroke="#c9724f" strokeWidth="2" strokeLinejoin="round" points={pts.map(at).join(" ")} /></svg>;
}

export function GoodCard({ good, onBack, onPlot, onTitle }: { good: Good; onBack(): void; onPlot(plot: string): void; onTitle(t: string): void }) {
  const [v, setV] = useState<GoodView | null | undefined>();
  const [pick, setPick] = useState(0);
  const [side, setSide] = useState<"sell" | "buy">("sell");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const reload = useCallback(() => { loadGood(good).then((x) => { setV(x); if (x) onTitle(`${x.label} at the Market Hall`); }).catch(() => setV(null)); }, [good, onTitle]);
  useEffect(() => { reload(); }, [reload]);
  if (v === undefined) return <p className="text-sm text-[#4b5566]" data-testid="good-loading">Reading the stalls…</p>;
  if (!v) return <p className="text-sm text-[#4b5566]">The Market Hall is unreachable right now.</p>;
  const m = v.mine[Math.min(pick, v.mine.length - 1)];
  const have = m?.stock[good] ?? 0;
  const send = async (kind: MarketKind, inputs: { good?: string; side?: string; price?: number; qty?: number; order?: number }) => {
    if (!m) return;
    setPending(true);
    const r = await requestMarket(m.business, kind, inputs).catch(() => ({ ok: false, message: "The town is unreachable right now: nothing was changed." }));
    setPending(false); setMsg(r);
    if (r.ok) reload();
  };
  const suggested = side === "sell" ? (v.ask ?? v.price) : (v.bid ?? v.price);
  const field = "min-h-11 w-24 rounded-lg border border-black/15 px-2 tabular-nums";
  const orders = m ? m.orders.filter((o) => o.good === good) : [];
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="good" data-good={good}>
      <button type="button" className="self-start text-sm underline" onClick={onBack} data-testid="good-back">The whole Market Hall</button>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-[#4b5566]">Last price</dt><dd className="font-semibold tabular-nums" data-testid="good-price">{sora2(v.price)} <span className={`font-normal ${v.change_pct < 0 ? "text-[#b23a2e]" : "text-[#3f8f5a]"}`}>{pct(v.change_pct)} in a day</span></dd>
        <dt className="text-[#4b5566]">Usual</dt><dd>{sora2(v.ref)} · offers from {sora2(v.band[0])} to {sora2(v.band[1])}</dd>
        <dt className="text-[#4b5566]">Last day</dt><dd>{v.volume_day} sold in {v.trades_day} trade{v.trades_day === 1 ? "" : "s"}</dd>
      </dl>
      <Spark pts={v.history} />

      <section aria-label="Order book" className="grid grid-cols-2 gap-3" data-testid="good-book">
        <div><h3 className="font-semibold">For sale</h3>{v.book.sell.length ? <ul className="mt-1 tabular-nums">{v.book.sell.map((o) => <li key={o.price} className="flex justify-between"><span>{sora2(o.price)}</span><span>{o.qty}</span></li>)}</ul> : <p className="mt-1 text-[#4b5566]">Nothing</p>}</div>
        <div><h3 className="font-semibold">Wanted</h3>{v.book.buy.length ? <ul className="mt-1 tabular-nums">{v.book.buy.map((o) => <li key={o.price} className="flex justify-between"><span>{sora2(o.price)}</span><span>{o.qty}</span></li>)}</ul> : <p className="mt-1 text-[#4b5566]">Nobody yet</p>}</div>
      </section>

      {m ? <section aria-label="Your stall" className="rounded-2xl border border-[#d8a838]/50 bg-[#fffaf0] p-3" data-testid="good-trade">
        {v.mine.length > 1 ? <label className="flex flex-col text-xs text-[#4b5566]">For<select className="min-h-11 rounded-lg border border-black/15 px-2 text-sm text-black" value={pick} onChange={(e) => setPick(Number(e.target.value))} data-testid="good-business">
          {v.mine.map((x, i) => <option key={x.business} value={i}>{biz(x)}</option>)}</select></label> : <p className="font-semibold">{biz(m)}</p>}
        <p className="text-xs text-[#4b5566]" data-testid="good-have">{have} {good} in store · {sora2(m.cash)} to spend</p>
        <div className="mt-2 flex rounded-full border border-black/10 p-0.5" role="tablist">{(["sell", "buy"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={side === k} onClick={() => setSide(k)} data-testid={`good-side-${k}`}
            className={`min-h-9 flex-1 rounded-full text-xs font-semibold ${side === k ? "bg-[#1d2433] text-white" : ""}`}>{k === "sell" ? "Sell" : "Buy"}</button>))}</div>
        <form key={`${side}-${m.business}`} className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
          send("place_order", { good, side, price: Number(f.get("price")), qty: Number(f.get("qty")) }); }}>
          <label className="flex flex-col text-xs text-[#4b5566]">Your price each<input name="price" type="number" step="0.01" min={v.band[0]} max={v.band[1]} defaultValue={suggested} className={field} data-testid="good-order-price" /></label>
          <label className="flex flex-col text-xs text-[#4b5566]">How many<input name="qty" type="number" min="1" max={side === "sell" ? Math.max(1, have) : 500} defaultValue={side === "sell" ? Math.max(1, Math.min(10, have)) : 10} className={field} data-testid="good-order-qty" /></label>
          <button className={`${btn} bg-[#1d2433] text-white`} disabled={pending || (side === "sell" && !have)} data-testid="good-order-go">{side === "sell" ? "Offer" : "Bid"}</button>
        </form>
        <p className="mt-1 text-xs text-[#4b5566]">{side === "sell" ? "Your agent opens the stall at the town's next hour. It sells to the best bids first; the rest waits for up to three days." : "Your agent bids at the town's next hour. It buys from the cheapest stalls first; the rest waits for up to three days."}</p>
        {msg && <p className={`mt-2 ${msg.ok ? "" : "text-[#b23a2e]"}`} role="status" data-testid="good-msg">{msg.message}</p>}
        {orders.length > 0 && <ul className="mt-2 flex flex-col gap-1" data-testid="good-orders">{orders.map((o) => <li key={o.id} className="flex items-center justify-between gap-2">
          <span>{o.side === "buy" ? "Buying" : "Selling"} {o.qty - o.filled} at {sora2(o.price)}<span className="text-xs text-[#4b5566]"> · until {townTime(o.expires_tick)}</span></span>
          <button type="button" className={`${btn} border border-black/15 bg-white`} disabled={pending} onClick={() => send("cancel_order", { order: o.id })}>Cancel</button></li>)}</ul>}
        {m.requests.length > 0 && <ul className="mt-2 flex flex-col gap-0.5 text-xs" data-testid="good-requests">{m.requests.map((r) => <li key={r.id} data-status={r.status}>
          {r.kind === "place_order" ? `${r.inputs.side === "buy" ? "Bid for" : "Offer"} ${r.inputs.qty} ${r.inputs.good} at ${sora2(Number(r.inputs.price) / 100)}` : MARKET_LABEL[r.kind] ?? r.kind}: <span className="font-semibold">{
            r.status === "queued" ? "waiting for the next hour" : r.status === "done" ? "done" : `refused, ${MARKET_REFUSAL[r.refusal] ?? r.detail ?? r.refusal}`}</span></li>)}</ul>}
      </section> : <p className="text-[#4b5566]" data-testid="good-join">{v.signed_in ? "Run a business to open a stall here." : "Sign in to open a stall for your business."}</p>}

      <section aria-label="Stalls"><h3 className="font-semibold">Stalls selling {good}</h3>
        {v.stalls.length ? <ul className="mt-1 flex flex-col gap-1" data-testid="good-stalls">{v.stalls.map((s) => <li key={s.business || s.owner} className="flex items-baseline justify-between gap-2">
          <span>{s.name}{s.business && <> · <button type="button" className="underline" onClick={() => onPlot(s.plot)}>{biz(s)}</button></>}</span>
          <span className="shrink-0 tabular-nums">{s.qty} at {sora2(s.price)}</span></li>)}</ul> : <p className="mt-1 text-[#4b5566]">No one is selling {good} right now.</p>}</section>
      {v.trades.length > 0 && <section aria-label="Recent trades"><h3 className="font-semibold">Recent trades</h3>
        <ul className="mt-1 flex flex-col gap-0.5" data-testid="good-trades">{v.trades.map((t, i) => <li key={i} className="flex justify-between gap-2"><span>{t.qty} at {sora2(t.price)} <span className="text-[#4b5566]">· {townTime(t.tick)}</span></span>
          <span className="text-right text-xs text-[#4b5566]">{t.seller.business || t.seller.name} → {t.buyer.business || t.buyer.name}</span></li>)}</ul></section>}
    </div>
  );
}

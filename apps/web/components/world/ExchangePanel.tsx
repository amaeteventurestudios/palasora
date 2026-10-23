"use client";
// Company shares: the Town Exchange over the world. The board lists every listed business with its price, last dividend
// and shareholders, and the viewer's own shares; a listing shows its order book, trades, shareholders and dividends, and
// lets a resident buy or sell. Orders go out as requests that the town's next hour runs through the Actions gate.
import { useCallback, useEffect, useState } from "react";
import { loadExchange, loadListing, requestShares } from "@/app/actions/town-exchange";
import { SHARE_LABEL, SHARE_REFUSAL, pct, type Board, type Listing, type ShareKind } from "@/lib/world/exchange";
import { BUSINESS_LABEL, townTime } from "@/lib/world/layout";
import { sora2 } from "@/lib/world/card";

const name = (r: { type: string; plot: string }) => `${BUSINESS_LABEL[r.type] ?? "Business"} on ${r.plot}`;
const btn = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-50";

export function ExchangePanel({ town, onOpen }: { town: string; onOpen(bid: string): void }) {
  const [b, setB] = useState<{ signedIn: boolean; data: Board | null } | undefined>();
  useEffect(() => { loadExchange().then(setB).catch(() => setB({ signedIn: false, data: null })); }, []);
  if (b === undefined) return <p className="text-sm text-[#4b5566]" data-testid="exchange-loading">Reading the Exchange…</p>;
  if (!b.data) return <p className="text-sm text-[#4b5566]">The Exchange is unreachable right now.</p>;
  const d = b.data;
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="exchange">
      <p className="text-[#4b5566]" data-testid="exchange-summary">{d.listed.length} business{d.listed.length === 1 ? "" : "es"} of {town} listed · {sora2(d.dividends_paid)} paid out in dividends so far</p>
      {d.holdings.length > 0 && <section aria-label="Your shares" className="rounded-2xl bg-[#fffaf0] p-3" data-testid="exchange-holdings">
        <h3 className="font-semibold">Your shares</h3>
        <ul className="mt-1 flex flex-col gap-1">{d.holdings.map((h) => <li key={h.business} className="flex justify-between gap-2">
          <button type="button" className="min-h-9 text-left underline-offset-2 hover:underline" onClick={() => h.listed && onOpen(h.business)}>{h.business}{h.listed ? "" : h.open ? " (private)" : " (closed)"}</button>
          <span className="tabular-nums">{h.shares} · {sora2(h.shares * h.price)}</span></li>)}</ul></section>}
      {d.listed.length === 0 ? <p data-testid="exchange-empty">No business has listed yet. A business can list after {d.rules.min_days} days of trading and a week with a profit.</p> :
        <ul className="flex flex-col gap-2" data-testid="exchange-list">{d.listed.map((r) => (
          <li key={r.business}><button type="button" onClick={() => onOpen(r.business)} data-testid="exchange-row" data-biz={r.business}
            className="w-full rounded-xl border border-black/10 p-2.5 text-left hover:bg-black/[0.03]">
            <span className="flex items-baseline justify-between gap-2"><span className="font-semibold">{name(r)}</span><span className="font-semibold tabular-nums">{sora2(r.price)}</span></span>
            <span className="flex items-baseline justify-between gap-2 text-xs text-[#4b5566]"><span>{r.owner_name} · {r.holders} shareholder{r.holders === 1 ? "" : "s"}{r.mine ? ` · you hold ${r.mine}` : ""}</span>
              <span className={r.change_pct < 0 ? "text-[#b23a2e]" : r.change_pct > 0 ? "text-[#3f8f5a]" : ""}>{pct(r.change_pct)}</span></span>
            <span className="text-xs text-[#4b5566]">Dividend {sora2(r.dividend)} a share{r.dividend ? ` (${r.yield_pct}% a week)` : ""}</span>
          </button></li>))}</ul>}
      <p className="text-xs text-[#4b5566]">Prices move only when residents trade. Listed businesses pay {d.rules.dividend_share_pct}% of a profitable week to their shareholders every Sunday evening.</p>
    </div>
  );
}

export function ListingCard({ bid, onBack, onPlot, onTitle }: { bid: string; onBack(): void; onPlot(plot: string): void; onTitle(t: string): void }) {
  const [l, setL] = useState<{ signedIn: boolean; data: Listing | null } | undefined>();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const reload = useCallback(() => { loadListing(bid).then((x) => { setL(x); if (x.data) onTitle(name(x.data)); }).catch(() => setL({ signedIn: false, data: null })); }, [bid, onTitle]);
  useEffect(() => { reload(); }, [reload]);
  if (l === undefined) return <p className="text-sm text-[#4b5566]" data-testid="listing-loading">Reading the order book…</p>;
  if (!l.data) return <p className="text-sm text-[#4b5566]">This business is not on the Exchange.</p>;
  const d = l.data;
  const send = async (kind: ShareKind, inputs: { business?: string; price?: number; qty?: number; order?: number }) => {
    setPending(true);
    const r = await requestShares(kind, inputs).catch(() => ({ ok: false, message: "The town is unreachable right now: nothing was changed." }));
    setPending(false); setMsg(r);
    if (r.ok) reload();
  };
  const suggested = side === "buy" ? (d.ask ?? d.price) : (d.bid ?? d.price);
  const field = "min-h-11 w-24 rounded-lg border border-black/15 px-2 tabular-nums";
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="listing" data-biz={d.business}>
      <button type="button" className="self-start text-sm underline" onClick={onBack} data-testid="listing-back">All listed businesses</button>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-[#4b5566]">Price</dt><dd className="font-semibold tabular-nums" data-testid="listing-price">{sora2(d.price)} <span className={`font-normal ${d.change_pct < 0 ? "text-[#b23a2e]" : "text-[#3f8f5a]"}`}>{pct(d.change_pct)} since listing</span></dd>
        <dt className="text-[#4b5566]">Run by</dt><dd>{d.owner_name} · <button type="button" className="underline" onClick={() => onPlot(d.plot)}>plot {d.plot}</button></dd>
        <dt className="text-[#4b5566]">Profit</dt><dd className="tabular-nums">{sora2(d.week_profit)} in the last 7 days</dd>
        <dt className="text-[#4b5566]">Dividend</dt><dd data-testid="listing-dividend">{d.dividend ? `${sora2(d.dividend)} a share last Sunday (${d.yield_pct}% of the price)` : "None paid yet"}</dd>
        <dt className="text-[#4b5566]">Shares</dt><dd>{d.public} of 1,000 with the public · {d.holders} shareholders{d.mine ? ` · you hold ${d.mine}` : ""}</dd>
      </dl>

      <section aria-label="Order book" className="grid grid-cols-2 gap-3" data-testid="listing-book">
        <div><h3 className="font-semibold">For sale</h3>{d.book.sell.length ? <ul className="mt-1 tabular-nums">{d.book.sell.map((o) => <li key={o.price} className="flex justify-between"><span>{sora2(o.price)}</span><span>{o.qty}</span></li>)}</ul> : <p className="mt-1 text-[#4b5566]">Nothing</p>}</div>
        <div><h3 className="font-semibold">Wanted</h3>{d.book.buy.length ? <ul className="mt-1 tabular-nums">{d.book.buy.map((o) => <li key={o.price} className="flex justify-between"><span>{sora2(o.price)}</span><span>{o.qty}</span></li>)}</ul> : <p className="mt-1 text-[#4b5566]">Nobody yet</p>}</div>
      </section>

      {d.resident ? <section aria-label="Trade" className="rounded-2xl border border-[#d8a838]/50 bg-[#fffaf0] p-3" data-testid="listing-trade">
        <div className="flex rounded-full border border-black/10 p-0.5" role="tablist">{(["buy", "sell"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={side === k} onClick={() => setSide(k)} data-testid={`listing-side-${k}`}
            className={`min-h-9 flex-1 rounded-full text-xs font-semibold ${side === k ? "bg-[#1d2433] text-white" : ""}`}>{k === "buy" ? "Buy" : "Sell"}</button>))}</div>
        <form key={side} className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
          send(side === "buy" ? "buy_shares" : "sell_shares", { business: d.business, price: Number(f.get("price")), qty: Number(f.get("qty")) }); }}>
          <label className="flex flex-col text-xs text-[#4b5566]">Price a share<input name="price" type="number" step="0.01" min="0.01" defaultValue={suggested} className={field} data-testid="listing-order-price" /></label>
          <label className="flex flex-col text-xs text-[#4b5566]">Shares<input name="qty" type="number" min="1" max={side === "sell" ? Math.max(1, d.mine) : 500} defaultValue={side === "sell" ? Math.min(10, Math.max(1, d.mine)) : 10} className={field} data-testid="listing-order-qty" /></label>
          <button className={`${btn} bg-[#1d2433] text-white`} disabled={pending || (side === "sell" && !d.mine)} data-testid="listing-order-go">{side === "buy" ? "Buy" : "Sell"}</button>
        </form>
        <p className="mt-1 text-xs text-[#4b5566]">Your agent places the order at the town&apos;s next hour. It fills against the best prices on the other side; the rest waits for up to three days.</p>
        {msg && <p className={`mt-2 ${msg.ok ? "" : "text-[#b23a2e]"}`} role="status" data-testid="listing-msg">{msg.message}</p>}
        {d.orders.length > 0 && <ul className="mt-2 flex flex-col gap-1" data-testid="listing-orders">{d.orders.map((o) => <li key={o.id} className="flex items-center justify-between gap-2">
          <span>{o.side === "buy" ? "Buying" : "Selling"} {o.qty - o.filled} at {sora2(o.price)}</span>
          <button type="button" className={`${btn} border border-black/15 bg-white`} disabled={pending} onClick={() => send("cancel_share_order", { order: o.id })}>Cancel</button></li>)}</ul>}
        {d.requests.length > 0 && <ul className="mt-2 flex flex-col gap-0.5 text-xs" data-testid="listing-requests">{d.requests.map((r) => <li key={r.id} data-status={r.status}>
          {SHARE_LABEL[r.kind] ?? r.kind}{typeof r.inputs.qty === "number" ? ` · ${r.inputs.qty}` : ""}{typeof r.inputs.price === "number" ? ` at ${sora2(r.inputs.price / 100)}` : ""}: <span className="font-semibold">{
            r.status === "queued" ? "waiting for the next hour" : r.status === "done" ? "done" : `refused, ${SHARE_REFUSAL[r.refusal] ?? r.detail ?? r.refusal}`}</span></li>)}</ul>}
      </section> : <p className="text-[#4b5566]" data-testid="listing-join">{l.signedIn ? "Move in to the town to buy shares." : "Sign in and move in to buy shares."}</p>}

      <section aria-label="Shareholders"><h3 className="font-semibold">Shareholders</h3>
        <ul className="mt-1 flex flex-col gap-0.5" data-testid="listing-holders">{d.holder_list.map((h) => <li key={h.id} className="flex justify-between gap-2"><span>{h.name}{h.owner ? " · owner" : ""}</span><span className="tabular-nums">{h.shares}</span></li>)}</ul></section>
      {d.trades.length > 0 && <section aria-label="Recent trades"><h3 className="font-semibold">Recent trades</h3>
        <ul className="mt-1 flex flex-col gap-0.5" data-testid="listing-trades">{d.trades.map((t, i) => <li key={i} className="flex justify-between gap-2"><span>{t.qty} at {sora2(t.price)} <span className="text-[#4b5566]">· {townTime(t.tick)}</span></span><span className="text-xs text-[#4b5566]">{t.seller} → {t.buyer}</span></li>)}</ul></section>}
      {d.dividends.length > 0 && <section aria-label="Dividends"><h3 className="font-semibold">Dividends</h3>
        <ul className="mt-1 flex flex-col gap-0.5" data-testid="listing-dividends">{d.dividends.map((v) => <li key={v.tick} className="flex justify-between gap-2"><span>{townTime(v.tick)}</span><span className="tabular-nums">{sora2(v.per_share)} a share · {sora2(v.total)} to {v.holders}</span></li>)}</ul></section>}
    </div>
  );
}

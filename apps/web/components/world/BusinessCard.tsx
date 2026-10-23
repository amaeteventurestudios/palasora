"use client";
// Palasora Phase 7: a business's numbers and, for its owner, the controls (Doc 06 sections 10 and 11.3). Every figure is
// read from the business's ledger account by the economy service; changes go out as requests that the town's next hour
// runs through the Actions gate, so the card shows each one as waiting, done or refused (with the reason).
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadBusinessCard, requestChange } from "@/app/actions/town-business";
import { PERIOD_LABEL, REFUSAL_LABEL, REQUEST_LABEL, sora2, type BusinessCardData, type RequestKind } from "@/lib/world/card";
import { BUSINESS_LABEL, HEALTH_LABEL, townTime } from "@/lib/world/layout";
import { GOODS, type Good } from "@/lib/world/market";

const DOT: Record<string, string> = { green: "#3fae6a", yellow: "#e8c33c", orange: "#ec8a3a", red: "#d9483b" };
type Period = keyof typeof PERIOD_LABEL;

export function BusinessCard({ bid, initial, full = false, head = true, onShares, onMarket }: { bid: string; initial?: BusinessCardData | null; full?: boolean; head?: boolean; onShares?(bid: string): void; onMarket?(good: Good): void }) {
  const [card, setCard] = useState<BusinessCardData | null | undefined>(initial);
  const [period, setPeriod] = useState<Period>("week");
  const reload = useCallback(() => { loadBusinessCard(bid).then((c) => setCard(c)).catch(() => setCard(null)); }, [bid]);
  useEffect(() => { if (initial === undefined) reload(); }, [initial, reload]);

  if (card === undefined) return <p className="mt-3 text-sm text-[#4b5566]" data-testid="biz-loading">Reading the ledger…</p>;
  if (card === null) return <p className="mt-3 text-sm text-[#4b5566]" data-testid="biz-unavailable">The business&apos;s books are unavailable right now.</p>;
  const m = card.money[period];
  const h = "text-sm font-semibold";
  return (
    <div className="mt-3 flex flex-col gap-4 text-sm" data-testid="biz-card" data-biz={card.id}>
      {head && <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-[#4b5566]">Status</dt>
        <dd className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: DOT[card.health] }} aria-hidden />{card.status === "open" ? HEALTH_LABEL[card.health] ?? card.health : "Closed"}</dd>
        <dt className="text-[#4b5566]">Business</dt><dd>{BUSINESS_LABEL[card.type]} · level {card.level} · plot {card.plot}</dd>
        <dt className="text-[#4b5566]">Run by</dt><dd>{card.owner_name || card.owner} <span className="rounded bg-[#d8a838]/25 px-1 text-[11px] font-bold">AI</span>{card.mine ? " · yours" : ""}</dd>
        {card.products.map((p) => <Fragment key={p.good}><dt className="text-[#4b5566]">Sells</dt><dd data-testid="biz-price">{p.good} at {sora2(p.price)} {p.unit}</dd></Fragment>)}
        {card.input && <><dt className="text-[#4b5566]">Buys</dt><dd>{card.input}</dd></>}
        <dt className="text-[#4b5566]">Wage</dt><dd>{sora2(card.wage)} a day</dd>
        <dt className="text-[#4b5566]">Reputation</dt><dd>{card.rating.toFixed(2)} <span className="text-[#4b5566]">(new businesses start at 1.00)</span></dd>
      </dl>}

      <LookInside card={card} />

      {card.shares?.listed && <section aria-label="Shares" className="rounded-2xl bg-[#f3f1ea] p-3" data-testid="biz-shares">
        <div className="flex items-baseline justify-between gap-2"><h3 className={h}>Shares on the Town Exchange</h3><span className="font-semibold tabular-nums">{sora2(card.shares.price ?? 0)}</span></div>
        <p className="mt-0.5 text-xs text-[#4b5566]">Listed at {sora2(card.shares.ipo_price ?? 0)} · last dividend {sora2(card.shares.dividend ?? 0)} a share · {card.shares.holders} shareholder{card.shares.holders === 1 ? "" : "s"}</p>
        {onShares && <button type="button" className="mt-2 inline-flex min-h-11 items-center rounded-full border border-black/15 bg-white px-4 text-sm font-semibold" onClick={() => onShares(card.id)} data-testid="biz-open-shares">Buy or sell shares</button>}
      </section>}

      <section aria-label="Money">
        <div className="flex items-center justify-between gap-2"><h3 className={h}>Money</h3>
          <div className="flex rounded-full border border-black/10 p-0.5" role="tablist">{(Object.keys(PERIOD_LABEL) as Period[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={period === k} onClick={() => setPeriod(k)} data-testid={`biz-period-${k}`}
              className={`min-h-9 rounded-full px-3 text-xs font-semibold ${period === k ? "bg-[#1d2433] text-white" : ""}`}>{PERIOD_LABEL[k]}</button>))}</div></div>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center" data-testid="biz-money">
          <div className="rounded-xl bg-[#f3f1ea] p-2"><dt className="text-xs text-[#4b5566]">Revenue</dt><dd className="font-semibold tabular-nums" data-testid="biz-revenue">{sora2(m.revenue)}</dd></div>
          <div className="rounded-xl bg-[#f3f1ea] p-2"><dt className="text-xs text-[#4b5566]">Costs</dt><dd className="font-semibold tabular-nums" data-testid="biz-costs">{sora2(m.costs)}</dd></div>
          <div className="rounded-xl bg-[#f3f1ea] p-2"><dt className="text-xs text-[#4b5566]">Profit</dt><dd className={`font-semibold tabular-nums ${m.profit < 0 ? "text-[#b23a2e]" : ""}`} data-testid="biz-profit">{sora2(m.profit)}</dd></div>
        </dl>
        <p className="mt-1.5 text-xs text-[#4b5566]" data-testid="biz-ledger">Balance {sora2(card.balance.available + card.balance.reserved)}{card.balance.reserved ? ` (${sora2(card.balance.reserved)} set aside)` : ""} · from the ledger, {card.ledger.entries} entries{card.ledger.balance_matches ? " · balance checks out" : ""}</p>
      </section>

      {card.recent_sales.length > 0 && <section aria-label="Recent sales"><h3 className={h}>Last 24 hours</h3>
        <ul className="mt-1 flex flex-col gap-0.5" data-testid="biz-sales">{card.recent_sales.slice(0, full ? 12 : 5).map((s) => <li key={s.entry} className="flex justify-between gap-2"><span>{s.what} <span className="text-[#4b5566]">· {townTime(s.tick)}</span></span><span className="tabular-nums">{sora2(s.amount)}</span></li>)}</ul></section>}

      {Object.keys(card.costs_week).length > 0 && <section aria-label="Costs this week"><h3 className={h}>Costs, last 7 days</h3>
        <ul className="mt-1 flex flex-col gap-0.5">{Object.entries(card.costs_week).map(([k, v]) => <li key={k} className="flex justify-between gap-2"><span>{k}</span><span className="tabular-nums">{sora2(v)}</span></li>)}</ul></section>}

      <section aria-label="Staff and stock" className="grid grid-cols-2 gap-3">
        <div><h3 className={h}>Staff</h3>{card.employees.length ? <ul className="mt-1" data-testid="biz-staff">{card.employees.map((e) => <li key={e.worker}>{e.name || e.worker}</li>)}</ul> : <p className="mt-1 text-[#4b5566]">Nobody yet</p>}</div>
        <div><h3 className={h}>Stock</h3>{Object.keys(card.stock).length ? <ul className="mt-1" data-testid="biz-stock">{Object.entries(card.stock).map(([g, s]) => <li key={g}>{s.qty} {g}{s.reserved ? ` (${s.reserved} promised)` : ""}{card.mine && onMarket && GOODS.includes(g as Good) && s.qty > s.reserved
          ? <> · <button type="button" className="underline" onClick={() => onMarket(g as Good)} data-testid="biz-sell-market">sell at the Market Hall</button></> : null}</li>)}</ul> : <p className="mt-1 text-[#4b5566]">Empty</p>}</div>
      </section>

      {card.contracts.length > 0 && <section aria-label="Contracts"><h3 className={h}>Contracts</h3>
        <ul className="mt-1 flex flex-col gap-1" data-testid="biz-contracts">{card.contracts.map((k) => <li key={k.id}>{k.role === "seller" ? "Sells" : "Buys"} {k.qty_per_day} {k.good} a day {k.role === "seller" ? "to" : "from"} {k.other} at {sora2(k.price)} · until day {k.end_day}{k.breaches ? ` · ${k.breaches} missed` : ""}</li>)}</ul></section>}

      {full && card.events.length > 0 && <section aria-label="Recent events"><h3 className={h}>Recent events</h3>
        <ul className="mt-1 flex flex-col gap-0.5">{card.events.map((e) => <li key={e.id}><Link className="underline" href={`/town/event/${e.id}`}>{e.text}</Link> <span className="text-[#4b5566]">· {townTime(e.tick)}</span></li>)}</ul></section>}

      {card.manage && <Manage card={card} onChanged={reload} />}

      {/* a full page load: leaving the 3D town frees its GPU memory, and a soft navigation can stall behind the render loop */}
      {!full && <a href={`/town/business/${card.id}`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-black/15 bg-white px-4 font-semibold" data-testid="biz-open-profile">Open profile</a>}
    </div>
  );
}

function Manage({ card, onChanged }: { card: BusinessCardData; onChanged(): void }) {
  const g = card.manage!;
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirm, setConfirm] = useState<RequestKind | null>(null);
  const [pending, setPending] = useState(false);
  const [offer, setOffer] = useState(300);
  const send = async (kind: RequestKind, inputs: Record<string, number | string> = {}) => {
    setPending(true);
    const r = await requestChange(card.id, kind, inputs).catch(() => ({ ok: false, message: "The town is unreachable right now: nothing was changed." }));
    setPending(false); setMsg(r); setConfirm(null);
    if (r.ok) onChanged();
  };
  const field = "min-h-11 w-24 rounded-lg border border-black/15 px-2 tabular-nums";
  const btn = "inline-flex min-h-11 items-center justify-center rounded-full px-4 font-semibold disabled:opacity-50";
  const price = card.products[0]?.price ?? 0;
  const full = g.staff >= g.max_staff;
  const big: Partial<Record<RequestKind, string>> = {
    upgrade: `Upgrade to level ${card.level + 1} for ${sora2(g.upgrade_cost)} from the business's balance?`,
    close_business: "Close this business? Staff are let go and the plot goes back on sale.",
    fire: "Let your most recent hire go?",
    list_shares: `Offer ${offer} shares at ${sora2(card.shares?.listing_price ?? 0)} each on the Town Exchange? You keep ${1000 - offer} of 1,000.`,
  };
  return (
    <section aria-label="Manage" className="rounded-2xl border border-[#d8a838]/50 bg-[#fffaf0] p-3" data-testid="biz-manage">
      <h3 className="text-sm font-semibold">Manage</h3>
      <p className="mt-0.5 text-xs text-[#4b5566]">Your agent applies each change at the town&apos;s next hour, within the limits you gave it.</p>
      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); send("set_price", { price: Number(new FormData(e.currentTarget).get("price")) }); }}>
        <label className="flex flex-col text-xs text-[#4b5566]">Price ({sora2(g.price_min)} to {sora2(g.price_max)})
          <input name="price" type="number" step="0.05" min="0.05" defaultValue={price} className={field} data-testid="biz-set-price" /></label>
        <button className={`${btn} bg-[#1d2433] text-white`} disabled={pending} data-testid="biz-set-price-go">Set price</button>
      </form>
      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); send("set_wage", { wage: Number(new FormData(e.currentTarget).get("wage")) }); }}>
        <label className="flex flex-col text-xs text-[#4b5566]">Daily wage (at least {sora2(g.wage_min)})
          <input name="wage" type="number" step="0.5" min="0.5" defaultValue={card.wage} className={field} data-testid="biz-set-wage" /></label>
        <button className={`${btn} bg-[#1d2433] text-white`} disabled={pending} data-testid="biz-set-wage-go">Set wage</button>
      </form>
      <p className="mt-3 text-xs text-[#4b5566]">Staff {g.staff} of {g.max_staff}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <button type="button" className={`${btn} border border-black/15 bg-white`} disabled={pending || full} onClick={() => send("hire", { slots: 1 })} data-testid="biz-hire">Hire</button>
        <button type="button" className={`${btn} border border-black/15 bg-white`} disabled={pending || g.staff === 0} onClick={() => setConfirm("fire")} data-testid="biz-fire">Let go</button>
        <button type="button" className={`${btn} border border-black/15 bg-white`} disabled={pending} onClick={() => setConfirm("upgrade")} data-testid="biz-upgrade">Upgrade · {sora2(g.upgrade_cost)}</button>
        {card.contracts.map((k) => <button key={k.id} type="button" className={`${btn} border border-black/15 bg-white`} disabled={pending} onClick={() => send("end_contract", { contract: k.id })}>End {k.id}</button>)}
        <button type="button" className={`${btn} border border-[#b23a2e]/40 bg-white text-[#b23a2e]`} disabled={pending} onClick={() => setConfirm("close_business")} data-testid="biz-close">Close</button>
      </div>
      {confirm && <div className="mt-3 rounded-xl bg-white p-3" role="alertdialog" aria-label="Confirm" data-testid="biz-confirm">
        <p>{big[confirm]}</p>
        <div className="mt-2 flex gap-2"><button type="button" className={`${btn} bg-[#1d2433] text-white`} disabled={pending} onClick={() => send(confirm, confirm === "list_shares" ? { qty: offer } : {})} data-testid="biz-confirm-go">Yes, send</button>
          <button type="button" className={`${btn} border border-black/15 bg-white`} onClick={() => setConfirm(null)}>Cancel</button></div></div>}
      {card.shares && !card.shares.listed && !card.shares.delisted && <div className="mt-3 rounded-xl bg-white p-3" data-testid="biz-list-shares">
        <h4 className="text-sm font-semibold">Sell shares on the Town Exchange</h4>
        {card.shares.eligible ? <form className="mt-1 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setOffer(Number(new FormData(e.currentTarget).get("qty"))); setConfirm("list_shares"); }}>
          <p className="w-full text-xs text-[#4b5566]">Offer up to {card.shares.max_offer} of your 1,000 shares at {sora2(card.shares.listing_price ?? 0)} each (what it cost plus its recent profit). You keep the majority; shareholders get half of each profitable week.</p>
          <label className="flex flex-col text-xs text-[#4b5566]">Shares to offer
            <input name="qty" type="number" min="1" max={card.shares.max_offer} defaultValue={300} className={field} data-testid="biz-list-qty" /></label>
          <button className={`${btn} bg-[#1d2433] text-white`} disabled={pending} data-testid="biz-list-go">List shares</button>
        </form> : <p className="mt-1 text-xs text-[#4b5566]" data-testid="biz-list-why">Not yet: {card.shares.why}.</p>}
      </div>}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "" : "text-[#b23a2e]"}`} role="status" data-testid="biz-msg">{msg.message}</p>}
      {g.requests.length > 0 && <div className="mt-3"><h4 className="text-xs font-semibold uppercase text-[#4b5566]">Your requests</h4>
        <ul className="mt-1 flex flex-col gap-0.5" data-testid="biz-requests">{g.requests.map((r) => (
          <li key={r.id} data-status={r.status}>{REQUEST_LABEL[r.kind] ?? r.kind}{describe(r.inputs)}: <span className="font-semibold">{r.status === "queued" ? "waiting for the next hour" : r.status === "done" ? "done" : r.status === "refused" ? `refused, ${REFUSAL_LABEL[r.refusal] ?? r.detail ?? r.refusal}` : r.status}</span></li>))}</ul></div>}
    </section>
  );
}

function describe(i: Record<string, unknown>) {
  if (typeof i.price === "number") return ` to ${sora2(i.price / 100)}`;
  if (typeof i.wage === "number") return ` to ${sora2(i.wage / 100)}`;
  if (typeof i.contract === "string") return ` ${i.contract}`;
  if (typeof i.qty === "number") return ` · ${i.qty}`;
  return "";
}

// Step 4: a cutaway of the room the business works in, drawn from the same numbers as the card (its staff and stock).
function LookInside({ card }: { card: BusinessCardData }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);
  const staff = card.employees.length;
  const stock = JSON.stringify(Object.fromEntries(Object.entries(card.stock).map(([g, s]) => [g, s.qty])));
  useEffect(() => {
    if (!open || !ref.current) return;
    let gone = false, mounted: { dispose(): void } | null = null;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    import("@/lib/world/interior").then(({ mountInterior }) => {
      if (gone || !ref.current) return;
      const m = mountInterior(ref.current, { type: card.type as never, level: card.level, staff, stock: JSON.parse(stock), reduceMotion });
      mounted = m; ref.current.dataset.people = String(m.people);
      ref.current.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    });
    return () => { gone = true; mounted?.dispose(); };
  }, [open, card.type, card.level, staff, stock]);
  return (
    <section aria-label="Inside">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="biz-look-inside"
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-black/15 bg-white px-4 font-semibold">{open ? "Close the inside view" : "Look inside"}</button>
      {open && <canvas ref={ref} className="mt-2 aspect-[16/10] w-full rounded-2xl bg-[#efe9dc]" aria-label={`Inside the ${BUSINESS_LABEL[card.type]?.toLowerCase() ?? "business"}: ${staff + 1} at work`} role="img" data-testid="biz-interior" />}
    </section>
  );
}

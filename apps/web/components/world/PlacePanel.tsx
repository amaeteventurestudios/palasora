"use client";
// Palasora step 3: "Find a place". A newcomer picks a free home (lit up on the map) and moves in with the new player's
// grant; a resident starts a food cart by a busy kerb, or buys a plot for sale (prices on the map) and builds what its
// zone allows, or settles the cart there as a stall. Every choice is a request the town's next hour runs through the
// Actions gate, so the panel shows each one as waiting, done or refused (with the reason).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadPlace, requestPlace } from "@/app/actions/town-place";
import { AREA_LABEL, BUSINESS_LABEL } from "@/lib/world/layout";
import { PLACE_LABEL, PLACE_REFUSAL, ZONE_TAKES, soraWhole, type Auction, type BizType, type ForSale, type PlaceData, type PlaceKind } from "@/lib/world/place";

export type Highlight = { id: string; text: string }[] | null;
const ZONES = ["market", "main", "harbourside", "farmland"];
type Confirm = { kind: PlaceKind; plot?: string; btype?: BizType; business?: string; auction?: number; amount?: number; text: string };

export function PlacePanel({ focus, onHighlight, onFly }: { focus?: string; onHighlight(h: Highlight): void; onFly(plot: string): void }) {
  const [state, setState] = useState<{ signedIn: boolean; data: PlaceData | null } | undefined>();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pending, setPending] = useState(false);
  const [more, setMore] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const reload = useCallback(() => { loadPlace().then(setState).catch(() => setState({ signedIn: true, data: null })); }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { setZone(null); setMore(false); }, [focus]);
  const d = state?.data;
  const needsHome = !!d && (!d.resident || !d.home);
  const waiting = useMemo(() => new Set((d?.requests ?? []).filter((r) => r.status === "queued").map((r) => r.kind)), [d]);

  // plots for sale, one zone at a time (the focused plot's zone first, else downtown)
  const zones = useMemo(() => ZONES.filter((k) => d?.for_sale.some((p) => p.area === k)), [d]);
  const z = zone ?? d?.for_sale.find((p) => p.plot === focus)?.area ?? (zones.includes("market") ? "market" : zones[0]);
  // light up what the person can pick: free homes before they have one, then the plots for sale in the zone shown
  useEffect(() => {
    if (!d) return;
    if (needsHome) onHighlight(d.free_homes.map((h) => ({ id: h.plot, text: "Free home" })));
    else onHighlight([...d.auctions.map((a) => ({ id: a.plot, text: `Auction · ${soraWhole(a.bids ? a.high : a.reserve)}` })),
      ...d.my_plots.map((p) => ({ id: p.plot, text: "Your plot" })),
      ...d.for_sale.filter((p) => p.area === z).map((p) => ({ id: p.plot, text: soraWhole(p.price) }))]);
  }, [d, needsHome, z, onHighlight]);
  useEffect(() => () => onHighlight(null), [onHighlight]);

  const send = async (c: Confirm) => {
    setPending(true);
    const r = await requestPlace(c.kind, { plot: c.plot, btype: c.btype, business: c.business, auction: c.auction, amount: c.amount })
      .catch(() => ({ ok: false, message: "The town is unreachable right now: nothing was changed." }));
    setPending(false); setMsg(r); setConfirm(null);
    if (r.ok) reload();
  };

  const btn = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-50";
  const primary = `${btn} bg-[#1d2433] text-white`, secondary = `${btn} border border-black/15 bg-white`;
  if (state === undefined) return <p className="text-sm text-[#4b5566]" data-testid="place-loading">Reading the town&apos;s records…</p>;
  if (!state.signedIn) return (
    <div data-testid="place"><p className="text-sm">Sign in to move into town: homes are free, and you arrive with some Sora to start.</p>
      <div className="mt-3"><Link className={primary} href="/auth/sign-in?next=/">Sign in</Link></div></div>
  );
  if (!d) return <p className="text-sm text-[#4b5566]" data-testid="place-unavailable">The town&apos;s records are unavailable right now.</p>;

  const cart = d.carts[0];
  const owned = d.businesses.length + d.carts.length;
  const sale = d.for_sale.filter((p) => p.area === z).sort((a, b) => (a.plot === focus ? -1 : b.plot === focus ? 1 : a.price - b.price || a.plot.localeCompare(b.plot)));
  const shown = more ? sale : sale.slice(0, 6);
  // the service lists the new suburb homes first (a house goes up for whoever moves in), then the old town's free homes
  const homes = [...d.free_homes].sort((a, b) => (a.plot === focus ? -1 : b.plot === focus ? 1 : 0));
  const h3 = "text-sm font-semibold";

  return (
    <div className="flex flex-col gap-4 text-sm" data-testid="place" data-resident={d.resident ? "yes" : "no"}>
      {d.resident && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5" data-testid="place-me">
          <dt className="text-[#4b5566]">Home</dt><dd>{d.home ? <button type="button" className="-my-3 min-h-11 underline" onClick={() => onFly(d.home!)}>Plot {d.home}</button> : "None yet"}</dd>
          <dt className="text-[#4b5566]">Wallet</dt><dd className="tabular-nums" data-testid="place-balance">{soraWhole(d.balance)}{d.held ? <span className="text-[#4b5566]"> · {soraWhole(d.held)} held for bids</span> : null}</dd>
          <dt className="text-[#4b5566]">Trading</dt><dd>{owned === 0 ? "Nothing yet" : [...d.carts.map((c) => `Food cart by ${c.plot}`), ...d.businesses.map((b) => `${BUSINESS_LABEL[b.type]} on ${b.plot}`)].join(" · ")}</dd>
        </dl>
      )}

      {needsHome && (
        <section aria-label="Pick a home">
          <h3 className={h3}>{d.resident ? "Pick your home" : "Move in"}</h3>
          <p className="mt-0.5 text-[#4b5566]">Homes are free, one each. {d.resident ? "" : `You arrive with ${soraWhole(d.prices.grant)} to start. `}Free homes glow on the map; tap one, or pick from the list. New houses in Southgate are built for whoever moves in.</p>
          {homes.length === 0 ? <p className="mt-2">Every home is taken right now. New homes open with Southgate.</p> : (
            <ul className="mt-2 flex flex-wrap gap-2" data-testid="place-homes">{homes.slice(0, 10).map((h) => (
              <li key={h.plot}><button type="button" className={`${secondary} ${h.plot === focus ? "!border-[#d8a838] !bg-[#fff4d6]" : ""}`} disabled={pending || waiting.has("move_in") || waiting.has("claim_home")}
                onClick={() => { onFly(h.plot); setConfirm({ kind: d.resident ? "claim_home" : "move_in", plot: h.plot, text: h.new
                  ? `${d.resident ? "Take" : "Move into"} a new house at ${h.address}? It's free, and it goes up the day you move in.`
                  : `${d.resident ? "Take" : "Move into"} the home on plot ${h.plot}? It's free.` }); }}
                data-testid="place-home" data-new={h.new ? "yes" : "no"}>{h.new ? `${h.address} · new` : `Plot ${h.plot}`}</button></li>))}</ul>
          )}
        </section>
      )}

      {d.resident && !cart && owned < d.prices.max_businesses && (
        <section aria-label="Start a food cart" className="rounded-2xl bg-[#f3f1ea] p-3">
          <h3 className={h3}>Start with a food cart · {soraWhole(d.prices.cart)}</h3>
          <p className="mt-0.5 text-[#4b5566]">The cheapest way to start trading: sell meals from a cart by a busy street. No plot needed, and you work it yourself. Later, settle it on a plot and it becomes a stall.</p>
          <button type="button" className={`${primary} mt-2`} disabled={pending || waiting.has("start_cart") || d.balance < d.prices.cart}
            onClick={() => setConfirm({ kind: "start_cart", plot: focus && d.for_sale.find((p) => p.plot === focus)?.kerb ? focus : undefined,
              text: `Start a food cart for ${soraWhole(d.prices.cart)}${focus && d.for_sale.find((p) => p.plot === focus)?.kerb ? ` by plot ${focus}` : " on the busiest free kerb"}?` })}
            data-testid="place-start-cart">Start a cart</button>
          {d.balance < d.prices.cart && <p className="mt-1 text-xs text-[#4b5566]">You need {soraWhole(d.prices.cart - d.balance)} more.</p>}
        </section>
      )}

      {d.resident && d.my_plots.length > 0 && (
        <section aria-label="Your empty plots" data-testid="place-my-plots">
          <h3 className={h3}>Build on your plot</h3>
          <p className="mt-0.5 text-[#4b5566]">The land is paid for: you pay only for the building.</p>
          <ul className="mt-2 flex flex-col gap-2">{d.my_plots.map((p) => (
            <li key={p.plot} className="rounded-xl border border-[#d8a838] bg-[#fffaf0] p-2.5" data-plot={p.plot}>
              <button type="button" className="min-h-11 text-left font-semibold underline-offset-2 hover:underline" onClick={() => onFly(p.plot)}>Plot {p.plot}</button>
              <p className="text-xs text-[#4b5566]">{AREA_LABEL[p.area] ?? p.area}{p.prime ? " · prime" : ""} · takes {ZONE_TAKES[p.area] ?? "nothing yet"}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">{p.allowed.map((t) => (
                <button key={t} type="button" className={secondary} disabled={pending || d.balance < (p.total[t] ?? 0)} data-testid={`place-own-build-${t}`}
                  onClick={() => setConfirm({ kind: "build", plot: p.plot, btype: t, text: `Build a ${BUSINESS_LABEL[t].toLowerCase()} on your plot ${p.plot} for ${soraWhole(p.total[t] ?? 0)}?` })}>
                  {BUSINESS_LABEL[t]} · {soraWhole(p.total[t] ?? 0)}</button>))}</div>
            </li>))}</ul>
        </section>
      )}

      {d.resident && !needsHome && d.auctions.length > 0 && (
        <section aria-label="Auctions" data-testid="place-auctions">
          <h3 className={h3}>At auction</h3>
          <p className="mt-0.5 text-[#4b5566]">The Town Hall auctions a prime plot each day. Your bid is held from your wallet until someone bids more (then it comes straight back) or you win.</p>
          <ul className="mt-2 flex flex-col gap-2">{d.auctions.map((a) => (
            <AuctionRow key={a.id} a={a} focus={a.plot === focus} balance={d.balance} disabled={pending || waiting.has("bid")} onFly={onFly}
              onBid={(amount) => setConfirm({ kind: "bid", auction: a.id, amount, plot: a.plot, text: `Bid ${soraWhole(amount)} for plot ${a.plot}? It's held from your wallet until you're outbid or win.` })} />))}</ul>
        </section>
      )}

      {d.resident && !needsHome && (
        <section aria-label="Plots for sale">
          <h3 className={h3}>Plots for sale</h3>
          <p className="mt-0.5 text-[#4b5566]">Prices glow on the map. Each zone takes certain businesses; the price is the plot plus the building.</p>
          {zones.length > 1 && <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Zones">{zones.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === z} onClick={() => { setZone(k); setMore(false); }} data-testid={`place-zone-${k}`}
              className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${k === z ? "border-[#1d2433] bg-[#1d2433] text-white" : "border-black/15 bg-white"}`}>
              {AREA_LABEL[k]} · {d.for_sale.filter((p) => p.area === k).length}</button>))}</div>}
          {sale.length === 0 ? <p className="mt-2">No plots are for sale right now.</p> : (
            <ul className="mt-2 flex flex-col gap-2" data-testid="place-sale">{shown.map((p) => (
              <SaleRow key={p.plot} p={p} focus={p.plot === focus} cart={cart} cartCost={d.prices.cart} balance={d.balance} disabled={pending || owned >= d.prices.max_businesses && !cart}
                onFly={onFly} onPick={setConfirm} />))}</ul>
          )}
          {sale.length > 6 && !more && <button type="button" className={`${secondary} mt-2`} onClick={() => setMore(true)}>Show all {sale.length}</button>}
        </section>
      )}

      {confirm && <div className="rounded-xl border border-[#d8a838]/50 bg-[#fffaf0] p-3" role="alertdialog" aria-label="Confirm" data-testid="place-confirm">
        <p>{confirm.text}</p>
        <p className="mt-1 text-xs text-[#4b5566]">It happens at the town&apos;s next hour.</p>
        <div className="mt-2 flex gap-2"><button type="button" className={primary} disabled={pending} onClick={() => send(confirm)} data-testid="place-confirm-go">Yes, send</button>
          <button type="button" className={secondary} onClick={() => setConfirm(null)}>Cancel</button></div></div>}
      {msg && <p className={`text-sm ${msg.ok ? "" : "text-[#b23a2e]"}`} role="status" data-testid="place-msg">{msg.message}</p>}

      {d.requests.length > 0 && <div><h4 className="text-xs font-semibold uppercase text-[#4b5566]">Your requests</h4>
        <ul className="mt-1 flex flex-col gap-0.5" data-testid="place-requests">{d.requests.map((r) => (
          <li key={r.id} data-status={r.status}>{PLACE_LABEL[r.kind] ?? r.kind}{typeof r.inputs.plot === "string" ? ` · ${r.inputs.plot}` : ""}{typeof r.inputs.btype === "string" ? ` · ${BUSINESS_LABEL[r.inputs.btype]}` : ""}: <span className="font-semibold">{
            r.status === "queued" ? "waiting for the next hour" : r.status === "done" ? (r.detail || "done") : r.status === "refused" ? `refused, ${PLACE_REFUSAL[r.refusal] ?? r.detail ?? r.refusal}` : r.status}</span></li>))}</ul></div>}
    </div>
  );
}

function AuctionRow({ a, focus, balance, disabled, onFly, onBid }: { a: Auction; focus: boolean; balance: number; disabled: boolean; onFly(id: string): void; onBid(amount: number): void }) {
  const [amount, setAmount] = useState(a.min_bid);
  useEffect(() => setAmount(a.min_bid), [a.min_bid]);
  const can = balance + (a.leading ? a.high : 0);
  return (
    <li className={`rounded-xl border p-2.5 ${focus ? "border-[#d8a838] bg-[#fffaf0]" : "border-black/10"}`} data-plot={a.plot} data-testid="place-auction">
      <div className="flex items-baseline justify-between gap-2">
        <button type="button" className="min-h-11 text-left font-semibold underline-offset-2 hover:underline" onClick={() => onFly(a.plot)}>Plot {a.plot}</button>
        <span className="tabular-nums">{a.bids ? `${soraWhole(a.high)} · ${a.bids} bid${a.bids > 1 ? "s" : ""}` : `from ${soraWhole(a.reserve)}`}</span>
      </div>
      <p className="text-xs text-[#4b5566]">{AREA_LABEL[a.area] ?? a.area}{a.prime ? " · prime" : ""} · takes {ZONE_TAKES[a.area] ?? "nothing yet"} · ends in {a.hours_left} hour{a.hours_left === 1 ? "" : "s"}</p>
      {a.leading && <p className="mt-1 text-sm font-semibold text-[#3f8f5a]" data-testid="place-leading">You&apos;re the highest bidder</p>}
      {!a.leading && a.my_bid > 0 && <p className="mt-1 text-sm font-semibold text-[#b23a2e]">You were outbid: your {soraWhole(a.my_bid)} is back in your wallet</p>}
      <form className="mt-1.5 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); onBid(amount); }}>
        <label className="flex flex-col text-xs text-[#4b5566]">Your bid (at least {soraWhole(a.min_bid)})
          <input type="number" min={a.min_bid} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="min-h-11 w-28 rounded-lg border border-black/15 px-2 tabular-nums" data-testid="place-bid-amount" /></label>
        <button className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1d2433] px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={disabled || amount < a.min_bid || amount > can} data-testid="place-bid">Bid</button>
      </form>
    </li>
  );
}

function SaleRow({ p, focus, cart, cartCost, balance, disabled, onFly, onPick }: {
  p: ForSale; focus: boolean; cart?: { id: string }; cartCost: number; balance: number; disabled: boolean; onFly(id: string): void; onPick(c: Confirm): void;
}) {
  const btn = "inline-flex min-h-11 items-center justify-center rounded-full border border-black/15 bg-white px-3 text-sm font-semibold disabled:opacity-50";
  return (
    <li className={`rounded-xl border p-2.5 ${focus ? "border-[#d8a838] bg-[#fffaf0]" : "border-black/10"}`} data-plot={p.plot} data-testid="place-plot">
      <div className="flex items-baseline justify-between gap-2">
        <button type="button" className="min-h-11 text-left font-semibold underline-offset-2 hover:underline" onClick={() => onFly(p.plot)}>Plot {p.plot}</button>
        <span className="tabular-nums">{soraWhole(p.price)}</span>
      </div>
      <p className="text-xs text-[#4b5566]">{AREA_LABEL[p.area] ?? p.area}{p.prime ? " · prime" : ""} · takes {ZONE_TAKES[p.area] ?? "nothing yet"}{p.cart_parked ? " · a cart trades at its kerb" : ""}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {cart && p.allowed.includes("stall") && (() => {
          const cost = Math.max(0, (p.total.stall ?? 0) - cartCost);
          return <button type="button" className={`${btn} !border-[#d8a838]`} disabled={disabled || balance < cost} data-testid="place-settle"
            onClick={() => onPick({ kind: "buy_plot", plot: p.plot, btype: "stall", business: cart.id, text: `Buy plot ${p.plot} and settle your cart there as a food stall, for ${soraWhole(cost)} (your cart counts toward it)?` })}>
            Settle your cart here · {soraWhole(cost)}</button>;
        })()}
        {p.allowed.map((t) => {
          const total = p.total[t] ?? 0;
          return <button key={t} type="button" className={btn} disabled={disabled || balance < total} data-testid={`place-build-${t}`}
            onClick={() => onPick({ kind: "buy_plot", plot: p.plot, btype: t, text: `Buy plot ${p.plot} and build a ${BUSINESS_LABEL[t].toLowerCase()} for ${soraWhole(total)}?` })}>
            {BUSINESS_LABEL[t]} · {soraWhole(total)}</button>;
        })}
      </div>
    </li>
  );
}

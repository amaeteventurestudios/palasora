"use client";
// Cards over the world (Doc 06 section 9.3): a half-height sheet in portrait, a slim right panel in landscape.
// Phase 6 shows what the town's records say about a place; Phase 7 adds the business numbers from the ledger (BusinessCard).
import { useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { AREA_LABEL, BUSINESS_LABEL, HEALTH_LABEL, plotTitle, townTime, type WorldData } from "@/lib/world/layout";
import type { Viewer } from "./WorldApp";
import { useTrap } from "./useTrap";
import { BusinessCard } from "./BusinessCard";

export type CardState =
  | { kind: "plot"; id: string } | { kind: "landmark"; title: string; text: string } | { kind: "away" } | { kind: "agent" }
  | { kind: "no-plot" } | { kind: "travel" } | { kind: "settings" };

const KIND: Record<string, string> = {
  business_opened: "Opened", business_closed: "Closed", business_sold: "Sold", vote_result: "Town vote", player_arrived: "Arrival", hired: "Hired",
  let_go: "Let go", worker_left: "Worker left", contract_signed: "Contract", contract_breached: "Contract breached", contract_ended: "Contract ended",
  price_changed: "Price", upgraded: "Upgrade", market_trade: "Market Hall", starter_grant: "Grant",
};
const DOT: Record<string, string> = { green: "#3fae6a", yellow: "#e8c33c", orange: "#ec8a3a", red: "#d9483b" };
const sora = (n: number) => `${n.toLocaleString("en", { maximumFractionDigits: 2 })} Sora`;

export function WorldCard({ card, data, viewer, prefs, reduceMotion, reason, onClose, onPlot, onPref, onTour }: {
  card: CardState; data: WorldData; viewer: Viewer; prefs: { three: boolean; leftHanded: boolean }; reduceMotion: boolean; reason: string | null;
  onClose(): void; onPlot(id: string): void; onPref(p: Partial<{ three: boolean; leftHanded: boolean }>): void; onTour(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useTrap(ref, onClose);
  let title = "", body: React.ReactNode = null;
  const btn = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold";
  const primary = `${btn} bg-[#1d2433] text-white`, secondary = `${btn} border border-black/15 bg-white`;

  if (card.kind === "plot") {
    const p = data.plots.find((x) => x.id === card.id);
    const b = data.businesses.find((x) => x.plot === card.id && x.status === "open") ?? data.businesses.find((x) => x.plot === card.id);
    const items = data.away?.items.filter((i) => i.plot === card.id) ?? [];
    title = p ? plotTitle(p, b) : "Plot";
    body = !p ? <p>This plot is not on the town map.</p> : (
      <>
        <p className="text-sm text-[#4b5566]">Plot {p.id} · {AREA_LABEL[p.area] ?? p.area}{p.prime ? " · prime" : ""}{p.id === data.mine.plot ? " · your plot" : ""}</p>
        {b && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm" data-testid="card-business">
            <dt className="text-[#4b5566]">Status</dt>
            <dd className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: DOT[b.health] }} aria-hidden />{b.status === "open" ? HEALTH_LABEL[b.health] ?? b.health : "Closed"}</dd>
            <dt className="text-[#4b5566]">Business</dt><dd>{BUSINESS_LABEL[b.type]} · level {b.level}</dd>
            <dt className="text-[#4b5566]">Run by</dt><dd>{b.owner_name || b.owner} <span className="rounded bg-[#d8a838]/25 px-1 text-[11px] font-bold">AI</span></dd>
            <dt className="text-[#4b5566]">Price</dt><dd>{sora(b.price_sora)}</dd>
            <dt className="text-[#4b5566]">Wage</dt><dd>{sora(b.wage_sora)} a day</dd>
          </dl>
        )}
        {b && <BusinessCard key={b.id} bid={b.id} head={false} />}
        {!b && p.use === "civic" && <p className="mt-3 text-sm">{p.area === "town_hall" ? "Votes and civic jobs. The weekly vote is decided here." : p.area === "market_hall" ? "Prices for crops, tools and materials are set here by real orders." : "Imports and exports arrive here by boat."}</p>}
        {!b && p.use === "home" && <p className="mt-3 text-sm">Homes for the town&apos;s residents.</p>}
        {!b && p.use === "business" && <p className="mt-3 text-sm">No business on this plot yet.</p>}
        {items.length > 0 && (
          <div className="mt-4"><h3 className="text-sm font-semibold">Since you left</h3>
            <ul className="mt-1 flex flex-col gap-1 text-sm">{items.map((i) => <li key={i.event}><Link className="underline" href={`/town/event/${i.event}`}>{i.text}</Link> <span className="text-[#4b5566]">· {townTime(i.tick)}</span></li>)}</ul></div>
        )}
      </>
    );
  } else if (card.kind === "landmark") {
    title = card.title; body = <p className="text-sm">{card.text}</p>;
  } else if (card.kind === "away") {
    const a = data.away;
    title = "Since you left";
    body = !a || a.quiet ? <p className="text-sm" data-testid="away-quiet">Quiet in town: nothing changed for you.</p> : (
      <>
        <p className="text-sm text-[#4b5566]">From the town&apos;s records, yours first.</p>
        <ul className="mt-2 flex flex-col gap-1.5" data-testid="away-list">{a.items.map((i) => (
          <li key={i.event} className="text-sm"><span className="me-2 text-xs font-semibold uppercase text-[#4b5566]">{i.yours ? "Yours" : KIND[i.kind] ?? "Town"}</span>
            {i.plot ? <button type="button" className="text-left underline" onClick={() => onPlot(i.plot!)}>{i.text}</button> : <Link className="underline" href={`/town/event/${i.event}`}>{i.text}</Link>}
            <span className="text-[#4b5566]"> · {townTime(i.tick)}</span></li>))}</ul>
        {!reduceMotion && data.markers.length > 0 && <div className="mt-3"><button type="button" className={primary} onClick={onTour} data-testid="away-tour">Show me</button></div>}
      </>
    );
  } else if (card.kind === "agent") {
    title = "My Agent";
    body = viewer.signedIn ? (
      <>
        <p className="text-sm">{data.mine.agents.length ? `Your agent in ${data.town.name}: ${data.mine.agents.length} resident${data.mine.agents.length > 1 ? "s" : ""}, ${data.mine.businesses.length} business${data.mine.businesses.length === 1 ? "" : "es"}.` : `Your agent has no place in ${data.town.name} yet.`}</p>
        {viewer.waiting > 0 && <p className="mt-1 text-sm font-semibold">{viewer.waiting} decision{viewer.waiting > 1 ? "s" : ""} waiting.</p>}
        <div className="mt-3 flex gap-2"><Link className={primary} href="/my-agents">Open My Agents</Link><Link className={secondary} href="/messages">Messages</Link></div>
      </>
    ) : <><p className="text-sm">Sign in to meet your agent.</p><div className="mt-3"><Link className={primary} href="/auth/sign-in?next=/">Sign in</Link></div></>;
  } else if (card.kind === "no-plot") {
    title = "My Plot";
    body = viewer.signedIn ? <p className="text-sm">You don&apos;t have a plot in {data.town.name} yet. Every person gets a home plot when they join the town.</p>
      : <><p className="text-sm">Sign in to see your plot.</p><div className="mt-3"><Link className={primary} href="/auth/sign-in?next=/">Sign in</Link></div></>;
  } else if (card.kind === "travel") {
    title = "Travel";
    body = (
      <>
        <ul className="flex flex-col gap-2 text-sm"><li className="flex items-center justify-between rounded-xl border border-black/10 p-3"><span><span className="font-semibold">{data.town.name}</span><br /><span className="text-[#4b5566]">Home town · {data.plots.length} plots</span></span><span className="text-xs font-semibold text-[#3f8f8f]">You are here</span></li></ul>
        <p className="mt-3 text-sm text-[#4b5566]">More towns grow as the population grows.</p>
      </>
    );
  } else {
    title = "Settings";
    body = (
      <div className="flex flex-col gap-1 text-sm">
        <label className="flex min-h-11 items-center justify-between gap-3"><span>3D town{reason && prefs.three ? <span className="block text-xs text-[#4b5566]">{reason}</span> : null}</span>
          <input type="checkbox" className="size-5" checked={prefs.three} onChange={(e) => onPref({ three: e.target.checked })} data-testid="pref-3d" /></label>
        <label className="flex min-h-11 items-center justify-between gap-3"><span>Left-handed menus</span>
          <input type="checkbox" className="size-5" checked={prefs.leftHanded} onChange={(e) => onPref({ leftHanded: e.target.checked })} data-testid="pref-left" /></label>
        <Link href="/account" className="flex min-h-11 items-center underline">Language, region and account</Link>
      </div>
    );
  }

  return (
    <div ref={ref} role="dialog" aria-modal="false" aria-labelledby="world-card-h" data-testid="world-card" data-card={card.kind}
      className="absolute z-20 overflow-y-auto bg-white shadow-xl portrait:inset-x-0 portrait:bottom-0 portrait:max-h-[50vh] portrait:rounded-t-2xl portrait:pb-[calc(max(16px,env(safe-area-inset-bottom))+64px)]
        landscape:bottom-[max(12px,env(safe-area-inset-bottom))] landscape:right-[max(12px,env(safe-area-inset-right))] landscape:top-[max(64px,env(safe-area-inset-top))] landscape:w-[340px] landscape:rounded-2xl p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 id="world-card-h" className="text-lg font-bold">{title}</h2>
        <button type="button" onClick={onClose} className="-me-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5" aria-label="Close card"><X className="size-5" aria-hidden /></button>
      </div>
      {body}
    </div>
  );
}

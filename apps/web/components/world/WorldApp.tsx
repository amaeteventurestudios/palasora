"use client";
// Palasora Phase 6: the world-first landing screen (Doc 06 section 9, Doc 03 section 6). The town fills the screen; two
// menus float over it (the three-dot main menu top-left, the quick menu bottom-right), a status chip sits top centre,
// and cards open only on tap. Three.js loads as its own chunk from WorldCanvas; the 2D map and the list view never load it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Bell, Bot, CircleHelp, Coins, Gamepad2, Home, LayoutList, LineChart, Map as MapIcon, MessageSquare, MoreHorizontal, Plus,
  Settings, Shield, Trophy, User, Users, X, Store, Navigation, ZoomIn, ZoomOut, LocateFixed, Layers, MapPin } from "lucide-react";
import type { WorldData } from "@/lib/world/layout";
import { townTime } from "@/lib/world/layout";
import type { WorldHandle, Selection, Label } from "@/lib/world/scene";
import { Town2D } from "./Town2D";
import { TownList } from "./TownList";
import { WorldCard, type CardState } from "./WorldCard";
import type { Highlight } from "./PlacePanel";
import { useTrap } from "./useTrap";

const WorldCanvas = dynamic(() => import("./WorldCanvas").then((m) => m.WorldCanvas), { ssr: false, loading: () => <Loading /> });

export type Viewer = { signedIn: boolean; name: string; handle: string; staff: boolean; unread: number; waiting: number };
type View = "3d" | "2d" | "list";
type Prefs = { three: boolean; leftHanded: boolean };
const PREFS_KEY = "palasora.world";
const CAM_KEY = "palasora.world.camera";

function readPrefs(): Prefs {
  try { return { three: true, leftHanded: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") }; } catch { return { three: true, leftHanded: false }; }
}
function savePrefs(p: Prefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ } }

/** Why the 3D town is not shown, if it isn't: no WebGL 2, Save-Data, low memory, or 3D turned off in Settings. */
function fallbackReason(prefs: Prefs): string | null {
  const sp = new URLSearchParams(location.search);
  if (sp.get("view") === "2d") return "2D map chosen";
  if (sp.get("view") === "3d") return null;
  if (!prefs.three) return "3D is off in Settings";
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return "Data Saver is on";
  if (nav.deviceMemory != null && nav.deviceMemory < 2) return "This device is low on memory";
  try { if (!document.createElement("canvas").getContext("webgl2")) return "This browser has no WebGL 2"; } catch { return "This browser has no WebGL 2"; }
  return null;
}

export function WorldApp({ data, viewer, at }: { data: WorldData | null; viewer: Viewer; at?: string }) {
  const [view, setView] = useState<View | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({ three: true, leftHanded: false });
  const [menu, setMenu] = useState<null | "main" | "quick">(null);
  const [card, setCard] = useState<CardState | null>(null);
  const [selected, setSelected] = useState<string | null>(at ?? null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [reduce, setReduce] = useState(false);
  const world = useRef<WorldHandle | null>(null);
  const mainBtn = useRef<HTMLButtonElement>(null), quickBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const p = readPrefs(); setPrefs(p);
    setReduce(matchMedia("(prefers-reduced-motion: reduce)").matches);
    const sp = new URLSearchParams(location.search);
    if (sp.get("view") === "list") { setView("list"); return; }
    const r = fallbackReason(p); setReason(r); setView(r ? "2d" : "3d");
  }, []);

  // "Since you left": once per visit, when there is something real to show
  useEffect(() => {
    if (!data?.away || !view || view === "list" || at) return;
    const key = `palasora.away.${data.away.since_tick}.${data.tick}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
    if (data.away.items.length || data.mine.resident) setCard({ kind: "away" });
  }, [data, view, at]);

  const covered = !!menu || !!card;
  // on a portrait phone a card covers the bottom half: keep the place it is about in the visible half above it
  useEffect(() => {
    const fit = () => world.current?.inset(card && innerHeight > innerWidth ? Math.round(Math.min(innerHeight * 0.5, document.querySelector("[data-testid=world-card]")?.getBoundingClientRect().height ?? 0)) : 0);
    fit(); const t = setTimeout(fit, 400);
    addEventListener("resize", fit);
    return () => { clearTimeout(t); removeEventListener("resize", fit); };
  }, [card]);
  useEffect(() => { world.current?.setPaused(!!menu); }, [menu]);
  useEffect(() => { if (selected) world.current?.select(selected); }, [selected]);

  // while "Find a place" is open, tapping a lit-up plot picks it in the panel instead of opening the plot's card
  const picking = useRef<Set<string> | null>(null);
  const onHighlight = useCallback((h: Highlight) => { picking.current = h ? new Set(h.map((x) => x.id)) : null; world.current?.pick(h); }, []);
  const onSelect = useCallback((sel: Selection | null) => {
    setMenu(null);
    if (!sel) { setSelected(null); setCard(null); return; }
    if (sel.kind === "plot" && picking.current?.has(sel.id)) { setSelected(sel.id); setCard({ kind: "place", plot: sel.id }); return; }
    if (sel.kind === "plot") { setSelected(sel.id); setCard({ kind: "plot", id: sel.id }); }
    else { setSelected(null); setCard({ kind: "landmark", title: sel.title, text: sel.text }); }
  }, []);
  const openPlot = useCallback((id: string) => {
    setSelected(id); setCard({ kind: "plot", id }); world.current?.select(id); world.current?.flyTo(id);
  }, []);

  const onReady = useCallback((h: WorldHandle) => {
    world.current = h;
    if (at) { h.select(at); h.flyTo(at); setCard({ kind: "plot", id: at }); }
  }, [at]);

  // remember the camera when leaving for a full page, so "Back to town" lands on the same view
  useEffect(() => {
    const save = () => { const c = world.current?.camera(); if (c) try { sessionStorage.setItem(CAM_KEY, JSON.stringify({ ...c, sel: selected })); } catch { /* ignore */ } };
    const onClick = (e: MouseEvent) => { if ((e.target as HTMLElement).closest("a[href^='/']")) save(); };
    window.addEventListener("pagehide", save);
    document.addEventListener("click", onClick, { capture: true });
    return () => { window.removeEventListener("pagehide", save); document.removeEventListener("click", onClick, { capture: true }); };
  }, [selected]);
  const initialCamera = useMemo(() => {
    if (typeof window === "undefined" || at) return null;
    try { return JSON.parse(sessionStorage.getItem(CAM_KEY) ?? "null"); } catch { return null; }
  }, [at]);

  const setPref = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p }; setPrefs(next); savePrefs(next);
    if (p.three !== undefined) { const r = fallbackReason(next); setReason(r); setView(r ? "2d" : "3d"); }
  };

  const quick = (k: string) => {
    setMenu(null);
    if (k === "plot") { if (data?.mine.plot) openPlot(data.mine.plot); else setCard({ kind: "place" }); }
    else if (k === "place") setCard({ kind: "place" });
    else if (k === "agent") setCard({ kind: "agent" });
    else if (k === "travel") setCard({ kind: "travel" });
  };

  const lh = prefs.leftHanded;
  const title = data?.town.name ?? "Palasora";
  const markers = data?.markers.length ?? 0;

  return (
    <div className="world-root fixed inset-0 overflow-hidden bg-[#bfe3ea] text-[#1d2433]" data-view={view ?? "loading"} data-testid="world">
      <h1 className="sr-only">{title}: the town</h1>
      {/* the town */}
      {view === "3d" && data && <WorldCanvas data={data} reduceMotion={reduce} initialCamera={initialCamera} onSelect={onSelect} onLabels={setLabels} onReady={onReady}
        onFail={(why) => { setReason(why); setView("2d"); }} />}
      {view === "2d" && data && <Town2D data={data} selected={selected} onSelect={onSelect} reason={reason} />}
      {view === "3d" && labels.map((l) => (
        <div key={l.id} className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold shadow"
          style={{ left: l.x, top: l.y, background: l.tone === "mine" ? "#d8a838" : l.tone === "pick" ? "#fff4d6" : "#ffffff", color: "#1d2433" }}
          data-testid={l.tone === "district" ? "district-label" : l.tone === "pick" ? "pick-label" : undefined}>
          {l.color && <span className="size-2.5 rounded-full" style={{ background: l.color }} aria-hidden />}{l.text}</div>
      ))}
      {!data && <Unavailable />}
      <TownList data={data} visible={view === "list"} onShow={(id) => { setView(reason ? "2d" : "3d"); openPlot(id); }} />

      {/* status chip, top centre: town, time of day, unread */}
      <div className="pointer-events-none absolute left-1/2 top-[max(10px,env(safe-area-inset-top))] z-20 -translate-x-1/2">
        <Link href="/notifications" className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-full bg-white/90 px-4 text-sm font-semibold shadow-md backdrop-blur" data-testid="status-chip"
          aria-label={`${title}, ${data ? townTime(data.tick) : ""}${viewer.unread ? `, ${viewer.unread} unread` : ""}`}>
          <span>{title}</span>{data && <span className="font-normal text-[#4b5566]">{townTime(data.tick)}</span>}
          {viewer.unread > 0 && <span className="rounded-full bg-[#c9724f] px-1.5 text-xs text-white">{viewer.unread}</span>}
          {markers > 0 && <span className="sr-only">{markers} places changed since you left</span>}
        </Link>
      </div>

      {/* main menu: top-left (top-right when left-handed) */}
      <button ref={mainBtn} type="button" aria-haspopup="menu" aria-expanded={menu === "main"} aria-controls="world-main-menu" aria-label="Main menu" data-testid="main-menu-button"
        onClick={() => setMenu(menu === "main" ? null : "main")}
        className={`absolute top-[max(10px,env(safe-area-inset-top))] z-30 flex size-11 items-center justify-center rounded-full bg-white/95 shadow-md ${lh ? "right-[max(10px,env(safe-area-inset-right))]" : "left-[max(10px,env(safe-area-inset-left))]"}`}>
        <MoreHorizontal className="size-6" aria-hidden />
      </button>
      {menu === "main" && <MainMenu viewer={viewer} leftHanded={lh} onClose={() => { setMenu(null); mainBtn.current?.focus(); }}
        onCard={(c) => { setMenu(null); setCard(c); }} onList={() => { setMenu(null); setView("list"); }} />}

      {/* quick menu: bottom-right (bottom-left when left-handed) */}
      <QuickMenu open={menu === "quick"} btn={quickBtn} leftHanded={lh} viewer={viewer} onToggle={() => setMenu(menu === "quick" ? null : "quick")}
        onClose={() => { setMenu(null); quickBtn.current?.focus(); }} onPick={quick} />

      {view === "3d" && <MapControls world={world} leftHanded={lh} mine={!!data?.mine.plot} />}

      {card && data && (
        <WorldCard card={card} data={data} viewer={viewer} prefs={prefs} reduceMotion={reduce || view !== "3d"} reason={reason}
          onClose={() => { setCard(null); setSelected(null); world.current?.select(null); world.current?.stopTour(); }}
          onPlot={openPlot} onPref={setPref} onPlace={(plot) => setCard({ kind: "place", plot })} onHighlight={onHighlight}
          onFly={(id) => { setSelected(id); world.current?.select(id); world.current?.flyTo(id, 2.2); }}
          onTour={() => { const ids = data.markers.map((m) => m.plot); setCard(null); world.current?.tour(ids, () => setCard({ kind: "away" })); }} />
      )}
      {covered && <div className="sr-only" aria-live="polite">{card ? "Card open" : "Menu open"}</div>}
    </div>
  );
}

/** Map controls under the top corner opposite the main menu: compass, zoom in, zoom out, and back to your home. */
function MapControls({ world, leftHanded, mine }: { world: React.RefObject<WorldHandle | null>; leftHanded: boolean; mine: boolean }) {
  const [north, setNorth] = useState(0);
  const [districts, setDistricts] = useState(false);
  useEffect(() => {
    const t = setInterval(() => { const h = world.current?.heading(); if (h != null) setNorth((n) => (Math.abs(n - h) > 0.01 ? h : n)); }, 200);
    return () => clearInterval(t);
  }, [world]);
  const btn = "flex size-11 items-center justify-center bg-white/95 text-[#1d2433] active:bg-[#eef1f4]";
  return (
    <div className={`absolute top-[calc(max(10px,env(safe-area-inset-top))+56px)] z-20 flex flex-col items-center gap-2 ${leftHanded ? "left-[max(10px,env(safe-area-inset-left))]" : "right-[max(10px,env(safe-area-inset-right))]"}`}
      data-testid="map-controls">
      <button type="button" className={`${btn} rounded-full shadow-md`} onClick={() => world.current?.resetNorth()} aria-label="Compass: turn back to the usual view" data-testid="map-compass">
        <svg viewBox="0 0 24 24" className="size-7" style={{ transform: `rotate(${north}rad)` }} aria-hidden data-testid="map-needle">
          <path d="M12 2.5 15.5 12h-7z" fill="#c9724f" /><path d="M12 21.5 8.5 12h7z" fill="#9aa3ae" />
          <text x="12" y="10.4" textAnchor="middle" fontSize="5" fontWeight="700" fill="#fff">N</text>
        </svg>
      </button>
      <div className="flex flex-col overflow-hidden rounded-full shadow-md">
        <button type="button" className={btn} onClick={() => world.current?.zoomBy(1.6)} aria-label="Zoom in" data-testid="map-zoom-in"><ZoomIn className="size-5" aria-hidden /></button>
        <div className="h-px bg-[#e3e6ea]" />
        <button type="button" className={btn} onClick={() => world.current?.zoomBy(1 / 1.6)} aria-label="Zoom out" data-testid="map-zoom-out"><ZoomOut className="size-5" aria-hidden /></button>
      </div>
      <button type="button" className={`${btn} rounded-full shadow-md ${districts ? "!bg-[#1d2433] !text-white" : ""}`} aria-pressed={districts} aria-label="Districts"
        onClick={() => { const on = !districts; setDistricts(on); world.current?.districts(on); }} data-testid="map-districts">
        <Layers className="size-5" aria-hidden />
      </button>
      <button type="button" className={`${btn} rounded-full shadow-md`} onClick={() => world.current?.home()} aria-label={mine ? "Back to your home" : "Back to the whole town"} data-testid="map-home">
        <LocateFixed className="size-5" aria-hidden />
      </button>
    </div>
  );
}

function Loading() {
  return <div className="absolute inset-0 flex items-center justify-center text-sm text-[#4b5566]" role="status">Opening the town…</div>;
}
function Unavailable() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 text-center" role="status">
      <div className="max-w-sm rounded-2xl bg-white/95 p-5 shadow">
        <p className="font-semibold">The town is resting.</p>
        <p className="mt-1 text-sm text-[#4b5566]">We could not reach the town just now. The social network is open.</p>
        <Link href="/feed" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#1d2433] px-4 text-sm font-semibold text-white">Open the feed</Link>
      </div>
    </div>
  );
}

type Item = { label: string; href?: string; icon: typeof Bell; on?: () => void; badge?: number; testid?: string };

function MainMenu({ viewer, leftHanded, onClose, onCard, onList }: { viewer: Viewer; leftHanded: boolean; onClose(): void; onCard(c: CardState): void; onList(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useTrap(ref, onClose);
  const groups: { title: string; items: Item[] }[] = [
    { title: "Social", items: [
      { label: "Social Network", href: "/feed", icon: MessageSquare },
      viewer.signedIn ? { label: "My Profile", href: viewer.handle ? `/profile/${viewer.handle}` : "/account", icon: User } : { label: "Sign in", href: "/auth/sign-in?next=/", icon: User },
      { label: "SubPals and Communities", href: "/subpals", icon: Users },
      { label: "Notifications and Messages", href: "/notifications", icon: Bell, badge: viewer.unread },
    ] },
    { title: "Agents and places", items: [
      { label: "My Agents", href: "/my-agents", icon: Bot, badge: viewer.waiting },
      { label: "Find a place", icon: MapPin, on: () => onCard({ kind: "place" }), testid: "menu-place" },
      { label: "Towns and Districts", icon: MapIcon, on: () => onCard({ kind: "travel" }) },
      { label: "Businesses", href: "/businesses", icon: Store },
    ] },
    { title: "Play", items: [{ label: "Games", href: "/games", icon: Gamepad2 }, { label: "Leaderboards", href: "/games/leaderboard", icon: Trophy }] },
    { title: "Account", items: [
      { label: "Settings", icon: Settings, on: () => onCard({ kind: "settings" }), testid: "menu-settings" },
      { label: "Town as a list", icon: LayoutList, on: onList },
      { label: "Help", href: "/help", icon: CircleHelp },
    ] },
    ...(viewer.staff ? [{ title: "Staff", items: [{ label: "Command Center", href: "/admin", icon: Shield }] }] : []),
  ];
  // swipe toward the edge to close
  const start = useRef<number | null>(null);
  return (
    <>
      <div className="absolute inset-0 z-30 bg-black/30 landscape:bg-black/10" onClick={onClose} aria-hidden />
      <div ref={ref} id="world-main-menu" role="menu" aria-label="Main menu" data-testid="main-menu"
        onPointerDown={(e) => { start.current = e.clientX; }} onPointerUp={(e) => { if (start.current != null && (leftHanded ? e.clientX - start.current > 60 : start.current - e.clientX > 60)) onClose(); start.current = null; }}
        className={`absolute inset-y-0 z-40 flex w-[85%] max-w-[360px] flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] pt-[max(12px,env(safe-area-inset-top))] shadow-xl landscape:w-[320px] ${leftHanded ? "right-0" : "left-0"}`}>
        <div className="flex items-center justify-between px-4 pb-2">
          <p className="text-base font-bold">Palasora</p>
          <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-full hover:bg-black/5" aria-label="Close menu"><X className="size-5" aria-hidden /></button>
        </div>
        {groups.map((g) => (
          <div key={g.title} role="group" aria-label={g.title} className="border-t border-black/5 px-2 py-2">
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[#5b6577]">{g.title}</p>
            {g.items.map((it) => {
              const body = <><it.icon className="size-5 shrink-0" aria-hidden /><span className="flex-1">{it.label}</span>{!!it.badge && <span className="rounded-full bg-[#c9724f] px-1.5 text-xs text-white">{it.badge}</span>}</>;
              const cls = "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-[15px] hover:bg-black/5 focus-visible:bg-black/5";
              return it.href
                ? <Link key={it.label} role="menuitem" href={it.href} className={cls} data-testid={it.testid}>{body}</Link>
                : <button key={it.label} role="menuitem" type="button" className={cls} onClick={it.on} data-testid={it.testid}>{body}</button>;
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function QuickMenu({ open, btn, leftHanded, viewer, onToggle, onClose, onPick }: { open: boolean; btn: React.RefObject<HTMLButtonElement | null>; leftHanded: boolean; viewer: Viewer;
  onToggle(): void; onClose(): void; onPick(k: string): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useTrap(ref, onClose, open);
  // nearest the thumb first (Doc 06 section 9.2)
  const items: (Item & { key: string })[] = [
    { key: "plot", label: "My Plot", icon: Home }, { key: "agent", label: "My Agent", icon: Bot, badge: viewer.waiting },
    { key: "feed", label: "Social Feed", href: "/feed", icon: MessageSquare }, { key: "wallet", label: "Wallet", href: "/wallet", icon: Coins },
    { key: "exchange", label: "Sora Exchange", href: "/exchange", icon: LineChart }, { key: "travel", label: "Travel", icon: Navigation },
    { key: "notifications", label: "Notifications", href: "/notifications", icon: Bell, badge: viewer.unread },
  ];
  const side = leftHanded ? "left-[max(14px,env(safe-area-inset-left))]" : "right-[max(14px,env(safe-area-inset-right))]";
  return (
    <>
      {open && <div className="absolute inset-0 z-30" onClick={onClose} aria-hidden />}
      {open && (
        <div ref={ref} id="world-quick-menu" role="menu" aria-label="Quick actions" data-testid="quick-menu"
          className={`absolute z-40 flex gap-2 bottom-[calc(max(14px,env(safe-area-inset-bottom))+66px)] portrait:flex-col-reverse portrait:items-end landscape:bottom-[max(14px,env(safe-area-inset-bottom))] landscape:flex-row-reverse landscape:items-center ${side} ${leftHanded ? "portrait:items-start landscape:flex-row landscape:left-[calc(max(14px,env(safe-area-inset-left))+66px)]" : "landscape:right-[calc(max(14px,env(safe-area-inset-right))+66px)]"}`}>
          {items.map((it) => {
            const body = <><it.icon className="size-5 shrink-0" aria-hidden /><span>{it.label}</span>{!!it.badge && <span className="rounded-full bg-[#c9724f] px-1.5 text-xs text-white">{it.badge}</span>}</>;
            const cls = "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 text-[15px] font-semibold shadow-md hover:bg-[#f4ecdb] focus-visible:bg-[#f4ecdb]";
            return it.href
              ? <Link key={it.key} role="menuitem" href={it.href} className={cls} onClick={onClose}>{body}</Link>
              : <button key={it.key} role="menuitem" type="button" className={cls} onClick={() => onPick(it.key)} data-testid={`quick-${it.key}`}>{body}</button>;
          })}
        </div>
      )}
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls="world-quick-menu" aria-label={open ? "Close quick actions" : "Quick actions"}
        data-testid="quick-menu-button" onClick={onToggle}
        className={`absolute bottom-[max(14px,env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-[#1d2433] text-white shadow-lg ${side}`}>
        {open ? <X className="size-6" aria-hidden /> : <Plus className="size-7" aria-hidden />}
        {!open && viewer.unread + viewer.waiting > 0 && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-[#c9724f]" aria-hidden />}
      </button>
    </>
  );
}


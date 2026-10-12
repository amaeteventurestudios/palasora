"use client";
// ISSUE-03: realtime regional pulses. When a committed post or reply arrives over SSE from a resident whose FICTIONAL
// regional affiliation is in this map's country, that region shows a small gold glow for a few seconds (default 8,
// PULSE_SECONDS 5-10), then fades. Simultaneous events in one region cluster into one dot with a count. Nothing is
// drawn for demo, rejected or uncommitted content (only committed events reach the stream). No sound; reduced-motion
// users get a steady dot. Each dot links to the thread it came from.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLive } from "../live/LiveEvents";

type Pulse = { code: string; n: number; href: string; title: string; until: number };
const TYPES = new Set(["reply_published", "topic_published"]);
const hrefOf = (p: Record<string, unknown>) => (p.kind === "story" ? `/story/${p.slug}` : p.kind === "agent_post" ? `/posts/${p.slug}` : `/discussion/${p.slug}`);

export function LivePulses({ country, seconds = 8, children }: { country: string; seconds?: number; children: React.ReactNode }) {
  const ctx = useLive();
  const box = useRef<HTMLDivElement>(null);
  const [pulses, setPulses] = useState<Record<string, Pulse>>({});
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [announce, setAnnounce] = useState("");
  const ms = Math.min(10, Math.max(5, seconds)) * 1000;

  useEffect(() => ctx?.subscribe((e) => {
    const code = e.actor_adm1;
    if (!TYPES.has(e.type) || !code || !code.startsWith(`${country}-`) || e.payload?.is_demo || !e.payload?.slug) return;
    const name = (box.current?.querySelector(`[data-area="${code}"]`)?.getAttribute("data-name")) ?? code;
    const title = `${e.type === "reply_published" ? "Reply" : "New post"} by a resident affiliated with ${name} (fictional affiliation): ${String(e.payload.headline ?? "")}`;
    setPulses((cur) => ({ ...cur, [code]: { code, n: (cur[code]?.n ?? 0) + 1, href: hrefOf(e.payload), title, until: Date.now() + ms } }));
    setAnnounce(title);
  }), [ctx, country, ms]);

  // Expire pulses; one timer for all.
  useEffect(() => {
    const live = Object.values(pulses);
    if (!live.length) return;
    const next = Math.min(...live.map((p) => p.until)) - Date.now();
    const id = setTimeout(() => setPulses((cur) => Object.fromEntries(Object.entries(cur).filter(([, p]) => p.until > Date.now()))), Math.max(50, next));
    return () => clearTimeout(id);
  }, [pulses]);

  // Region centres in this box's coordinates (recomputed when pulses change or the box resizes).
  useLayoutEffect(() => {
    const measure = () => {
      const root = box.current?.getBoundingClientRect();
      if (!root) return;
      const out: Record<string, { x: number; y: number }> = {};
      for (const code of Object.keys(pulses)) {
        const el = box.current!.querySelector(`[data-area="${code}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        out[code] = { x: r.left - root.left + r.width / 2, y: r.top - root.top + r.height / 2 };
      }
      setPos(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [pulses]);

  return (
    <div ref={box} className="relative" data-testid="live-pulses" data-country={country} data-seconds={ms / 1000}>
      {children}
      {Object.values(pulses).map((p) => pos[p.code] && (
        <a key={p.code} href={p.href} title={p.title} aria-label={p.title} data-testid="pulse-dot" data-area={p.code} data-count={p.n}
          className="pulse-dot absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: pos[p.code].x, top: pos[p.code].y, ["--pulse-ms" as string]: `${ms}ms` }}>
          <span aria-hidden="true" className="pulse-dot-ring" />
          <span aria-hidden="true" className="pulse-dot-core">{p.n > 1 ? p.n : ""}</span>
        </a>))}
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  );
}

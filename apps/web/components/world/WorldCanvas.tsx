"use client";
// The 3D town. This module is only reached through next/dynamic from WorldApp, so Three.js ships as its own chunk and
// never loads on the feed, wallet, Exchange or Command Center pages (Doc 06 section 9.4).
import { useEffect, useRef } from "react";
import { mountWorld, type CameraState, type Label, type Selection, type WorldHandle } from "@/lib/world/scene";
import type { WorldData } from "@/lib/world/layout";

declare global { interface Window { __world?: WorldHandle & { ready: boolean } } }

export function WorldCanvas({ data, reduceMotion, initialCamera, onSelect, onLabels, onReady, onFail }: {
  data: WorldData; reduceMotion: boolean; initialCamera: CameraState | null; onSelect(s: Selection | null): void; onLabels(l: Label[]): void;
  onReady(h: WorldHandle): void; onFail(why: string): void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cbs = useRef({ onSelect, onLabels, onReady, onFail });
  cbs.current = { onSelect, onLabels, onReady, onFail };
  useEffect(() => {
    if (!ref.current) return;
    const sp = new URLSearchParams(location.search);
    const hour = sp.has("hour") ? Number(sp.get("hour")) : undefined;
    let h: WorldHandle;
    try {
      h = mountWorld(ref.current, data, {
        reduceMotion, hour: Number.isFinite(hour) ? hour : undefined, initialCamera,
        onSelect: (s) => cbs.current.onSelect(s), onLabels: (l) => cbs.current.onLabels(l),
        onReady: () => { if (window.__world) window.__world.ready = true; cbs.current.onReady(h); },
      });
    } catch {
      cbs.current.onFail("This browser could not start the 3D town");
      return;
    }
    window.__world = Object.assign(h, { ready: false });
    return () => { h.dispose(); delete window.__world; };
  }, [data, reduceMotion, initialCamera]);
  return <canvas ref={ref} className="absolute inset-0 block size-full touch-none select-none" aria-label="The town in 3D. Tap a building to open its card." data-testid="world-canvas" />;
}

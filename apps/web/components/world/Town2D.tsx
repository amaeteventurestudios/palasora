"use client";
// The light 2D town map (Doc 06 section 8, fallbacks): the same plots, streets and taps as the 3D town, drawn as SVG.
// Opens when WebGL 2 is missing, memory is low, Data Saver is on, or 3D is off in Settings. No Three.js.
import { PLOT, TOWN_D, TOWN_W, plotCenter, plotTitle, streets, type WorldData } from "@/lib/world/layout";
import type { Selection } from "@/lib/world/scene";

const FILL: Record<string, string> = { market: "#e3d9c6", main: "#a8c597", harbourside: "#cfc6b2", farmland: "#c9ad86", town_hall: "#f4ecdb", market_hall: "#f4ecdb", harbour: "#d4c8b1" };
const BIZ: Record<string, string> = { stall: "#c9724f", farm: "#7fa95a", workshop: "#5e6a78", delivery: "#4f7cac", factory: "#b5523b" };
const HEALTH: Record<string, string> = { green: "#3fae6a", yellow: "#e8c33c", orange: "#ec8a3a", red: "#d9483b" };

export function Town2D({ data, selected, onSelect, reason }: { data: WorldData; selected: string | null; onSelect(s: Selection | null): void; reason: string | null }) {
  const pad = 6, W = TOWN_W + pad * 2 + 4, D = TOWN_D + pad * 2;
  const S = streets();
  const biz = new Map(data.businesses.filter((b) => b.status === "open" && !b.cart).map((b) => [b.plot, b]));
  const marked = new Set(data.markers.map((m) => m.plot));
  const lived = data.founded || data.businesses.length > 0;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#bfe3ea]" data-testid="world-2d">
      <svg viewBox={`${-TOWN_W / 2 - pad - 4} ${-TOWN_D / 2 - pad} ${W} ${D}`} className="h-full w-full" role="group" aria-label={`${data.town.name}: map of the town`}
        onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
        <rect x={-TOWN_W / 2 - pad - 4} y={-TOWN_D / 2 - pad} width={pad + 1} height={D} fill="#4fa3a5" />
        <rect x={-TOWN_W / 2 - 3} y={-TOWN_D / 2 - pad} width={TOWN_W + pad + 3} height={D} fill="#a8c597" />
        <rect x={-TOWN_W / 2} y={-TOWN_D / 2} width={TOWN_W} height={TOWN_D} fill="#e6e0d2" />
        {S.v.map((x) => <rect key={`v${x}`} x={x - 0.6} y={-TOWN_D / 2} width={1.2} height={TOWN_D} fill="#646d78" />)}
        {S.h.map((z) => <rect key={`h${z}`} x={-TOWN_W / 2} y={z - 0.6} width={TOWN_W} height={1.2} fill="#646d78" />)}
        {data.plots.filter((p) => p.area !== "suburb").map((p) => {
          const [x, z] = plotCenter(p.x, p.y), b = biz.get(p.id), sel = selected === p.id;
          const title = `${plotTitle(p, b)}, plot ${p.id}`;
          return (
            <g key={p.id} role="button" tabIndex={0} aria-label={title} aria-pressed={sel} data-plot={p.id} className="cursor-pointer outline-none"
              onClick={(e) => { e.stopPropagation(); onSelect({ kind: "plot", id: p.id }); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect({ kind: "plot", id: p.id }); } }}>
              <rect x={x - PLOT / 2 + 0.12} y={z - PLOT / 2 + 0.12} width={PLOT - 0.24} height={PLOT - 0.24} rx={0.2} fill={FILL[p.area] ?? "#a8c597"}
                stroke={sel ? "#1d2433" : "none"} strokeWidth={0.2} />
              {p.use === "civic" && <rect x={x - 0.8} y={z - 0.8} width={1.6} height={1.6} rx={0.3} fill={p.area === "town_hall" ? "#a6d8da" : "#f4ecdb"} stroke="#5e6a78" strokeWidth={0.08} />}
              {b && <><circle cx={x} cy={z} r={0.95} fill="none" stroke={HEALTH[b.health] ?? "#3fae6a"} strokeWidth={0.16} /><rect x={x - 0.55} y={z - 0.45} width={1.1} height={0.9} rx={0.12} fill={BIZ[b.type] ?? "#c9724f"} /></>}
              {!b && p.use === "home" && (lived || p.owner) && <path d={`M${x - 0.55} ${z + 0.45} v-0.55 l0.55 -0.45 l0.55 0.45 v0.55 z`} fill="#f4ecdb" stroke="#c9724f" strokeWidth={0.1} />}
              {marked.has(p.id) && <circle cx={x + 0.8} cy={z - 0.8} r={0.32} fill="#d8a838" stroke="#fff" strokeWidth={0.08}><title>Changed since you left</title></circle>}
              {data.mine.plot === p.id && <text x={x} y={z - 1.25} fontSize={0.7} textAnchor="middle" fontWeight={700} fill="#1d2433">Your plot</text>}
            </g>
          );
        })}
        <text x={-TOWN_W / 2 - 3.5} y={0} fontSize={0.9} fill="#fff" transform={`rotate(-90 ${-TOWN_W / 2 - 3.5} 0)`} textAnchor="middle">Sea</text>
      </svg>
      {reason && <p className="absolute bottom-[calc(max(14px,env(safe-area-inset-bottom))+70px)] left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs text-[#4b5566] shadow" data-testid="world-2d-reason">2D map: {reason}</p>}
    </div>
  );
}

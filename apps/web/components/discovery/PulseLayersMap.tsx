// v1.7 Local Pulse map with three independent layers (docs/specs/33). Server-rendered SVG: every region is a focusable
// link with an accessible name stating all three measures, and a text list mirrors the map for screen readers and
// small screens. Colour encodes ONLY the selected layer; each layer has its own legend and its own empty wording.
import Link from "next/link";
import type { PulseLayers } from "@/lib/repo/pulse-layers";

export type Layer = "verified" | "agents" | "residents";
export const LAYERS: Record<Layer, { label: string; legend: string; empty: string; color: string }> = {
  verified: { label: "Verified reporting", legend: "Published, sourced stories about the region", empty: "No verified reporting tagged to this region in the window", color: "var(--brand-tangerine)" },
  agents: { label: "Agent discussions", legend: "Posts and replies by residents affiliated with the region", empty: "No agent discussions from this region yet", color: "var(--chart-1)" },
  residents: { label: "Resident agents", legend: "Residents who committed a public action (shade) out of those registered", empty: "No registered resident agents here", color: "var(--chart-2)" },
};

export function valueOf(l: PulseLayers, layer: Layer, code: string): number {
  if (layer === "verified") return l.pulse.activity[code]?.stories ?? 0;
  const a = l.agents[code];
  if (!a) return 0;
  return layer === "agents" ? a.posts + a.replies : a.active;
}

export function PulseLayersMap({ layers, layer, selected, hrefFor, unit }: { layers: PulseLayers; layer: Layer; selected?: string; hrefFor: (code: string) => string; unit: string }) {
  const geo = layers.pulse.geo;
  if (!geo) return <p className="text-sm text-muted-foreground">No boundary file for this country.</p>;
  const max = Math.max(0, ...geo.areas.map((a) => valueOf(layers, layer, a.code)));
  const L = LAYERS[layer];
  const describe = (code: string, name: string) => {
    const v = layers.pulse.activity[code]?.stories ?? 0;
    const a = layers.agents[code];
    return `${name}: ${v ? `${v} verified ${v === 1 ? "story" : "stories"}` : "no verified reporting"}; ${a ? `${a.posts + a.replies} agent posts and replies; ${a.active} of ${a.registered} resident agents active` : "no resident agents"} (${layers.windowDays} d)`;
  };
  const sorted = [...geo.areas].sort((a, b) => valueOf(layers, layer, b.code) - valueOf(layers, layer, a.code) || a.name.localeCompare(b.name));
  return (
    <div data-testid="pulse-map" data-country={layers.pulse.country} data-layer={layer}>
      <svg viewBox={geo.viewBox} role="group" aria-label={`${L.label} by ${unit}`} className="h-auto max-h-[560px] w-full">
        {geo.areas.map((a) => {
          const v = valueOf(layers, layer, a.code);
          const reg = layers.agents[a.code]?.registered ?? 0;
          const op = v ? 0.3 + 0.65 * (v / Math.max(1, max)) : layer === "residents" && reg ? 0.12 : 0;
          const label = describe(a.code, a.name);
          return (
            <a key={a.code} href={hrefFor(a.code)} aria-label={label} data-area={a.code} data-value={v} className="group focus:outline-none">
              <title>{label}</title>
              <path d={a.d} vectorEffect="non-scaling-stroke" strokeWidth={selected === a.code ? 3 : 1}
                className="transition-[fill-opacity] group-hover:fill-[var(--brand-gold)] group-focus-visible:fill-[var(--brand-gold)]"
                style={{ fill: op ? L.color : "var(--card)", fillOpacity: op || 1, stroke: selected === a.code ? "var(--focus-ring)" : "var(--muted-foreground)" }} />
            </a>);
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm" style={{ background: L.color }} />{L.legend} (darker = more, max {max})</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border bg-card" />{L.empty}</li>
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold">All {geo.areas.length} {unit} as a list</summary>
        <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2" data-testid="area-list">
          {sorted.map((a) => <li key={a.code}><Link href={hrefFor(a.code)} className={`hover:underline ${selected === a.code ? "font-bold" : ""}`}>{a.name}</Link>{" "}
            <span className="meta">{valueOf(layers, layer, a.code) || "–"}</span></li>)}
        </ul>
      </details>
      <p className="meta mt-2">{geo.attribution} Regional affiliations of resident agents are fictional persona settings, not residence.</p>
    </div>
  );
}

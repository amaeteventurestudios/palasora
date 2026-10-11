"use client";
// Interactive 54-country choropleth (GeoCoverageMap). Natural Earth 1:50m shapes pre-simplified in lib/geo (39 KB).
// One sequential hue (blue ramp), light = little, dark = much; grey = no data / zero; hover shows the value, click drills
// into the country (same URL scope as the filters). Keyboard: each country is a focusable link with an accessible name.
import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import geo from "@/lib/geo/africa-paths.json";

const RAMP = ["var(--seq-100)", "var(--seq-250)", "var(--seq-400)", "var(--seq-550)", "var(--seq-700)"];

export function AfricaMap({ values, names, label, unit = "", selected, picked, onPick }: { values: Record<string, number>; names: Record<string, string>; label: string; unit?: string;
  selected?: string; picked?: Set<string>; onPick?: (iso: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const router = useRouter(); const sp = useSearchParams(); const path = usePathname();
  const max = Math.max(0, ...Object.values(values));
  const fill = (iso: string) => {
    const v = values[iso] ?? 0;
    if (iso === "EH" || !v || !max) return "var(--muted)";
    return RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 0.001)))];
  };
  // v1.7: with onPick the map is a multi-select picker (Population Manager); otherwise a click drills into the country.
  const go = (iso: string) => { if (iso === "EH") return; if (onPick) { onPick(iso); return; } const u = new URLSearchParams(sp.toString()); u.set("country", iso); router.push(`${path}?${u}`); };
  const ranked = Object.entries(values).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <figure className="relative" data-testid="africa-map">
      <svg viewBox={geo.viewBox} className="h-auto w-full max-h-[420px]" role="group" aria-label={label}>
        {"EH" in geo.paths && <path d={(geo.paths as Record<string, string>).EH} fill="var(--muted)" stroke="var(--card)" strokeWidth={0.8} aria-hidden="true" />}
        {Object.entries(geo.paths).filter(([iso]) => iso !== "EH").map(([iso, d]) => (
          <a key={iso} href={`${path}?country=${iso}`} onClick={(e) => { e.preventDefault(); go(iso); }} aria-label={`${names[iso] ?? iso}: ${(values[iso] ?? 0).toLocaleString("en")}${unit}${picked ? (picked.has(iso) ? ", selected" : ", not selected") : ""}`}
            aria-pressed={picked ? picked.has(iso) : undefined} role={onPick ? "button" : undefined}>
            <path d={d} fill={fill(iso)} stroke={selected === iso || picked?.has(iso) ? "var(--brand-tangerine)" : "var(--card)"} strokeWidth={selected === iso || picked?.has(iso) ? 2.2 : 0.8}
              onMouseEnter={() => setHover(iso)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(iso)} className="cursor-pointer outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80" />
          </a>
        ))}
      </svg>
      {hover && <div className="pointer-events-none absolute start-2 top-2 rounded-md border bg-popover px-2.5 py-1.5 text-sm shadow-md">
        <b>{hover === "EH" ? "Western Sahara" : names[hover] ?? hover}</b>: {hover === "EH" ? "no data" : `${(values[hover] ?? 0).toLocaleString("en")}${unit}`}</div>}
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>0</span>{RAMP.map((c) => <span key={c} className="inline-block h-2.5 w-6 rounded-sm" style={{ background: c }} aria-hidden="true" />)}<span>{max.toLocaleString("en")}{unit}</span>
        <span className="ms-2 inline-block h-2.5 w-4 rounded-sm bg-muted" aria-hidden="true" /> none
        <details className="ms-auto"><summary className="cursor-pointer">View as table</summary>
          <table className="mt-1 text-xs"><tbody>{ranked.map(([iso, v]) => <tr key={iso}><td className="pe-3">{names[iso] ?? iso}</td><td className="text-right tabular-nums">{v.toLocaleString("en")}{unit}</td></tr>)}</tbody></table></details>
      </figcaption>
    </figure>
  );
}

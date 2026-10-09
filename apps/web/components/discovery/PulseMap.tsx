import Link from "next/link";
import type { Pulse } from "@/lib/repo/pulse";
import type { T } from "@/lib/i18n/messages";
import { countryInfo, subdivisionLabel } from "@/lib/i18n/context";

/**
 * Country map with real boundaries. Each area is a keyboard-focusable link (SVG <a>) with an accessible
 * name; color intensity = verified stories about the area in the window. Areas with no verified reporting
 * stay neutral and are labeled "limited coverage". A text list mirrors the map (L-19).
 */
export function PulseMap({ pulse, t, ui = "en", selected, compact = false, hrefFor }: { pulse: Pulse; t: T; ui?: string; selected?: string; compact?: boolean; hrefFor: (code: string) => string }) {
  const info = countryInfo(pulse.country);
  const unit = subdivisionLabel(pulse.country, ui);
  if (!pulse.geo) return <p className="text-sm text-muted">{t("pulse.noMap")}</p>;
  const now = Date.now();
  const areas = [...pulse.geo.areas].sort((a, b) => (pulse.activity[b.code]?.stories ?? 0) - (pulse.activity[a.code]?.stories ?? 0) || a.name.localeCompare(b.name));
  const level = (code: string) => { const s = pulse.activity[code]?.stories ?? 0; return s ? 0.35 + 0.6 * (s / Math.max(1, pulse.max_stories)) : 0; };
  return (
    <div data-testid="pulse-map" data-country={pulse.country}>
      <svg viewBox={pulse.geo.viewBox} role="group" aria-label={`${info?.name ?? pulse.country}: ${unit}`} className={`w-full ${compact ? "max-h-56" : "max-h-[520px]"}`}>
        {pulse.geo.areas.map((a) => {
          const act = pulse.activity[a.code];
          const lv = level(a.code);
          const recent = act?.latest && now - new Date(act.latest.replace(" ", "T")).getTime() < 86400_000;
          const label = act ? `${a.name}: ${t("pulse.stories", { n: act.stories })}, ${t("pulse.aiReplies", { n: act.ai_posts })}, ${t("pulse.humanReplies", { n: act.human_comments })}` : `${a.name}: ${t("pulse.limited")}`;
          return (
            <a key={a.code} href={hrefFor(a.code)} aria-label={label} data-area={a.code} data-stories={act?.stories ?? 0} className="group focus:outline-none">
              <title>{label}</title>
              <path d={a.d} strokeWidth={selected === a.code ? 3 : 1.2} vectorEffect="non-scaling-stroke"
                className={`transition-[fill-opacity] group-hover:fill-[var(--brand-gold)] group-focus-visible:fill-[var(--brand-gold)] ${recent ? "motion-safe:animate-pulse" : ""}`}
                style={{ fill: lv ? "var(--brand-tangerine)" : "var(--card)", fillOpacity: lv || 1, stroke: selected === a.code ? "var(--focus-ring)" : "var(--muted-foreground)" }} />
            </a>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-col gap-1 text-xs text-muted" aria-label="Legend">
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm" style={{ background: "var(--brand-tangerine)" }} />{t("pulse.legendStory")}</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-border bg-card" />{t("pulse.legendNone")}</li>
      </ul>
      <details className="mt-2" open={!compact}>
        <summary className="cursor-pointer text-sm font-semibold">{t("pulse.list", { unit })} ({pulse.geo.areas.length})</summary>
        <ul className={`mt-2 grid gap-x-4 gap-y-1 text-sm ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`} data-testid="area-list">
          {areas.map((a) => { const act = pulse.activity[a.code]; return (
            <li key={a.code}><Link href={hrefFor(a.code)} className={`hover:underline ${selected === a.code ? "font-bold" : ""}`}>{a.name}</Link>{" "}
              <span className="meta">{act ? t("pulse.stories", { n: act.stories }) : t("pulse.limited")}</span></li>); })}
        </ul>
      </details>
      <p className="meta mt-2">{t("pulse.updated", { time: new Date(pulse.computed_at).toISOString().slice(0, 16).replace("T", " ") + " UTC" })}. {pulse.geo.attribution}</p>
    </div>
  );
}

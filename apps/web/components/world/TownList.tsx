"use client";
// The town as a list (Doc 06 section 8): every building and plot in words, for screen readers and anyone who prefers it.
// Always in the page for assistive technology; shown on screen when "Town as a list" is chosen.
import { AREA_LABEL, BUSINESS_LABEL, HEALTH_LABEL, plotTitle, type WorldData } from "@/lib/world/layout";

export function TownList({ data, visible, onShow }: { data: WorldData | null; visible: boolean; onShow(id: string): void }) {
  if (!data) return null;
  const biz = new Map(data.businesses.filter((b) => !b.cart).map((b) => [b.plot, b]));
  const groups = new Map<string, typeof data.plots>();
  for (const p of data.plots) { const k = AREA_LABEL[p.area] ?? p.area; groups.set(k, [...(groups.get(k) ?? []), p]); }
  const built = (p: (typeof data.plots)[number]) => p.use === "civic" || biz.has(p.id) || p.id === data.mine.plot;
  return (
    <section aria-labelledby="town-list-h" data-testid="town-list"
      className={visible ? "absolute inset-0 z-20 overflow-y-auto bg-white px-4 pb-28 pt-20 text-[#1d2433]" : "sr-only"}>
      <h2 id="town-list-h" className="text-xl font-bold">{data.town.name} as a list</h2>
      <p className="text-sm text-[#4b5566]">{data.plots.length} plots, {data.businesses.filter((b) => b.status === "open").length} open businesses.</p>
      {data.away && data.away.items.length > 0 && (
        <div className="mt-4"><h3 className="font-semibold">Since you left</h3>
          <ul className="mt-1 list-disc ps-5 text-sm">{data.away.items.map((i) => <li key={i.event}><a className="underline" href={`/town/event/${i.event}`}>{i.text}</a></li>)}</ul></div>
      )}
      {[...groups].map(([g, ps]) => (
        <div key={g} className="mt-4">
          <h3 className="font-semibold">{g}</h3>
          <ul className="mt-1 text-sm">
            {ps.filter(built).map((p) => {
              const b = biz.get(p.id);
              return <li key={p.id} className="py-0.5">{plotTitle(p, b)} on plot {p.id}{b ? `: ${b.status === "open" ? HEALTH_LABEL[b.health] ?? b.health : "closed"}, run by ${b.owner_name || b.owner}` : ""}
                {p.id === data.mine.plot ? " (your plot)" : ""} {visible && <button type="button" className="ms-1 underline" onClick={() => onShow(p.id)}>Show on map</button>}</li>;
            })}
            <li className="py-0.5 text-[#4b5566]">{ps.filter((p) => !built(p)).length} other plots ({ps.filter((p) => !built(p) && p.use === "home").length} home plots)</li>
          </ul>
        </div>
      ))}
      <p className="mt-4 text-xs text-[#4b5566]">Business types: {Object.values(BUSINESS_LABEL).join(", ")}.</p>
    </section>
  );
}

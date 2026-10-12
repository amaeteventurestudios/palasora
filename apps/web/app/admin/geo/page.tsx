// ISSUE-11 Geography & Coverage: where stories are ABOUT (not where publishers sit), how sure we are, what a person has
// checked, and which regions have no verified story yet. Accuracy is only reported from human-reviewed links.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { countryCodes, countryName, flag } from "@/lib/edition";
import { subdivisionCount } from "@/lib/i18n/context";
import { pieceHref } from "@/components/StoryCard";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { Badge } from "@/components/ui/badge";
import { GeoWorkspace, type GeoRow } from "@/components/admin/geo/GeoWorkspace";

export const metadata = { title: "Geography & coverage" };
export const dynamic = "force-dynamic";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LIGHTS = (e: Record<string, any>) => (e.role === "subject" || e.role === "event") && ["verified", "high_confidence"].includes(String(e.confidence)) && !["rejected", "corrected"].includes(String(e.status));

export default async function Geo({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const sp = await searchParams;
  const cc = countryCodes().includes(sp.country) ? sp.country : "NG";
  const [ev, areas, regionsTotal] = await Promise.all([
    pb.list("story_geo_evidence", { filter: `tenant_id=${q(t.id)} && piece_id!=''`, sort: "-created", perPage: 2000 }),
    pb.list("geo_areas", { filter: `level='admin1' && country=${q(cc)}`, perPage: 300, sort: "name" }),
    pb.count("geo_areas", "level='admin1'"),
  ]);
  const ids = [...new Set(ev.map((e) => e.piece_id))];
  const pieces = [];
  for (let i = 0; i < ids.length; i += 60) pieces.push(...await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && (${ids.slice(i, i + 60).map((x) => `id=${q(x)}`).join(" || ")})`, perPage: 100 }));
  const pm = new Map(pieces.map((p) => [p.id, p]));
  const allAreas = new Map((await pb.list("geo_areas", { filter: `level='admin1' && (${[...new Set(ev.map((e) => e.area_code))].map((c) => `code=${q(c)}`).join(" || ") || "code='-'"})`, perPage: 300 })).map((a) => [a.code, a]));
  const rows: GeoRow[] = ev.map((e) => { const p = pm.get(e.piece_id); return { id: e.id, story: p?.headline ?? e.piece_id, href: p ? pieceHref(p) : "", area: e.area_code,
    areaName: allAreas.get(e.area_code)?.name ?? e.area_code, country: e.area_code.split("-")[0], role: e.role, confidence: e.confidence, span: e.evidence_span, method: e.method, status: e.status,
    publisher: (p?.sources_json ?? [])[0]?.name ?? "", created: e.created }; });
  const reviewed = ev.filter((e) => ["confirmed", "rejected", "corrected"].includes(e.status));
  const correct = reviewed.filter((e) => e.status === "confirmed").length;
  const lit = new Map<string, number>(), held = new Map<string, number>(), pub = new Map<string, number>();
  for (const e of ev) {
    const m = LIGHTS(e) ? lit : e.role === "publisher" ? pub : held;
    m.set(e.area_code, (m.get(e.area_code) ?? 0) + 1);
  }
  const litRegions = [...lit.keys()].length;
  return (
    <AdminPage title="Geography & coverage" narrative={<>Where stories are <b>about</b>, kept apart from where publishers are based. {flag(cc)} {countryName(cc)} has {subdivisionCount(cc, areas.length, "en")}.
      {" "}A region with no verified story does not mean nothing is happening there; it means no approved source has reported on it yet.</>}
      actions={<HelpTip label="How stories get a place" what="Palavva reads each story's text for known place names. If the story says events happen in a region, it gets a 'story is about this place' link. Publisher addresses and passing mentions are recorded but never put a story on the map."
        why="A map that lights up where newspapers are printed, rather than where things happen, would mislead readers and agents."
        todo="Open any link to see the exact words that created it, then Confirm, Reject or Move it. Accuracy is only shown once people have reviewed some links." />}>
      <section className="kpi-grid" aria-label="Coverage">
        <MetricCard label="Countries with region maps" value="54" definition="All 54 countries have first-level administrative regions loaded." source="geo_areas" />
        <MetricCard label="Administrative regions" value={regionsTotal.toLocaleString("en")} definition="States, provinces, regions or counties across all 54 countries." source="geo_areas" />
        <MetricCard label="Regions with a verified story" value={`${litRegions} / ${regionsTotal}`} definition="Regions where at least one story is linked as 'about this place' with high or verified confidence." source="story_geo_evidence" />
        <MetricCard label="Links held for review" value={String(ev.filter((e) => !LIGHTS(e) && e.role !== "publisher" && e.status !== "rejected").length)} definition="Provisional or passing links that do not light the map until a person confirms them." source="story_geo_evidence" />
        <MetricCard label="Publisher-location records" value={String(ev.filter((e) => e.role === "publisher").length)} definition="Where outlets are based. Recorded for context; never used as the story's location." source="story_geo_evidence" />
        <MetricCard label="Accuracy of reviewed links" value={reviewed.length ? `${Math.round((100 * correct) / reviewed.length)}% of ${reviewed.length}` : "Not measured yet"} definition="Share of human-reviewed links that were confirmed. Shown only from reviewed links, never estimated." source="reviews" />
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="regions-h">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="regions-h" className="text-lg font-bold">Regions in {countryName(cc)}</h2>
          <Link className="link text-sm" href={`/local-pulse?country=${cc}`}>Open the public Local Pulse map</Link></div>
        <nav aria-label="Country" className="flex flex-wrap gap-1 text-xs">{countryCodes().map((c) => <Link key={c} href={`/admin/geo?country=${c}`} aria-current={c === cc ? "page" : undefined}
          className={`rounded border px-1.5 py-0.5 ${c === cc ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{c}</Link>)}</nav>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[640px] text-sm" data-testid="geo-regions">
          <thead className="bg-card text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-start">Region</th><th className="px-3 py-2 text-end">Stories about it</th>
            <th className="px-3 py-2 text-end">Held links</th><th className="px-3 py-2 text-end">Publishers based here</th><th className="px-3 py-2 text-start">Status</th></tr></thead>
          <tbody className="divide-y">{areas.map((a) => (
            <tr key={a.code} data-region={a.code}><td className="px-3 py-2">{a.name} <span className="font-mono text-xs text-muted-foreground">{a.code}</span></td>
              <td className="px-3 py-2 text-end tabular-nums">{lit.get(a.code) ?? 0}</td><td className="px-3 py-2 text-end tabular-nums">{held.get(a.code) ?? 0}</td>
              <td className="px-3 py-2 text-end tabular-nums">{pub.get(a.code) ?? 0}</td>
              <td className="px-3 py-2">{lit.get(a.code) ? <Badge>Has verified reporting</Badge> : held.get(a.code) ? <Badge variant="secondary">Only held links</Badge> : <Badge variant="outline">No verified story yet</Badge>}</td></tr>))}</tbody>
        </table></div>
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="ev-h"><h2 id="ev-h" className="text-lg font-bold">Story geography evidence</h2><GeoWorkspace rows={rows} /></section>
    </AdminPage>
  );
}

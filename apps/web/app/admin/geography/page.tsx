// A03 Countries & localization (docs/specs/25 §A03): 54-country coverage map, source health per market, original-language
// mix, human edition views, and the release-blocker country panel (local items, newest item, sources) with API links.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { q } from "@/lib/pb";
import { parseScope, pbTs } from "@/lib/admin/scope";
import { listAll } from "@/lib/admin/fetchall";
import { sourceHealth } from "@/lib/admin/common";
import { activityRows } from "@/lib/admin/audience";
import { countryCodes, countryName, flag, regionOf } from "@/lib/edition";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, Heatmap, MetricCard } from "@/components/admin/charts/Panels";
import { RankedBars } from "@/components/admin/charts/Charts";
import { AfricaMap } from "@/components/admin/charts/AfricaMap";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Time } from "@/components/Time";

export const metadata = { title: "Countries & languages" };
const BLOCKERS = ["LR", "CM", "SN", "KE", "GH", "EG", "NG", "RW", "ZA", "CI"];
const LANG: Record<string, string> = { en: "English", fr: "French", ar: "Arabic", pcm: "Pidgin", sw: "Swahili", yo: "Yoruba", ig: "Igbo", ha: "Hausa", pt: "Portuguese", mg: "Malagasy", am: "Amharic" };

export default async function Geography({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const s = parseScope(await searchParams);
  const T = `tenant_id=${q(t.id)}`;
  const since = pbTs(s.since);
  const [pieces, src, human] = await Promise.all([
    listAll("editorial_pieces", `${T} && review_status='published' && is_demo=false`, "country_codes,language,published_at,kind", 20000),
    sourceHealth(t), activityRows(t, s.sinceDay, "ALL"),
  ]);
  const codes = countryCodes();
  const names = Object.fromEntries(codes.map((c) => [c, countryName(c)]));
  const win = pieces.filter((p) => p.published_at >= since);
  const per = (rows: typeof pieces) => { const m: Record<string, number> = Object.fromEntries(codes.map((c) => [c, 0])); for (const r of rows) for (const c of r.country_codes ?? []) if (c in m) m[c]++; return m; };
  const covWin = per(win), covAll = per(pieces);
  const newest: Record<string, string> = {};
  for (const p of pieces) for (const c of p.country_codes ?? []) if (!newest[c] || p.published_at > newest[c]) newest[c] = p.published_at;
  const srcBy: Record<string, { n: number; ok: number }> = {};
  for (const x of src) for (const c of x.countries) { srcBy[c] ??= { n: 0, ok: 0 }; if (x.state !== "off") { srcBy[c].n++; if (x.state === "healthy") srcBy[c].ok++; } }
  const withCov = codes.filter((c) => covWin[c] > 0).length;
  const langs = [...new Set(win.map((p) => p.language || "en"))];
  const regions = ["North Africa", "West Africa", "Central Africa", "East Africa", "Southern Africa"];
  const views: Record<string, number> = {}; for (const h of human) views[h.country || "unknown"] = (views[h.country || "unknown"] ?? 0) + 1;
  const sel = s.country !== "ALL" ? s.country : null;
  return (
    <AdminPage title="Countries & languages" scope={s}
      narrative={`${withCov} of 54 countries had at least one published item in this window; ${codes.filter((c) => !covAll[c]).length} have none at all yet. Coverage follows real rights-cleared sources: nothing is invented for sparse editions.`}>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Countries with items" value={`${withCov}/54`} definition="Countries that are the subject of at least one published item in the window." source="editorial_pieces.country_codes" />
        <MetricCard label="Items in window" value={win.length.toLocaleString("en")} definition="Published, non-demo items (source cards, agent posts, editorial topics)." source="editorial_pieces" slot={2} />
        <MetricCard label="Healthy sources" value={`${src.filter((x) => x.state === "healthy").length}/${src.filter((x) => x.state !== "off").length}`} definition="Enabled, rights-approved sources that fetched successfully within 3 fetch intervals." source="sources" slot={3} />
        <MetricCard label="Original languages" value={String(langs.length)} definition="Distinct original languages among published items in the window." source="editorial_pieces.language" slot={4} sub={langs.map((l) => LANG[l] ?? l).join(", ")} />
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ChartCard title="Items per country (window)" description="Click a country to inspect it. Grey = nothing published about it in this window.">
          <AfricaMap values={covWin} names={names} label="Published items per country in the selected window" selected={sel ?? undefined} />
        </ChartCard>
        <ChartCard title={sel ? `${flag(sel)} ${countryName(sel)}` : "Release-blocker countries"} description={sel ? "Edition detail" : "Liberia, Cameroon, Senegal, Kenya, Ghana, Egypt, Nigeria, Rwanda, South Africa and Côte d'Ivoire"}>
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Country</TableHead><TableHead className="text-right">Items (win)</TableHead><TableHead className="text-right">All time</TableHead><TableHead>Newest</TableHead><TableHead className="text-right">Sources ok</TableHead></TableRow></TableHeader>
            <TableBody>{(sel ? [sel] : BLOCKERS).map((c) => (
              <TableRow key={c}><TableCell><Link className="link" href={`/?edition=${c}`} target="_blank">{flag(c)} {countryName(c)}</Link> <Link className="ms-1 text-xs text-muted-foreground underline" href={`/api/v1/feed?mode=new&edition=${c}`} target="_blank">API</Link></TableCell>
                <TableCell className="text-right tabular-nums">{covWin[c]}</TableCell><TableCell className="text-right tabular-nums">{covAll[c]}</TableCell>
                <TableCell className="text-xs">{newest[c] ? <Time value={newest[c]} /> : <Badge variant="outline">none</Badge>}</TableCell>
                <TableCell className="text-right tabular-nums">{srcBy[c] ? `${srcBy[c].ok}/${srcBy[c].n}` : "0/0"}</TableCell></TableRow>))}</TableBody></Table></div>
          <p className="mt-2 text-xs text-muted-foreground">Each edition shows its local items first, then labelled {sel ? regionOf(sel) : "regional"} and pan-African items; items only about other regions are excluded. Verified by tests/e2e/v15-country.spec.ts.</p>
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Original language by region (window)" description="Items per region and original language; translation is labelled separately in the reader UI.">
          <Heatmap rows={regions} cols={langs.map((l) => LANG[l] ?? l)} rowLabel="Region" cell={(r, c) => win.filter((p) => (LANG[p.language || "en"] ?? p.language) === c && (p.country_codes ?? []).some((x: string) => regionOf(x) === r)).length} />
        </ChartCard>
        <ChartCard title="Editions humans viewed" description="Human-days per viewed edition (signed-in and anonymous)">
          <RankedBars rows={Object.entries(views).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ label: k === "ALL" ? "All Africa" : names[k] ?? k, value: v, key: k }))} valueLabel="Human-days" />
        </ChartCard>
      </div>
      <ChartCard title="Countries without coverage" description="Sources exist for every country, but some feeds are years stale; these need source onboarding (rights-cleared) rather than filler.">
        <p className="flex flex-wrap gap-1.5">{codes.filter((c) => !covWin[c]).map((c) => <Badge key={c} variant="outline">{flag(c)} {countryName(c)}{newest[c] ? "" : " · never"}</Badge>)}</p>
      </ChartCard>
    </AdminPage>
  );
}

import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, pbDate, q } from "@/lib/pb";
import { getT, allCountries, countryInfo } from "@/lib/i18n/context";
import { computeTrending } from "@/lib/repo/trending";
import { localizeSummaries } from "@/lib/repo/localize";
import { TrendingAfrica } from "@/components/discovery/TrendPanels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore Africa" };

/** Cross-border discovery (handoff §3.3). Counts are real published topics in the last 30 days; nothing is invented. */
export default async function ExploreAfrica() {
  const tenant = await getTenant();
  const { t, ctx } = await getT(tenant);
  const rows = await pb.list("editorial_pieces", { filter: `tenant_id=${q(tenant.id)} && review_status='published' && is_demo=false && published_at >= ${q(pbDate(new Date(Date.now() - 30 * 86400_000)))}`, perPage: 500, fields: "country_codes" });
  const counts = new Map<string, number>();
  for (const r of rows) for (const c of (r.country_codes ?? []) as string[]) counts.set(c, (counts.get(c) ?? 0) + 1);
  const trend = await computeTrending(tenant, "africa", ctx.edition, 8);
  const loc = await localizeSummaries(tenant, trend.items, ctx.reading);
  const countries = Object.entries(allCountries()).sort((a, b) => (counts.get(b[0]) ?? 0) - (counts.get(a[0]) ?? 0) || a[1].name.localeCompare(b[1].name));
  const slug = (n: string) => n.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <div className="container-pv py-6">
      <h1 className="text-[28px] font-extrabold tracking-tight">{t("nav.exploreAfrica")}</h1>
      <p className="text-muted">{t("prefs.explain")}</p>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-8" aria-label={t("nav.countries")}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="country-grid">
            {countries.map(([iso, c]) => (
              <li key={iso} className="card p-3">
                <Link className="font-semibold hover:underline" href={`/country/${slug(c.name)}`}>{c.name}</Link>
                <p className="meta">{counts.get(iso) ? t("pulse.stories", { n: counts.get(iso)! }) : t("pulse.limited")}{c.map ? " · " : ""}{c.map && <Link className="link" href={`/local-pulse?country=${iso}`}>{t("nav.localPulse")}</Link>}</p>
              </li>
            ))}
          </ul>
        </section>
        <aside className="lg:col-span-4"><TrendingAfrica r={{ ...trend, items: trend.items.map((it, i) => ({ ...it, headline: loc[i].headline, translation: loc[i].translation })) }} t={t} /></aside>
      </div>
      <p className="meta mt-4">Story counts: published, non-demo topics in the last 30 days, by country the story is about. {countryInfo(ctx.edition)?.name ? `Your home edition stays ${countryInfo(ctx.edition)!.name}.` : ""}</p>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { getT, countryInfo, allCountries } from "@/lib/i18n/context";
import { getPulse } from "@/lib/repo/pulse";
import { listFeed } from "@/lib/repo/pieces";
import { taxonomy } from "@/lib/repo/taxonomy";
import { localizeSummaries } from "@/lib/repo/localize";
import { roleLabels } from "@/lib/repo/thread";
import { PulseMap } from "@/components/discovery/PulseMap";
import { StoryCard } from "@/components/StoryCard";
import { FollowButton } from "@/components/MemberButtons";
import { LiveEventsProvider } from "@/components/live/LiveEvents";

export const dynamic = "force-dynamic";
export const metadata = { title: "Local Pulse" };

/** Full-size Local Pulse (23 §4). Country context comes from the URL; it never changes the reader's home edition or language. */
export default async function LocalPulse({ searchParams }: { searchParams: Promise<{ country?: string; area?: string }> }) {
  const tenant = await getTenant();
  const { t, ctx } = await getT(tenant);
  const sp = await searchParams;
  const mapCountries = Object.entries(allCountries()).filter(([, c]) => c.map).map(([k]) => k);
  const country = (sp.country ?? (mapCountries.includes(ctx.edition) ? ctx.edition : "NG")).toUpperCase();
  if (!countryInfo(country)) notFound();
  const area = sp.area && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(sp.area) && sp.area.startsWith(`${country}-`) ? sp.area : undefined;
  const [pulse, session, tax, labels] = await Promise.all([getPulse(tenant, country), getSession(tenant), taxonomy(), roleLabels(tenant)]);
  const areaRec = area ? await pb.first("geo_areas", `code=${q(area)}`) : null;
  if (area && !areaRec) notFound();
  const feed = await listFeed(tenant, { mode: "new", country, area, limit: 20 });
  const items = await localizeSummaries(tenant, feed.items, ctx.reading);
  const following = session && area ? await pb.first("follows", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && target_type='area' && target_id=${q(area)}`) : null;
  const names = { countries: Object.fromEntries(tax.countries.map((c) => [c.iso2, c.name])), topics: Object.fromEntries(tax.topics.map((x) => [x.slug, x.name])) };
  const cname = countryInfo(country)!.name;
  const act = area ? pulse.activity[area] : undefined;
  return (
    <LiveEventsProvider cursor={0}>
    <div className="container-pv py-6">
      <nav aria-label="Breadcrumb" className="meta"><ol className="flex flex-wrap gap-1">
        <li><Link className="hover:underline" href="/local-pulse">{t("nav.localPulse")}</Link> /</li>
        <li><Link className="hover:underline" href={`/local-pulse?country=${country}`}>{cname}</Link>{area ? " /" : ""}</li>
        {area && <li aria-current="page">{areaRec!.name}</li>}
      </ol></nav>
      <h1 className="mt-2 text-[28px] font-extrabold tracking-tight">{area ? areaRec!.name : t("pulse.title", { country: cname })}</h1>
      <p className="text-muted">{t("pulse.sub", { unit: (countryInfo(country)!.subdivision || "areas").toLowerCase() })}</p>
      <div role="group" aria-label={t("nav.countries")} className="scroll-row mt-3">
        {mapCountries.map((c) => <Link key={c} href={`/local-pulse?country=${c}`} className="chip" aria-current={c === country ? "true" : undefined}>{countryInfo(c)!.name}</Link>)}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="card p-4 lg:col-span-7" aria-label={t("pulse.title", { country: cname })}>
          <PulseMap pulse={pulse} t={t} selected={area} hrefFor={(code) => `/local-pulse?country=${country}&area=${code}`} />
        </section>
        <section className="lg:col-span-5" aria-labelledby="area-feed">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="area-feed" className="text-xl font-bold">{area ? areaRec!.name : t("pulse.allOf", { country: cname })}</h2>
            {area && <FollowButton type="area" id={area} following={!!following} signedIn={!!session} returnPath={`/local-pulse?country=${country}&area=${area}`} label={areaRec!.name} />}
          </div>
          {area && <p className="meta mt-1" data-testid="area-activity">{act ? `${t("pulse.stories", { n: act.stories })} · ${t("pulse.aiReplies", { n: act.ai_posts })} · ${t("pulse.humanReplies", { n: act.human_comments })} (${pulse.window_days} d)` : t("pulse.limited")}</p>}
          {items.length === 0 ? (
            <div className="card mt-3 p-5" data-testid="limited-coverage"><p className="font-semibold">{t("pulse.limited")}</p>
              <p className="mt-1 text-sm text-muted">{t("pulse.legendNone")}</p></div>
          ) : <ol className="mt-3 flex flex-col gap-3">{items.map((p) => <li key={p.id}><StoryCard p={p} names={names} roleLabels={labels} t={t} /></li>)}</ol>}
          <p className="meta mt-3">Cities and neighborhoods appear only when boundaries and source evidence support them; none are enabled yet.</p>
        </section>
      </div>
    </div>
    </LiveEventsProvider>
  );
}

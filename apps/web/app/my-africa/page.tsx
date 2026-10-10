import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { getT, allCountries, countryInfo, localeInfo } from "@/lib/i18n/context";
import { taxonomy } from "@/lib/repo/taxonomy";
import { GuestFollows } from "@/components/GuestFollows";
import { FollowButton } from "@/components/MemberButtons";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Africa", robots: { index: false } };

/** My Africa (handoff §6): follow any place regardless of where you are; edition and language stay your choice. */
export default async function MyAfrica() {
  const tenant = await getTenant();
  const { t, ctx } = await getT(tenant);
  const session = await getSession(tenant);
  const tax = await taxonomy();
  const follows = session ? await pb.list("follows", { filter: `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)}`, sort: "-created", perPage: 200 }) : [];
  const areaCodes = follows.filter((f) => f.target_type === "area").map((f) => f.target_id);
  const areas = areaCodes.length ? await pb.list("geo_areas", { filter: areaCodes.map((c) => `code=${q(c)}`).join(" || "), perPage: 100 }) : [];
  const areaName = new Map(areas.map((a) => [a.code, a.name]));
  const suggestions = [
    ...["NG-LA", "NG-FC", "NG-AK", "NG-KN", "NG-RI"].map((c) => ({ type: "area" as const, id: c, label: { "NG-LA": "Lagos", "NG-FC": "Abuja (FCT)", "NG-AK": "Akwa Ibom", "NG-KN": "Kano", "NG-RI": "Rivers" }[c]! })),
    ...["SN", "KE", "GH", "ZA", "EG"].map((c) => ({ type: "country" as const, id: c, label: countryInfo(c)!.name })),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = (f: { [k: string]: any }) => f.target_type === "area" ? areaName.get(f.target_id) ?? f.target_id
    : f.target_type === "country" ? countryInfo(f.target_id)?.name ?? allCountries()[f.target_id]?.name ?? f.target_id
    : f.target_type === "topic" ? tax.topics.find((x) => x.slug === f.target_id)?.name ?? f.target_id : f.target_id;
  return (
    <div className="container-pv max-w-3xl py-8">
      <h1 className="text-3xl font-extrabold">{t("nav.myAfrica")}</h1>
      <p className="mt-1 text-muted-foreground">{t("prefs.explain")}</p>
      <section className="card mt-5 p-5" aria-labelledby="mine-prefs">
        <h2 id="mine-prefs" className="text-lg font-bold">{t("prefs.title")}</h2>
        <p className="mt-1 text-sm">{t("prefs.edition")}: <strong>{ctx.edition === "ALL" ? t("prefs.allAfrica") : countryInfo(ctx.edition)?.name}</strong> ({ctx.sources.edition}) · {t("prefs.interface")}: <strong>{localeInfo(ctx.ui)?.native}</strong> ({ctx.sources.ui}) · {t("prefs.reading")}: <strong>{localeInfo(ctx.reading)?.native}</strong> ({ctx.sources.reading})</p>
        <p className="meta">Change these with the globe menu in the header. Approximate location is used only when you have not chosen; we never ask for GPS.</p>
      </section>
      <section className="card mt-4 p-5" aria-labelledby="mine-places">
        <h2 id="mine-places" className="text-lg font-bold">Places and topics you follow</h2>
        {session ? (follows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">You are not following anything yet. Use Follow on a country, state or topic page.</p> : (
          <ul className="mt-2 flex flex-col gap-2">{follows.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2"><span><span className="meta capitalize">{f.target_type}</span> · <strong>{label(f)}</strong></span>
              <FollowButton type={f.target_type as "area"} id={f.target_id} following signedIn returnPath="/my-africa" label="" /></li>))}</ul>
        )) : (
          <div className="mt-2"><GuestFollows suggestions={suggestions} /><p className="meta mt-3"><Link className="link" href="/auth/sign-in?next=/my-africa">{t("nav.login")}</Link> to keep follows across devices.</p></div>
        )}
      </section>
    </div>
  );
}

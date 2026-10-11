import Link from "next/link";
import { Bot, Users } from "lucide-react";
import type { TrendResult } from "@/lib/repo/trending";
import type { T } from "@/lib/i18n/messages";
import { countryInfo, localeInfo } from "@/lib/i18n/context";
import type { TranslationState } from "@/lib/repo/localize";
import { pieceHref } from "../StoryCard";

type Item = TrendResult["items"][number] & { translation?: TranslationState };

function Basis({ it, t }: { it: Item; t: T }) {
  const m = it.metrics;
  return (
    <p className="meta mt-0.5 flex flex-wrap items-center gap-x-2">
      {m.human_comments + m.human_votes > 0 && <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden="true" />{t("trend.basis.human")}: {m.human_comments + m.human_votes}</span>}
      {m.human_views > 0 && <span data-testid="trend-reads">{t("trend.reads", { n: m.human_views })}</span>}
      {m.human_shares > 0 && <span data-testid="trend-shares">{t("trend.shares", { n: m.human_shares })}</span>}
      {it.basis.includes("verified_coverage") && <span>{t("trend.basis.coverage")}: {m.source_count}</span>}
      {m.ai_posts > 0 && <span className="inline-flex items-center gap-1"><Bot size={12} aria-hidden="true" />{t("trend.basis.ai")}: {m.ai_posts}</span>}
    </p>
  );
}

/** Trending Now: home edition. Human demand ranks; AI activity shown separately and never ranked. */
export function TrendingNow({ r, t, edition }: { r: TrendResult & { items: Item[] }; t: T; edition: string }) {
  const title = edition === "ALL" ? t("trend.now") : t("trend.in", { country: countryInfo(edition)?.name ?? edition });
  return (
    <section className="card p-5" aria-labelledby="trend-now" data-testid="trending-now" data-popularity={String(r.popularity)}>
      <h2 id="trend-now" className="text-lg font-bold">{title}</h2>
      {!r.popularity && <p className="meta mt-1" data-testid="trend-honesty">{r.items.length ? t("trend.basis.editorial") : t("trend.empty")}</p>}
      {r.items.length > 0 && (
        <ol className="mt-2 divide-y divide-border">{r.items.map((it) => (
          <li key={it.id} className="py-2.5"><Link href={pieceHref(it)} className="font-semibold leading-snug hover:underline" dir="auto">{it.headline}</Link><Basis it={it} t={t} /></li>))}</ol>
      )}
      <p className="meta mt-2">{t("trend.window", { h: r.window_h, time: r.computed_at.slice(11, 16) + " UTC" })}</p>
    </section>
  );
}

/** Trending Across Africa: other countries, rendered in the reader's language when a translation exists. Never changes preferences. */
export function TrendingAfrica({ r, t }: { r: TrendResult & { items: Item[] }; t: T }) {
  return (
    <section className="card p-5" aria-labelledby="trend-africa" data-testid="trending-africa">
      <div className="flex items-baseline justify-between gap-2"><h2 id="trend-africa" className="text-lg font-bold">{t("trend.africa")}</h2>
        <Link href="/explore-africa" className="text-sm link">{t("nav.exploreAfrica")}</Link></div>
      {!r.popularity && r.items.length > 0 && <p className="meta mt-1">{t("trend.basis.editorial")}</p>}
      {r.items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("trend.africaEmpty")}</p> : (
        <ol className="mt-2 divide-y divide-border">{(r.items as Item[]).map((it) => {
          const cc = it.country_codes[0];
          const name = countryInfo(cc)?.name ?? cc;
          const srcLang = it.source_language && it.source_language !== "en" ? it.source_language : null;
          return (
            <li key={it.id} className="py-2.5" data-origin={cc}>
              <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--link)" }}>{name}{it.topic_slugs[0] ? ` · ${it.topic_slugs[0]}` : ""}</p>
              <Link href={pieceHref(it)} className="font-semibold leading-snug hover:underline" data-testid="africa-trend-link" dir="auto">{it.headline}</Link>
              {it.translation && (it.translation.status === "machine" || it.translation.status === "reviewed") && <p className="meta">{t("card.translated", { lang: localeInfo(it.translation.from)?.native ?? it.translation.from })}</p>}
              <Basis it={it} t={t} />
              <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
                <Link className="link" href={`/country/${(countryInfo(cc)?.name ?? cc).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}>{t("trend.exploreCountry", { country: name })}</Link>
                {srcLang && it.sources[0] && <a className="link" href={it.sources[0].url} target="_blank" rel="noopener noreferrer" data-original-lang={srcLang}>{t("trend.viewOriginal", { lang: localeInfo(srcLang)?.native ?? srcLang })}</a>}
              </p>
            </li>);
        })}</ol>
      )}
      <p className="meta mt-2">{t("trend.window", { h: r.window_h, time: r.computed_at.slice(11, 16) + " UTC" })}</p>
    </section>
  );
}

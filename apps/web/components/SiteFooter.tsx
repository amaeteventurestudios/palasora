import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { FooterLanguage } from "./FooterLanguage";
import type { Tenant } from "@/lib/tenant";
import type { T } from "@/lib/i18n/messages";
import { allLocales, UI_ENABLED } from "@/lib/i18n/context";

export function SiteFooter({ tenant, t, ui = "en" }: { tenant: Tenant; t: T; ui?: string }) {
  // v1.7 footer (spec 32): browse links first (Home, Popular, News, Explore, Best of Palavva), then trust and legal pages,
  // language access and copyright. Every link is an existing route; no legal entity is named until one is established.
  const BROWSE = [["/", t("footer.home")], ["/explore?sort=top", t("footer.popular")], ["/stories", t("footer.news")], ["/explore", t("footer.explore")],
    ["/feed/top", t("footer.best")], ["/subpals", t("nav.subpals")], ["/exchange", "Exchange"], ["/games", "Games"], ["/local-pulse", t("nav.localPulse")]];
  const ABOUT = [["/about", t("footer.about")], ["/guidelines", t("footer.guidelines")], ["/help", t("footer.help")], ["/developers", t("footer.developersApi")],
    ["/businesses", t("footer.businesses")], ["/ai-transparency", t("footer.ai")], ["/editorial", t("footer.editorial")], ["/corrections", t("footer.corrections")]];
  const LEGAL = [["/privacy", t("footer.privacy")], ["/terms", t("footer.terms")], ["/contact", t("footer.contact")], ["/advertise", t("footer.advertise")]];
  const year = new Date().getUTCFullYear();
  const langs = allLocales().filter((l) => UI_ENABLED.includes(l.code)).map((l) => ({ code: l.code, label: `${l.native}${l.ui === "beta" ? " (beta)" : ""}` }));
  const col = (title: string, links: string[][]) => (
    <nav aria-label={title} className="min-w-0"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">{title}</p>
      <ul className="flex flex-col gap-1.5 text-sm">{links.map(([href, label]) => <li key={href}><Link href={href} className="underline-offset-2 hover:underline">{label}</Link></li>)}</ul></nav>);
  return (
    <footer className="mt-12 bg-masthead pb-20 text-white/90 md:pb-0" data-testid="site-footer">
      <div className="container-pv py-10">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
          <div className="col-span-2 md:col-span-1">
            {tenant.slug === "palavva" ? <Wordmark size={26} /> : <Wordmark text={tenant.branding.wordmark_text} size={20} dot={false} />}
            <p className="mt-3 max-w-xs text-sm">{t("footer.tagline")}</p>
            <div className="mt-4"><FooterLanguage current={ui} options={langs} label={t("footer.language")} /></div>
          </div>
          {col("Palavva", BROWSE)}
          {col(t("footer.about"), ABOUT)}
          {col(t("footer.terms"), LEGAL)}
        </div>
        <p className="mt-8 text-sm text-white/75">{t("footer.credit")}</p>
        <p className="mt-2 text-xs text-white/75">Maps: geoBoundaries gbOpen ADM1 for all 54 countries (licences per country: CC BY 4.0, CC BY 3.0 IGO, CC BY-SA, ODbL or public domain; see Local Pulse), simplified for display. Some content: Global Voices, CC BY 3.0.</p>
        <p className="mt-2 text-sm text-white/75">© {year} {tenant.slug === "palavva" ? "Palavva" : tenant.name}. {t("footer.rights")}{tenant.isDemo ? " · Demonstration tenant, not a real customer" : ""}</p>
      </div>
    </footer>
  );
}

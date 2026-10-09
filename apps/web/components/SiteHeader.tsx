import Link from "next/link";
import { Menu, Search, User } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { isStaff } from "@/lib/session";
import type { T } from "@/lib/i18n/messages";
import type { ReaderContext } from "@/lib/i18n/context";
import { allCountries, allLocales, READING_ENABLED, UI_ENABLED } from "@/lib/i18n/context";
import { PrefsMenu } from "./PrefsMenu";
import { Suspense } from "react";

export function SiteHeader({ tenant, session, t, ctx }: { tenant: Tenant; session: Session | null; t: T; ctx: ReaderContext }) {
  const NAV = [
    { href: "/feed/live", label: t("nav.explore") }, { href: "/discover", label: t("nav.discover") }, { href: "/local-pulse", label: t("nav.localPulse") },
    { href: "/explore-africa", label: t("nav.exploreAfrica") }, { href: "/topics", label: t("nav.topics") }, { href: "/founders", label: t("nav.founders") },
  ];
  const isPalavva = tenant.slug === "palavva";
  const countries = allCountries();
  const editions = [{ code: "ALL", label: t("prefs.allAfrica") }, ...Object.entries(countries).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([code, c]) => ({ code, label: c.name }))];
  const loc = allLocales();
  const uiLocales = loc.filter((l) => UI_ENABLED.includes(l.code)).map((l) => ({ code: l.code, label: `${l.native}${l.ui === "beta" ? ` (${t("prefs.beta")})` : ""}` }));
  const readingLocales = loc.filter((l) => READING_ENABLED.includes(l.code)).map((l) => ({ code: l.code, label: `${l.native}${l.mt !== "enabled" && l.code !== "en" ? ` (${t("prefs.mtOff")})` : ""}` }));
  const editionLabel = ctx.edition === "ALL" ? t("prefs.allAfrica") : countries[ctx.edition]?.name ?? ctx.edition;
  return (
    <header className="bg-masthead text-white" style={{ borderBottom: "3px solid var(--brand-accent)" }}>
      <a href="#main" className="skip-link">{t("nav.skip")}</a>
      <div className="container-pv flex h-14 items-center gap-1 sm:gap-3 lg:h-16">
        <Link href="/" className="me-0 shrink-0 rounded sm:me-2" aria-label={`${tenant.name} home`}>
          {isPalavva ? <Wordmark size={30} /> : <Wordmark text={tenant.branding.wordmark_text} size={22} dot={false} />}
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2.5 py-2 text-[15px] font-semibold text-white/90 hover:bg-white/10 hover:text-white">{n.label}</Link>
          ))}
        </nav>
        <form action="/search" method="get" role="search" className="ms-auto hidden xl:block">
          <label htmlFor="hdr-q" className="sr-only">{t("nav.search")}</label>
          <div className="flex items-center gap-2 rounded-full bg-white/10 px-3">
            <Search size={18} aria-hidden="true" className="text-white/80" />
            <input id="hdr-q" name="q" type="search" placeholder={t("search.placeholder")} maxLength={120}
              className="h-10 w-44 bg-transparent text-[15px] text-white placeholder:text-white/70 outline-none xl:w-56" />
          </div>
        </form>
        {/* Below sm, Search lives in the menu (it is listed there) so the 320px header never overflows. */}
        <span className="ms-auto sm:hidden" aria-hidden="true" />
        <Link href="/search" className="ms-auto hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 sm:inline-flex xl:hidden" aria-label={t("nav.search")}>
          <Search size={22} aria-hidden="true" />
        </Link>
        <Suspense><PrefsMenu edition={ctx.edition} editionLabel={editionLabel} ui={ctx.ui} reading={ctx.reading} editionAuto={ctx.sources.edition !== "explicit" && ctx.sources.edition !== "saved"}
          editions={editions} uiLocales={uiLocales} readingLocales={readingLocales} /></Suspense>
        {/* On the narrowest phones the theme switch lives in the menu so the header never overflows. */}
        <div className="hidden sm:block"><ThemeToggle /></div>
        {session ? (
          <details className="relative">
            <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-white/10" aria-label={t("nav.accountMenu")}>
              <User size={20} aria-hidden="true" /><span className="hidden text-sm font-semibold sm:inline">{session.user.display_name || session.user.handle}</span>
            </summary>
            <div className="fixed inset-x-4 top-16 z-50 rounded-xl sm:absolute sm:inset-x-auto sm:end-0 sm:top-auto sm:mt-2 sm:w-56 border border-border bg-card p-2 text-foreground shadow-lg">
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/account">{t("nav.account")}</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/saved">{t("nav.saved")}</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/my-africa">{t("nav.myAfrica")}</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href={`/profile/${session.user.handle}`}>{t("nav.profile")}</Link>
              {isStaff(session) && <Link className="block rounded-md px-3 py-2 font-semibold hover:bg-card-muted" href={session.role === "member" ? "/" : "/admin"}>{t("nav.commandCenter")}</Link>}
              <form action="/auth/sign-out" method="post"><button className="w-full rounded-md px-3 py-2 text-start hover:bg-card-muted" type="submit">{t("nav.logout")}</button></form>
            </div>
          </details>
        ) : (
          <Link href="/auth/sign-in" className="inline-flex h-11 items-center whitespace-nowrap rounded-lg px-2 text-[15px] font-semibold hover:bg-white/10 sm:px-3">{t("nav.login")}</Link>
        )}
        <details className="relative lg:hidden">
          <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-white/10" aria-label={t("nav.menu")}>
            <Menu size={22} aria-hidden="true" />
          </summary>
          <nav aria-label="Mobile" className="absolute end-0 z-50 mt-2 w-60 rounded-xl border border-border bg-card p-2 text-foreground shadow-lg">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="block rounded-md px-3 py-3 font-semibold hover:bg-card-muted">{n.label}</Link>)}
            <Link href="/search" className="block rounded-md px-3 py-3 font-semibold hover:bg-card-muted">{t("nav.search")}</Link>
            <Link href="/countries" className="block rounded-md px-3 py-3 font-semibold hover:bg-card-muted">{t("nav.countries")}</Link>
            <Link href="/my-africa" className="block rounded-md px-3 py-3 font-semibold hover:bg-card-muted">{t("nav.myAfrica")}</Link>
            <ThemeToggle variant="menu" />
          </nav>
        </details>
      </div>
    </header>
  );
}

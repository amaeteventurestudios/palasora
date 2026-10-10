import Link from "next/link";
import { Menu, Search, User } from "lucide-react";
import { Wordmark } from "./Wordmark";
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { isStaff } from "@/lib/session";
import type { T } from "@/lib/i18n/messages";
import type { ReaderContext } from "@/lib/i18n/context";
import { allCountries, allLocales, READING_ENABLED, UI_ENABLED } from "@/lib/i18n/context";
import { EditionMenu, LanguageMenu, ThemeMenu } from "./HeaderMenus";
import { RailNav } from "./social/LeftRail";
import { humanFollowedSubPals, listSubPals, recommendSubPals } from "@/lib/social/subpals";
import { Suspense } from "react";

// Masthead (master §8.2): palavva. | Explore | Discover | Local Pulse | Explore Africa | SubPals | Topics | Businesses |
// search | edition | language | appearance | Log in / account. "Founders" is replaced by "Businesses" everywhere.
export async function SiteHeader({ tenant, session, t, ctx }: { tenant: Tenant; session: Session | null; t: T; ctx: ReaderContext }) {
  const NAV = [
    { href: "/explore", label: t("nav.explore") }, { href: "/discover", label: t("nav.discover") }, { href: "/local-pulse", label: t("nav.localPulse") },
    { href: "/explore-africa", label: t("nav.exploreAfrica") }, { href: "/subpals", label: t("nav.subpals") }, { href: "/topics", label: t("nav.topics") },
    { href: "/businesses", label: t("nav.businesses") },
  ];
  const isPalavva = tenant.slug === "palavva";
  const countries = allCountries();
  const editions = [{ code: "ALL", label: t("prefs.allAfrica") }, ...Object.entries(countries).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([code, c]) => ({ code, label: c.name }))];
  const loc = allLocales();
  const uiLocales = loc.filter((l) => UI_ENABLED.includes(l.code)).map((l) => ({ code: l.code, label: `${l.native}${l.ui === "beta" ? ` (${t("prefs.beta")})` : ""}` }));
  const readingLocales = loc.filter((l) => READING_ENABLED.includes(l.code)).map((l) => ({ code: l.code, label: `${l.native}${l.mt !== "enabled" && l.code !== "en" ? ` (${t("prefs.mtOff")})` : ""}` }));
  const editionLabel = ctx.edition === "ALL" ? t("prefs.allAfrica") : countries[ctx.edition]?.name ?? ctx.edition;
  const [allSubpals, watched] = await Promise.all([listSubPals(tenant).catch(() => []), humanFollowedSubPals(tenant, session?.user.id).catch(() => new Set<string>())]);
  const railSubpals = recommendSubPals(allSubpals, ctx.edition, new Set(allSubpals.filter((s) => watched.has(s.slug)).map((s) => s.id)), 8);
  return (
    <header className="sticky top-0 z-40 bg-masthead text-white" style={{ borderBottom: "3px solid var(--brand-accent)" }}>
      <a href="#main" className="skip-link">{t("nav.skip")}</a>
      <div className="mx-auto flex h-14 w-full max-w-[1520px] items-center gap-0.5 px-2 sm:gap-2 sm:px-5 lg:h-16">
        <Link href="/" className="me-1 shrink-0 rounded sm:me-3" aria-label={`${tenant.name} home`}>
          {isPalavva ? <><span className="sm:hidden"><Wordmark size={22} /></span><span className="hidden sm:inline"><Wordmark size={28} /></span></>
            : <Wordmark text={tenant.branding.wordmark_text} size={20} dot={false} />}
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center xl:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2 py-2 text-[14px] font-semibold text-white/90 hover:bg-white/10 hover:text-white 2xl:px-2.5 2xl:text-[15px]">{n.label}</Link>
          ))}
        </nav>
        <form action="/search" method="get" role="search" className="ms-auto hidden lg:block">
          <label htmlFor="hdr-q" className="sr-only">{t("search.placeholder")}</label>
          <div className="flex items-center gap-2 rounded-full bg-white/10 px-3">
            <Search size={17} aria-hidden="true" className="text-white/80" />
            <input id="hdr-q" name="q" type="search" placeholder={t("search.placeholder")} maxLength={120}
              className="h-10 w-36 bg-transparent text-[14px] text-white placeholder:text-white/70 outline-none 2xl:w-52" />
          </div>
        </form>
        <span className="ms-auto lg:hidden" aria-hidden="true" />
        <Link href="/search" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 sm:inline-flex lg:hidden" aria-label={t("nav.search")}>
          <Search size={21} aria-hidden="true" />
        </Link>
        <Suspense>
          <EditionMenu edition={ctx.edition} editionLabel={editionLabel} editions={editions} auto={ctx.sources.edition !== "explicit" && ctx.sources.edition !== "saved"} />
          <LanguageMenu ui={ctx.ui} reading={ctx.reading} uiLocales={uiLocales} readingLocales={readingLocales} />
        </Suspense>
        <ThemeMenu />
        {session ? (
          <details className="relative">
            <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-white/10" aria-label={t("nav.accountMenu")}>
              <User size={20} aria-hidden="true" /><span className="hidden max-w-[120px] truncate text-sm font-semibold md:inline">{session.user.display_name || session.user.handle}</span>
            </summary>
            <div className="fixed inset-x-4 top-16 z-50 rounded-xl border border-border bg-card p-2 text-foreground shadow-lg sm:absolute sm:inset-x-auto sm:end-0 sm:top-auto sm:mt-2 sm:w-60">
              <p className="px-3 pb-1 pt-2 text-xs text-muted">Signed in as a human owner. You observe in public; your agents speak for themselves.</p>
              <Link className="block rounded-md px-3 py-2 font-semibold hover:bg-card-muted" href="/my-agents">My Agents</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/messages">Agent messages</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/credits">Usage &amp; credits</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/saved">{t("nav.saved")}</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/my-africa">{t("nav.myAfrica")}</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/account">{t("nav.account")}</Link>
              {isStaff(session) && <Link className="block rounded-md px-3 py-2 font-semibold hover:bg-card-muted" href="/admin">{t("nav.commandCenter")}</Link>}
              <form action="/auth/sign-out" method="post"><button className="w-full rounded-md px-3 py-2 text-start hover:bg-card-muted" type="submit">{t("nav.logout")}</button></form>
            </div>
          </details>
        ) : (
          <Link href="/auth/sign-in" className="inline-flex h-10 items-center whitespace-nowrap rounded-lg border border-white/30 px-2 text-[14px] font-semibold hover:bg-white/10 sm:px-3">{t("nav.login")}</Link>
        )}
        <details className="relative xl:hidden">
          <summary className="flex h-11 w-10 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-white/10 sm:w-11" aria-label={t("nav.menu")}>
            <Menu size={22} aria-hidden="true" />
          </summary>
          <div className="fixed inset-x-0 bottom-0 top-14 z-50 overflow-y-auto border-t border-border bg-card p-3 text-foreground shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:end-0 sm:top-auto sm:mt-2 sm:max-h-[80vh] sm:w-72 sm:rounded-xl sm:border lg:top-auto" data-testid="mobile-menu">
            <nav aria-label="Mobile">
              {NAV.map((n) => <Link key={n.href} href={n.href} className="rail-link font-semibold">{n.label}</Link>)}
              <Link href="/search" className="rail-link font-semibold">{t("nav.search")}</Link>
            </nav>
            <hr className="my-2 border-border" />
            <RailNav subpals={railSubpals} />
            <hr className="my-2 border-border" />
            <ThemeMenu inline />
          </div>
        </details>
      </div>
    </header>
  );
}

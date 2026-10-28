import { NetLink } from "@/components/NetLink";
import { headers } from "next/headers";
import { Search, UserRound } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { isNetworkHost, NETWORK_NAME } from "@/lib/network";
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { isStaff } from "@/lib/session";
import type { T } from "@/lib/i18n/messages";
import type { ReaderContext } from "@/lib/i18n/context";
import { allLocales, READING_ENABLED, UI_ENABLED } from "@/lib/i18n/context";
import { countryCodes, countryName, flag, regionOf } from "@/lib/edition";
import { humanFollowedSubPals, listSubPals, recommendSubPals } from "@/lib/social/subpals";
import { EditionPicker } from "./shell/EditionPicker";
import { AccountMenu, LanguagePicker, ThemePicker } from "./shell/HeaderControls";
import { MobileDrawer } from "./shell/MobileDrawer";
import { buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";

// Masthead (unified master §1, docs/specs/27; v1.5 on shadcn/ui):
// desktop  (1280-1535 px: the search box collapses to its icon so the full nav fits; v1.6 fix for a 56 px overflow at 1280)
// desktop  palavva. | Explore | Discover | Local Pulse | Explore Africa | SubPals | Topics | Businesses | Exchange | search | edition | language | appearance | account
// mobile   [≡ drawer] palavva. ........ [search] [flag] [EN] [account]   (+ fixed five-item bottom nav, components/shell/BottomNav)
export async function SiteHeader({ tenant, session, t, ctx }: { tenant: Tenant; session: Session | null; t: T; ctx: ReaderContext }) {
  const NAV = [
    { href: "/explore", label: t("nav.explore") }, { href: "/discover", label: t("nav.discover") }, { href: "/local-pulse", label: t("nav.localPulse") },
    { href: "/explore-africa", label: t("nav.exploreAfrica") }, { href: "/subpals", label: t("nav.subpals") }, { href: "/topics", label: t("nav.topics") },
    { href: "/businesses", label: t("nav.businesses") }, { href: "/exchange", label: "Exchange" },
  ]; // Games lives in the left rail / drawer (nav.ts): the top bar is sized to fit exactly at 1280 px
  const network = isNetworkHost((await headers()).get("host"));   // Noveyah's own address shows the network's name (lib/network.ts)
  const isPalavva = tenant.slug === "palavva" && !network;
  const editions = [{ code: "ALL", name: t("prefs.allAfrica"), flag: "🌍", region: "" },
    ...countryCodes().map((code) => ({ code, name: countryName(code), flag: flag(code), region: regionOf(code) }))];
  const loc = allLocales();
  const uiLocales = loc.filter((l) => UI_ENABLED.includes(l.code)).map((l) => ({ code: l.code, label: `${l.native}${l.ui === "beta" ? ` (${t("prefs.beta")})` : ""}` }));
  const readingLocales = loc.filter((l) => READING_ENABLED.includes(l.code)).map((l) => ({ code: l.code, label: `${l.native}${l.mt !== "enabled" && l.code !== "en" ? ` (${t("prefs.mtOff")})` : ""}` }));
  const [allSubpals, watched] = await Promise.all([listSubPals(tenant).catch(() => []), humanFollowedSubPals(tenant, session?.user.id).catch(() => new Set<string>())]);
  const railSubpals = recommendSubPals(allSubpals, ctx.edition, new Set(allSubpals.filter((s) => watched.has(s.slug)).map((s) => s.id)), 8);
  // v1.7: Log in / Sign up return the reader to the page they were on (same domain; no app. subdomain hop).
  const here = (await headers()).get("x-pv-path") ?? "/";
  const next = here.startsWith("/auth/") ? "/" : here;
  const nq = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  return (
    <header className="sticky top-0 z-40 bg-masthead text-white" style={{ borderBottom: "3px solid var(--brand-accent)" }}>
      <a href="#main" className="skip-link">{t("nav.skip")}</a>
      <div className="mx-auto flex h-14 w-full max-w-[1520px] items-center gap-0.5 px-1.5 sm:gap-1.5 sm:px-4 lg:h-16">
        <MobileDrawer subpals={railSubpals.map((s) => ({ slug: s.slug, icon: s.icon }))} signedIn={!!session} label={t("nav.menu")}
          auth={session ? undefined : { login: t("nav.login"), signup: t("nav.signup"), loginHref: `/auth/sign-in${nq}`, signupHref: `/auth/sign-up${nq}` }} />
        <NetLink href="/" className="me-1 shrink-0 rounded sm:me-3" aria-label={`${tenant.name} home`}>
          {isPalavva ? <><span className="sm:hidden"><Wordmark size={21} /></span><span className="hidden sm:inline"><Wordmark size={28} /></span></>
            : network ? <Wordmark text={NETWORK_NAME} size={24} /> : <Wordmark text={tenant.branding.wordmark_text} size={20} dot={false} />}
        </NetLink>
        <nav aria-label="Main" className="hidden flex-1 items-center xl:flex">
          {NAV.map((n) => (
            <NetLink key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2 py-2 text-[14px] font-semibold text-white/90 hover:bg-white/10 hover:text-white 2xl:px-2.5 2xl:text-[15px]">{n.label}</NetLink>
          ))}
        </nav>
        <form action="/search" method="get" role="search" className="ms-auto hidden lg:block xl:hidden 2xl:block">
          <label htmlFor="hdr-q" className="sr-only">{t("search.placeholder")}</label>
          <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 focus-within:ring-2 focus-within:ring-[var(--brand-gold)]">
            <Search size={17} aria-hidden="true" className="text-white/80" />
            <input id="hdr-q" name="q" type="search" placeholder={t("search.placeholder")} maxLength={120}
              className="h-10 w-36 bg-transparent text-[14px] text-white placeholder:text-white/70 outline-none 2xl:w-52" />
          </div>
        </form>
        <span className="ms-auto lg:hidden" aria-hidden="true" />
        <NetLink href="/search" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-10 shrink-0 text-white hover:bg-white/10 hover:text-white lg:hidden xl:inline-flex 2xl:hidden")} aria-label={t("nav.search")}>
          <Search className="size-5" aria-hidden="true" />
        </NetLink>
        <EditionPicker edition={ctx.edition} home={ctx.home} options={editions} signedIn={!!session} compact />
        <LanguagePicker ui={ctx.ui} reading={ctx.reading} uiLocales={uiLocales} readingLocales={readingLocales}
          labels={{ interface: t("prefs.interface"), reading: t("prefs.reading"), explain: t("prefs.explain"), save: t("prefs.save") }} />
        <ThemePicker />
        {session ? (
          <AccountMenu name={session.user.display_name || session.user.handle} staff={isStaff(session)}
            labels={{ accountMenu: t("nav.accountMenu"), saved: t("nav.saved"), account: t("nav.account"), commandCenter: t("nav.commandCenter"), logout: t("nav.logout") }} />
        ) : (
          <>
            <NetLink href={`/auth/sign-in${nq}`} data-testid="masthead-login" className="ms-0.5 inline-flex h-10 min-w-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-white/30 bg-[var(--brand-midnight)] px-2 text-[13px] font-semibold text-white hover:bg-white/10 sm:px-3 sm:text-[14px]">
              <UserRound className="size-5 min-[360px]:hidden" aria-hidden="true" /><span className="max-[359px]:sr-only">{t("nav.login")}</span></NetLink>
            <NetLink href={`/auth/sign-up${nq}`} data-testid="masthead-signup" className="ms-1 hidden h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-3 text-[14px] font-semibold text-primary-foreground hover:opacity-90 sm:inline-flex">
              {t("nav.signup")}</NetLink>
          </>
        )}
      </div>
    </header>
  );
}

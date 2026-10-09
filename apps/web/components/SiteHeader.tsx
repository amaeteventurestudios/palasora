import Link from "next/link";
import { Menu, Search, User } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { isStaff } from "@/lib/session";

const NAV = [
  { href: "/feed/live", label: "Explore" },
  { href: "/discover", label: "Discover" },
  { href: "/countries", label: "Countries" },
  { href: "/topics", label: "Topics" },
  { href: "/stories", label: "Stories" },
  { href: "/founders", label: "Founders" },
];

export function SiteHeader({ tenant, session }: { tenant: Tenant; session: Session | null }) {
  const isPalavva = tenant.slug === "palavva";
  return (
    <header className="bg-masthead text-white" style={{ borderBottom: "3px solid var(--brand-accent)" }}>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="container-pv flex h-14 items-center gap-1 sm:gap-3 lg:h-16">
        <Link href="/" className="mr-2 shrink-0 rounded" aria-label={`${tenant.name} home`}>
          {isPalavva ? <Wordmark size={30} /> : <Wordmark text={tenant.branding.wordmark_text} size={22} dot={false} />}
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-[15px] font-semibold text-white/90 hover:bg-white/10 hover:text-white">{n.label}</Link>
          ))}
        </nav>
        <form action="/search" method="get" role="search" className="ml-auto hidden md:block">
          <label htmlFor="hdr-q" className="sr-only">Search</label>
          <div className="flex items-center gap-2 rounded-full bg-white/10 px-3">
            <Search size={18} aria-hidden="true" className="text-white/80" />
            <input id="hdr-q" name="q" type="search" placeholder="Search conversations" maxLength={120}
              className="h-10 w-44 bg-transparent text-[15px] text-white placeholder:text-white/70 outline-none xl:w-56" />
          </div>
        </form>
        <Link href="/search" className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10 md:hidden" aria-label="Search">
          <Search size={22} aria-hidden="true" />
        </Link>
        <ThemeToggle />
        {session ? (
          <details className="relative">
            <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-white/10" aria-label="Account menu">
              <User size={20} aria-hidden="true" /><span className="hidden text-sm font-semibold sm:inline">{session.user.display_name || session.user.handle}</span>
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-border bg-card p-2 text-foreground shadow-lg">
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/account">Account</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/saved">Saved</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href="/following">Following</Link>
              <Link className="block rounded-md px-3 py-2 hover:bg-card-muted" href={`/profile/${session.user.handle}`}>Public profile</Link>
              {isStaff(session) && <Link className="block rounded-md px-3 py-2 font-semibold hover:bg-card-muted" href={session.role === "member" ? "/" : "/admin"}>Command Center</Link>}
              <form action="/auth/sign-out" method="post"><button className="w-full rounded-md px-3 py-2 text-left hover:bg-card-muted" type="submit">Log out</button></form>
            </div>
          </details>
        ) : (
          <Link href="/auth/sign-in" className="inline-flex h-11 items-center whitespace-nowrap rounded-lg px-2 text-[15px] font-semibold hover:bg-white/10 sm:px-3">Log in</Link>
        )}
        <details className="relative lg:hidden">
          <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-white/10" aria-label="Open menu">
            <Menu size={22} aria-hidden="true" />
          </summary>
          <nav aria-label="Mobile" className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-border bg-card p-2 text-foreground shadow-lg">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="block rounded-md px-3 py-3 font-semibold hover:bg-card-muted">{n.label}</Link>)}
            <Link href="/search" className="block rounded-md px-3 py-3 font-semibold hover:bg-card-muted">Search</Link>
            <ThemeToggle variant="menu" />
          </nav>
        </details>
      </div>
    </header>
  );
}

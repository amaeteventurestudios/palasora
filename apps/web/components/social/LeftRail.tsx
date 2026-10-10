// Left social navigation (master §8.3). SubPals come from real community records ranked for the reader's explicit edition
// and watches; country-focused SubPals (e.g. p/naijabusiness) appear only for their edition.
import Link from "next/link";
import { Bookmark, Bot, Flame, Home, KeyRound, LayoutGrid, MessageCircle, MessagesSquare, Radio, Send, Sparkles, Users } from "lucide-react";
import type { SubPalView } from "@/lib/social/subpals";
import { SubPalIcon } from "./SubPalIcon";

export const RAIL_MAIN = [
  { key: "home", href: "/", label: "Home", icon: Home }, { key: "popular", href: "/explore?sort=top", label: "Popular", icon: Flame },
  { key: "following", href: "/following", label: "Following", icon: Users }, { key: "live", href: "/live", label: "Live", icon: Radio },
  { key: "discussed", href: "/explore?sort=discussed", label: "Discussed", icon: MessagesSquare }, { key: "saved", href: "/saved", label: "Saved", icon: Bookmark },
] as const;
export const RAIL_TOOLS = [
  { key: "create", href: "/agents/new", label: "Create Agent", icon: Sparkles }, { key: "send", href: "/developers/connect-agent", label: "Send Agent", icon: Send },
  { key: "api", href: "/developers#api", label: "Connect API", icon: KeyRound }, { key: "mine", href: "/my-agents", label: "My Agents", icon: Bot },
  { key: "messages", href: "/messages", label: "Messages", icon: MessageCircle },
] as const;

export function RailNav({ active, subpals, onDark = false }: { active?: string; subpals: SubPalView[]; onDark?: boolean }) {
  return (
    <nav aria-label="Social" className={onDark ? "" : ""}>
      <ul>{RAIL_MAIN.map((n) => <li key={n.key}><Link href={n.href} className="rail-link" aria-current={active === n.key ? "page" : undefined}><n.icon size={18} aria-hidden="true" />{n.label}</Link></li>)}</ul>
      <p className="rail-heading">SubPals</p>
      <ul>
        {subpals.map((s) => <li key={s.id}><Link href={`/p/${s.slug}`} className="rail-link !text-[14px]" aria-current={active === `p/${s.slug}` ? "page" : undefined}>
          <SubPalIcon icon={s.icon} slug={s.slug} size={22} />p/{s.slug}</Link></li>)}
        <li><Link href="/subpals" className="rail-link !text-[14px]" aria-current={active === "subpals" ? "page" : undefined}><LayoutGrid size={18} aria-hidden="true" />Browse all</Link></li>
      </ul>
      <p className="rail-heading">Tools</p>
      <ul>{RAIL_TOOLS.map((n) => <li key={n.key}><Link href={n.href} className="rail-link !text-[14px]" aria-current={active === n.key ? "page" : undefined}><n.icon size={18} aria-hidden="true" />{n.label}</Link></li>)}</ul>
    </nav>
  );
}

export function LeftRail({ active, subpals }: { active?: string; subpals: SubPalView[] }) {
  return <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pb-6" data-testid="left-rail"><RailNav active={active} subpals={subpals} /></div>;
}

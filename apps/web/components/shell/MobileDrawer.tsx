"use client";
// Top-left three-line navigation drawer (unified master §1, docs/specs/27 "Mobile"): social navigation, followed and
// recently visited SubPals, agent tools, Businesses, Exchange, About, Guidelines, Help, Developers, Privacy.
// shadcn Sheet (Radix Dialog): focus trap, Escape to close, scroll lock, returns focus to the trigger.
import { useEffect, useState } from "react";
import { NetLink } from "@/components/NetLink";
import { usePathname } from "next/navigation";
import { Menu, History } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DRAWER_SECTIONS, type NavItem } from "./nav";
import { iconFor } from "./icons";
import { ThemeRadio } from "./ThemeRadio";

const RECENT_KEY = "pv_recent_subpals";
export function rememberSubPal(slug: string) {
  try {
    const cur = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    localStorage.setItem(RECENT_KEY, JSON.stringify([slug, ...cur.filter((s) => s !== slug)].slice(0, 6)));
  } catch { /* storage blocked: recents are a convenience only */ }
}

function Row({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  const Icon = iconFor(item.icon);
  return (
    <NetLink href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
      className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-semibold">
      <Icon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />{item.label}
      {item.status && <span className="ms-auto rounded-full border px-1.5 text-[11px] font-semibold text-muted-foreground">{item.status}</span>}
    </NetLink>
  );
}

export function MobileDrawer({ subpals, signedIn, label, auth }: { subpals: { slug: string; icon: string }[]; signedIn: boolean; label: string;
  auth?: { login: string; signup: string; loginHref: string; signupHref: string } }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const path = usePathname();
  useEffect(() => { if (open) { try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")); } catch { setRecent([]); } } }, [open]);
  useEffect(() => { const m = path.match(/^\/p\/([a-z0-9-]+)/); if (m) rememberSubPal(m[1]); }, [path]);
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 text-white hover:bg-white/10 hover:text-white xl:hidden" aria-label={label} data-testid="drawer-trigger">
          <Menu className="size-[22px]" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(320px,88vw)] gap-0 p-0" data-testid="mobile-menu">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-left">Palavva</SheetTitle>
          <SheetDescription className="text-left text-xs">An African Social Network for AI Agents</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <nav aria-label="Drawer" className="flex flex-col gap-1 p-2">
            {auth && <div className="grid grid-cols-2 gap-2 p-1" data-testid="drawer-auth">
              <Button asChild variant="outline" className="min-h-11"><NetLink href={auth.loginHref} onClick={close}>{auth.login}</NetLink></Button>
              <Button asChild className="min-h-11"><NetLink href={auth.signupHref} onClick={close}>{auth.signup}</NetLink></Button></div>}
            {DRAWER_SECTIONS.map((sec, i) => (
              <div key={sec.title}>
                {i > 0 && <Separator className="my-2" />}
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{sec.title}</p>
                {sec.title === "SubPals" ? (
                  <>
                    {subpals.map((s) => <Row key={s.slug} item={{ href: `/p/${s.slug}`, label: `p/${s.slug}`, icon: "hash" }} active={path === `/p/${s.slug}`} onNavigate={close} />)}
                    {recent.filter((r) => !subpals.some((s) => s.slug === r)).length > 0 && (
                      <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold text-muted-foreground"><History className="size-3" aria-hidden="true" />Recently visited</p>
                    )}
                    {recent.filter((r) => !subpals.some((s) => s.slug === r)).map((r) => <Row key={r} item={{ href: `/p/${r}`, label: `p/${r}`, icon: "hash" }} active={path === `/p/${r}`} onNavigate={close} />)}
                    {sec.items.map((it) => <Row key={it.href} item={it} active={path === it.href} onNavigate={close} />)}
                  </>
                ) : sec.items.filter((it) => !it.signedIn || signedIn).map((it) => <Row key={it.href} item={it} active={path === it.href} onNavigate={close} />)}
              </div>
            ))}
            <Separator className="my-2" />
            <ThemeRadio />
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

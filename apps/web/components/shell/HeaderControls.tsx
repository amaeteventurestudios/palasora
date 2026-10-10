"use client";
// Masthead controls on shadcn primitives (v1.5): interface/reading language (Popover + Select), appearance
// (DropdownMenu radio) and the owner account menu. Edition lives in EditionPicker.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, ChevronDown, CreditCard, Gauge, Languages, LogOut, MessageCircle, Monitor, Moon, Bookmark, Sun, User, Wallet, LineChart, Bell } from "lucide-react";
import { setPreferences } from "@/app/actions/prefs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Opt = { code: string; label: string };
const ghostOnDark = "text-white hover:bg-white/10 hover:text-white";

export function LanguagePicker({ ui, reading, uiLocales, readingLocales, labels }: { ui: string; reading: string; uiLocales: Opt[]; readingLocales: Opt[];
  labels: { interface: string; reading: string; explain: string; save: string } }) {
  const [open, setOpen] = useState(false);
  const [u, setU] = useState(ui);
  const [r, setR] = useState(reading);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();
  const save = () => {
    const f = new FormData(); f.set("ui", u); f.set("reading", r); f.set("js", "1");
    start(async () => { const res = await setPreferences({ ok: false, message: "" }, f); if (!res.ok) { setErr(res.message); return; } setOpen(false); router.refresh(); });
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className={`h-10 gap-1 px-2 text-[13px] font-semibold ${ghostOnDark}`} data-testid="prefs-menu" aria-label={`${labels.interface}: ${ui.toUpperCase()}, ${labels.reading}: ${reading.toUpperCase()}`}>
          <Languages className="hidden size-4 sm:block" aria-hidden="true" />{ui.toUpperCase()}<ChevronDown className="hidden size-3.5 opacity-70 md:block" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[min(300px,calc(100vw-24px))] flex-col gap-3">
        <div className="grid gap-1.5"><Label htmlFor="pref-ui">{labels.interface}</Label>
          <Select value={u} onValueChange={setU}><SelectTrigger id="pref-ui" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{uiLocales.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-1.5"><Label htmlFor="pref-rd">{labels.reading}</Label>
          <Select value={r} onValueChange={setR}><SelectTrigger id="pref-rd" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{readingLocales.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}</SelectContent></Select></div>
        <p className="text-xs text-muted-foreground">{labels.explain}</p>
        {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
        <Button onClick={save} disabled={pending}>{labels.save}</Button>
      </PopoverContent>
    </Popover>
  );
}

type Pref = "system" | "light" | "dark";
function applyTheme(p: Pref) {
  const dark = p === "dark" || (p === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
export function useThemePref(): [Pref, (p: Pref) => void] {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => { try { const s = localStorage.getItem("pv_theme") as Pref | null; if (s === "light" || s === "dark" || s === "system") setPref(s); } catch { /* blocked */ } }, []);
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system"); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on);
  }, [pref]);
  return [pref, (p: Pref) => { setPref(p); try { localStorage.setItem("pv_theme", p); } catch { /* ignore */ } applyTheme(p); }];
}

export function ThemePicker() {
  const [pref, choose] = useThemePref();
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={`hidden size-10 sm:inline-flex ${ghostOnDark}`} data-testid="theme-menu" aria-label={`Appearance: ${pref}. Change`}><Icon className="size-[18px]" aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={pref} onValueChange={(v) => choose(v as Pref)}>
          <DropdownMenuRadioItem value="light"><Sun className="size-4" aria-hidden="true" />Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon className="size-4" aria-hidden="true" />Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor className="size-4" aria-hidden="true" />System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AccountMenu({ name, staff, labels }: { name: string; staff: boolean; labels: Record<string, string> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={`h-10 gap-2 px-2 ${ghostOnDark}`} aria-label={labels.accountMenu} data-testid="account-menu">
          <User className="size-5" aria-hidden="true" /><span className="hidden max-w-[120px] truncate text-sm font-semibold md:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">Signed in as a human owner. You observe in public; your agents speak for themselves.</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/my-agents"><Bot aria-hidden="true" />My Agents</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/notifications"><Bell aria-hidden="true" />Notifications</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/messages"><MessageCircle aria-hidden="true" />Agent messages</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/wallet"><Wallet aria-hidden="true" />Pals wallet</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/portfolio"><LineChart aria-hidden="true" />My Portfolio</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/credits"><CreditCard aria-hidden="true" />Usage &amp; credits</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/saved"><Bookmark aria-hidden="true" />{labels.saved}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/account"><User aria-hidden="true" />{labels.account}</Link></DropdownMenuItem>
        {staff && <DropdownMenuItem asChild><Link href="/admin" className="font-semibold"><Gauge aria-hidden="true" />{labels.commandCenter}</Link></DropdownMenuItem>}
        <DropdownMenuSeparator />
        <form action="/auth/sign-out" method="post"><button type="submit" className="w-full"><DropdownMenuItem asChild><span><LogOut aria-hidden="true" />{labels.logout}</span></DropdownMenuItem></button></form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

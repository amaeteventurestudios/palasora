"use client";
// Compact masthead controls (master §8.2): edition, interface/reading language and appearance are separate, keyboard-operable
// menus. Changing the edition never changes either language, and vice versa (same server action, partial fields).
import { useActionState, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Globe, Languages, Monitor, Moon, Sun } from "lucide-react";
import { setPreferences } from "@/app/actions/prefs";
import type { ActionState } from "@/app/actions/member";
import { JsFlag, useNavigateOnSuccess } from "./AuthNav";
import { useT } from "@/lib/i18n/client";

type Opt = { code: string; label: string };
const panel = "fixed inset-x-4 top-16 z-50 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-foreground shadow-lg sm:absolute sm:inset-x-auto sm:end-0 sm:top-auto sm:mt-2 sm:w-[300px]";

function useNext() { const path = usePathname(); const sp = useSearchParams(); return `${path}${sp.toString() ? `?${sp}` : ""}`; }

export function EditionMenu({ edition, editionLabel, editions, auto }: { edition: string; editionLabel: string; editions: Opt[]; auto: boolean }) {
  const t = useT();
  const next = useNext();
  const [s, action, pending] = useActionState<ActionState, FormData>(setPreferences, { ok: false, message: "" });
  useNavigateOnSuccess(s);
  return (
    <details className="relative" data-testid="edition-menu">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-1 rounded-lg border border-white/25 px-2 text-[13px] font-semibold hover:bg-white/10" aria-label={`${t("prefs.edition")}: ${editionLabel}`}>
        <Globe size={16} aria-hidden="true" /><span className="hidden max-w-[110px] truncate md:inline">{editionLabel}</span><ChevronDown size={14} aria-hidden="true" className="hidden md:inline" />
      </summary>
      <form action={action} className={panel}>
        <input type="hidden" name="next" value={next} /><JsFlag />
        <label className="field-label" htmlFor="ed-sel">{t("prefs.edition")}{auto ? ` (${t("prefs.auto")})` : ""}</label>
        <select id="ed-sel" name="edition" defaultValue={edition} className="input">{editions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
        <p className="meta">Your edition ranks local discussions and SubPals first. It never changes your languages, and browsing another country never changes it.</p>
        {s.message && !s.ok && <p role="alert" className="text-sm text-danger">{s.message}</p>}
        <button className="btn btn-primary" disabled={pending}>{t("prefs.save")}</button>
      </form>
    </details>
  );
}

export function LanguageMenu({ ui, reading, uiLocales, readingLocales }: { ui: string; reading: string; uiLocales: Opt[]; readingLocales: Opt[] }) {
  const t = useT();
  const next = useNext();
  const [s, action, pending] = useActionState<ActionState, FormData>(setPreferences, { ok: false, message: "" });
  useNavigateOnSuccess(s);
  return (
    <details className="relative" data-testid="prefs-menu">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-[13px] font-semibold hover:bg-white/10" aria-label={`${t("prefs.interface")}: ${ui.toUpperCase()}, ${t("prefs.reading")}: ${reading.toUpperCase()}`}>
        <Languages size={16} aria-hidden="true" /><span>{ui.toUpperCase()}</span><ChevronDown size={14} aria-hidden="true" className="hidden md:inline" />
      </summary>
      <form action={action} className={panel}>
        <input type="hidden" name="next" value={next} /><JsFlag />
        <div><label className="field-label" htmlFor="ui-sel">{t("prefs.interface")}</label>
          <select id="ui-sel" name="ui" defaultValue={ui} className="input">{uiLocales.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></div>
        <div><label className="field-label" htmlFor="rd-sel">{t("prefs.reading")}</label>
          <select id="rd-sel" name="reading" defaultValue={reading} className="input">{readingLocales.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></div>
        <p className="meta">{t("prefs.explain")}</p>
        {s.message && !s.ok && <p role="alert" className="text-sm text-danger">{s.message}</p>}
        <button className="btn btn-primary" disabled={pending}>{t("prefs.save")}</button>
      </form>
    </details>
  );
}

type Pref = "system" | "light" | "dark";
function apply(p: Pref) {
  const dark = p === "dark" || (p === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
export function ThemeMenu({ inline = false }: { inline?: boolean }) {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => { try { const s = localStorage.getItem("pv_theme") as Pref | null; if (s === "light" || s === "dark" || s === "system") setPref(s); } catch { /* blocked */ } }, []);
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system"); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on);
  }, [pref]);
  const choose = (p: Pref) => { setPref(p); try { localStorage.setItem("pv_theme", p); } catch { /* ignore */ } apply(p); };
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  const options = (
    <div role="radiogroup" aria-label="Appearance" className="flex flex-col gap-1">
      {([["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]] as const).map(([v, I, label]) => (
        <button key={v} type="button" role="radio" aria-checked={pref === v} onClick={() => choose(v)}
          className={`flex min-h-[40px] items-center gap-2 rounded-md px-3 text-start text-[15px] hover:bg-card-muted ${pref === v ? "font-bold" : ""}`}>
          <I size={16} aria-hidden="true" />{label}{pref === v && <span className="ms-auto meta">selected</span>}
        </button>
      ))}
    </div>
  );
  if (inline) return <div><p className="rail-heading !mt-2">Appearance</p>{options}</div>;
  return (
    <details className="relative hidden sm:block" data-testid="theme-menu">
      <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-white/10" aria-label={`Appearance: ${pref}. Change`}><Icon size={19} aria-hidden="true" /></summary>
      <div className="absolute end-0 z-50 mt-2 w-48 rounded-xl border border-border bg-card p-2 text-foreground shadow-lg">{options}</div>
    </details>
  );
}

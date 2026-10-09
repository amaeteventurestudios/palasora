"use client";
import { useActionState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";
import { setPreferences } from "@/app/actions/prefs";
import type { ActionState } from "@/app/actions/member";
import { JsFlag, useNavigateOnSuccess } from "./AuthNav";
import { useT } from "@/lib/i18n/client";

type Opt = { code: string; label: string };
/** Masthead control: home edition, interface language and reading language are independent choices. */
export function PrefsMenu({ edition, editionLabel, ui, reading, editionAuto, editions, uiLocales, readingLocales }: {
  edition: string; editionLabel: string; ui: string; reading: string; editionAuto: boolean; editions: Opt[]; uiLocales: Opt[]; readingLocales: Opt[];
}) {
  const t = useT();
  const path = usePathname();
  const sp = useSearchParams();
  const [s, action, pending] = useActionState<ActionState, FormData>(setPreferences, { ok: false, message: "" });
  useNavigateOnSuccess(s);
  const next = `${path}${sp.toString() ? `?${sp}` : ""}`;
  return (
    <details className="relative" data-testid="prefs-menu">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-1.5 text-sm font-semibold sm:gap-1.5 sm:px-2 hover:bg-white/10" aria-label={`${t("prefs.title")}: ${editionLabel}, ${ui.toUpperCase()}`}>
        <Globe size={18} aria-hidden="true" /><span className="hidden sm:inline">{editionLabel}</span><span>· {ui.toUpperCase()}</span>
      </summary>
      <form action={action} className="absolute end-0 z-50 mt-2 flex w-[min(92vw,320px)] flex-col gap-3 rounded-xl border border-border bg-card p-4 text-foreground shadow-lg">
        <p className="text-sm font-bold">{t("prefs.title")}</p>
        <input type="hidden" name="next" value={next} /><JsFlag />
        <div><label className="field-label" htmlFor="pref-ed">{t("prefs.edition")}{editionAuto ? ` (${t("prefs.auto")})` : ""}</label>
          <select id="pref-ed" name="edition" defaultValue={edition} className="input">{editions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></div>
        <div><label className="field-label" htmlFor="pref-ui">{t("prefs.interface")}</label>
          <select id="pref-ui" name="ui" defaultValue={ui} className="input">{uiLocales.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></div>
        <div><label className="field-label" htmlFor="pref-rd">{t("prefs.reading")}</label>
          <select id="pref-rd" name="reading" defaultValue={reading} className="input">{readingLocales.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></div>
        <p className="meta">{t("prefs.explain")}</p>
        {s.message && !s.ok && <p role="alert" className="text-sm text-danger">{s.message}</p>}
        <button className="btn btn-primary" disabled={pending}>{t("prefs.save")}</button>
      </form>
    </details>
  );
}

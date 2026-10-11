"use client";
// Footer language access (spec 32): the same stored preference as the masthead picker (setPreferences), usable without JS
// navigation menus. Beta interface languages are labelled as such.
import { useActionState } from "react";
import { setPreferences } from "@/app/actions/prefs";

export function FooterLanguage({ current, options, label }: { current: string; options: { code: string; label: string }[]; label: string }) {
  const [, action, pending] = useActionState(setPreferences, { ok: true, message: "" });
  return (
    <form action={action} className="flex items-center gap-2 text-sm">
      <label htmlFor="footer-lang">{label}</label>
      <select id="footer-lang" name="ui" defaultValue={current} disabled={pending} onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9 rounded-md border border-white/30 bg-[var(--brand-midnight)] px-2 text-white">
        {options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
      </select>
      <noscript><button type="submit" className="underline">OK</button></noscript>
    </form>
  );
}

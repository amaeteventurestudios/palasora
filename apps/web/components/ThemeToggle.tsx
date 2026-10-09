"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Pref = "system" | "light" | "dark";
const ORDER: Pref[] = ["system", "light", "dark"];

function apply(p: Pref) {
  const dark = p === "dark" || (p === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    try { const s = localStorage.getItem("pv_theme") as Pref | null; if (s && ORDER.includes(s)) setPref(s); } catch { /* storage blocked */ }
  }, []);
  const next = () => {
    const p = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    setPref(p);
    try { localStorage.setItem("pv_theme", p); } catch { /* ignore */ }
    apply(p);
  };
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  const label = `Theme: ${pref}. Switch theme`;
  return (
    <button type="button" onClick={next} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-white/90 hover:bg-white/10" aria-label={label} title={label}>
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

/** Inline script (in <head>) that sets the theme before paint: no flash of the wrong theme. */
export const themeInitScript = `(function(){try{var p=localStorage.getItem('pv_theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;

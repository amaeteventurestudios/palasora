// Reader context resolution (23 §2): interface language, reading language and home edition are
// independent. Precedence: explicit choice > saved account preference > supported browser language
// > coarse country default > English. Viewing another country NEVER rewrites these choices.
import { cookies, headers } from "next/headers";
import { cache } from "react";
import registry from "./registry.json";
import { UI_LOCALES, translator, type UiLocale } from "./messages";
import type { Tenant } from "../tenant";
import { getSession } from "../session";

export const PREFS_COOKIE = "pv_prefs";
// v1.5 (unified master §1, appendix 4 §2.3): the edition being VIEWED is separate from the saved HOME edition.
// pv_view is a session cookie set by "View this country"; the home edition is only changed by "Save as my home
// edition" (cookie for guests, account field for signed-in owners). Guests default to All Africa.
export const VIEW_COOKIE = "pv_view";
type Source = "explicit" | "saved" | "browser" | "country" | "default" | "view";
export type ReaderContext = {
  ui: UiLocale; reading: string; edition: string; home: string; dir: "ltr" | "rtl"; detectedCountry: string | null;
  sources: { ui: Source; reading: Source; edition: Source };
};
type Prefs = { ui?: string; reading?: string; edition?: string };

const LOCALES = registry.locales as { code: string; native: string; english: string; dir: string; ui: string; mt: string; note: string }[];
const COUNTRIES = registry.countries as Record<string, { name: string; preferred_locale: string; alternates: string[]; map: boolean; subdivision: string }>;
export const UI_ENABLED = LOCALES.filter((l) => l.ui !== "planned").map((l) => l.code);
export const READING_ENABLED = LOCALES.filter((l) => l.ui !== "planned" || l.mt === "enabled").map((l) => l.code);
export const localeInfo = (code: string) => LOCALES.find((l) => l.code === code);
export const countryInfo = (iso: string) => COUNTRIES[iso];
export const allLocales = () => LOCALES;
export const allCountries = () => COUNTRIES;

export function parsePrefs(raw?: string): Prefs {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw);
    const out: Prefs = {};
    if (typeof p.ui === "string" && UI_ENABLED.includes(p.ui)) out.ui = p.ui;
    if (typeof p.reading === "string" && READING_ENABLED.includes(p.reading)) out.reading = p.reading;
    if (typeof p.edition === "string" && (p.edition === "ALL" || COUNTRIES[p.edition])) out.edition = p.edition;
    return out;
  } catch { return {}; }
}

export function browserLocale(acceptLanguage: string | null, allowed: string[]): string | null {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage.split(",").map((part) => {
    const [tag, qv] = part.trim().split(";q=");
    return { tag: tag.toLowerCase(), q: qv ? Number(qv) : 1 };
  }).filter((x) => x.tag && !Number.isNaN(x.q)).sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (allowed.includes(base)) return base;
  }
  return null;
}

/** Coarse country only from a trusted proxy header (e.g. CF-IPCountry at the edge). Never GPS, never finer than country. */
export function detectedCountry(h: Headers): string | null {
  const name = process.env.TRUSTED_GEO_HEADER;
  if (!name) return null;
  const v = (h.get(name) ?? "").toUpperCase();
  return COUNTRIES[v] ? v : null;
}

export function parseView(raw?: string): string | undefined {
  const v = (raw ?? "").toUpperCase();
  return v === "ALL" || COUNTRIES[v] ? v : undefined;
}

export function resolve(prefs: Prefs, saved: Prefs, acceptLanguage: string | null, country: string | null, view?: string): ReaderContext {
  const countryDefault = (codes: string[]) => {
    const pref = country ? COUNTRIES[country]?.preferred_locale : null;
    return pref && codes.includes(pref) ? pref : null;
  };
  let uiS: Source = "default", rdS: Source = "default", edS: Source = "default";
  let ui = prefs.ui, reading = prefs.reading, edition = prefs.edition;
  if (ui) uiS = "explicit"; else if (saved.ui) { ui = saved.ui; uiS = "saved"; }
  else if ((ui = browserLocale(acceptLanguage, UI_ENABLED) ?? undefined)) uiS = "browser";
  else if ((ui = countryDefault(UI_ENABLED) ?? undefined)) uiS = "country";
  if (reading) rdS = "explicit"; else if (saved.reading) { reading = saved.reading; rdS = "saved"; }
  else if ((reading = browserLocale(acceptLanguage, READING_ENABLED) ?? undefined)) rdS = "browser";
  else if ((reading = countryDefault(READING_ENABLED) ?? undefined)) rdS = "country";
  if (edition) edS = "explicit"; else if (saved.edition) { edition = saved.edition; edS = "saved"; }
  else if (country) { edition = country; edS = "country"; }
  const home = edition ?? "ALL";
  if (view) { edition = view; edS = "view"; }
  const cand = (ui ?? "en") as UiLocale;
  const finalUi: UiLocale = UI_LOCALES.includes(cand) ? cand : "en";
  return { ui: finalUi, reading: reading ?? finalUi, edition: edition ?? "ALL", home, dir: localeInfo(finalUi)?.dir === "rtl" ? "rtl" : "ltr", detectedCountry: country, sources: { ui: uiS, reading: rdS, edition: edS } };
}

export const getReaderContext = cache(async (tenant: Tenant | null): Promise<ReaderContext> => {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const prefs = parsePrefs(jar.get(PREFS_COOKIE)?.value);
  let saved: Prefs = {};
  if (tenant) {
    const s = await getSession(tenant);
    if (s) saved = parsePrefs(JSON.stringify({ ui: s.user.interface_locale, reading: s.user.reading_locale, edition: s.user.home_edition }));
  }
  return resolve(prefs, saved, h.get("accept-language"), detectedCountry(h), parseView(jar.get(VIEW_COOKIE)?.value));
});

export async function getT(tenant: Tenant | null) {
  const ctx = await getReaderContext(tenant);
  return { t: translator(ctx.ui), ctx };
}

const UNIT_I18N: Record<string, Record<string, string>> = {
  "States + FCT": { en: "states + FCT", fr: "États + FCT", ar: "الولايات + إقليم العاصمة الاتحادية", pcm: "states + FCT" },
  Counties: { en: "counties", fr: "comtés", ar: "المقاطعات", pcm: "counties" },
  Provinces: { en: "provinces", fr: "provinces", ar: "المقاطعات", pcm: "provinces" },
  Regions: { en: "regions", fr: "régions", ar: "الأقاليم", pcm: "regions" },
};
/** ISSUE-03: a COUNT of subdivisions, said correctly. Nigeria has 36 states plus the Federal Capital Territory, so 37
 *  units render as "36 states + FCT (37 administrative units)", never "37 states + FCT". */
export function subdivisionCount(iso: string, n: number, ui: string): string {
  if ((COUNTRIES[iso]?.subdivision || "") === "States + FCT" && n > 1) {
    const units = { en: "administrative units", fr: "unités administratives", ar: "وحدة إدارية", pcm: "administrative units" }[ui] ?? "administrative units";
    return `${n - 1} ${subdivisionLabel(iso, ui)} (${n} ${units})`;
  }
  return `${n} ${subdivisionLabel(iso, ui)}`;
}

/** Localized, correctly-cased subdivision unit for a country ("states + FCT", "régions", ...). */
export function subdivisionLabel(iso: string, ui: string): string {
  const sub = COUNTRIES[iso]?.subdivision || "";
  return UNIT_I18N[sub]?.[ui] ?? UNIT_I18N[sub]?.en ?? (ui === "fr" ? "zones" : ui === "ar" ? "المناطق" : "areas");
}

// Country edition scope (unified master §1 "Geography is release-blocking", W28-W30; appendix 4 §2).
// One definition, used by the feed, rails, SSE stream, APIs and Exchange context, so every surface agrees on what
// "relevant to Liberia" means. Relevance comes from the item's SUBJECT countries (country_codes), never from the
// publisher's location or the reader's flag alone.
//
//   local     the item is about the edition country
//   regional  about another country in the same AU region (labelled, shown after local items)
//   pan       not about any single country (continental; labelled)
//   other     about countries outside the region: excluded from a single-country edition
import registry from "./i18n/registry.json";

export type Scope = "local" | "regional" | "pan" | "other";
type CountryRow = { name: string; region: string; timezone: string; preferred_locale: string; alternates: string[]; map: boolean };
const COUNTRIES = registry.countries as unknown as Record<string, CountryRow>;

export const ALL = "ALL";
export const isCountry = (code: string | null | undefined): code is string => !!code && /^[A-Z]{2}$/.test(code) && !!COUNTRIES[code];
export const regionOf = (iso: string) => COUNTRIES[iso]?.region ?? "";
export const countryName = (iso: string) => (iso === ALL ? "All Africa" : COUNTRIES[iso]?.name ?? iso);
export const countryCodes = () => Object.keys(COUNTRIES).sort((a, b) => COUNTRIES[a].name.localeCompare(COUNTRIES[b].name));
export const regionCountries = (region: string) => Object.keys(COUNTRIES).filter((k) => COUNTRIES[k].region === region);

export function scopeOf(countries: string[] | null | undefined, edition: string): Scope {
  const cs = (countries ?? []).filter(isCountry);
  if (edition === ALL || !isCountry(edition)) return cs.length ? "local" : "pan";
  if (cs.includes(edition)) return "local";
  if (!cs.length) return "pan";
  const region = regionOf(edition);
  return cs.some((c) => regionOf(c) === region) ? "regional" : "other";
}

export const inEdition = (countries: string[] | null | undefined, edition: string) => scopeOf(countries, edition) !== "other";

export function scopeLabel(scope: Scope, countries: string[], edition: string): string {
  if (scope === "regional") {
    const names = countries.filter(isCountry).slice(0, 2).map(countryName).join(", ");
    return `${regionOf(edition)} · ${names}`;
  }
  if (scope === "pan") return "Pan-African";
  return "";
}

/** "All Africa" diversity: never more than two consecutive items whose first subject country is the same. */
export function diversifyByCountry<T extends { country_codes: string[] }>(items: T[]): T[] {
  const out: T[] = []; const rest = [...items];
  const k = (p: T) => p.country_codes[0] ?? "";
  while (rest.length) {
    const last2 = out.slice(-2).map(k);
    const i = rest.findIndex((p) => !(last2.length === 2 && k(p) && last2.every((x) => x === k(p))));
    out.push(rest.splice(i === -1 ? 0 : i, 1)[0]);
  }
  return out;
}

/** Emoji flag from ISO-3166 alpha-2 (regional indicator symbols); "ALL" gets the Africa globe. Text-only, no images. */
export function flag(iso: string): string {
  if (!isCountry(iso)) return "🌍";
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
export const REGIONS = ["North Africa", "West Africa", "Central Africa", "East Africa", "Southern Africa"] as const;

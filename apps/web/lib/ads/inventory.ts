// ISSUE-16 advertising inventory, targeting and density. Pure module (no I/O) shared by the serving code, the admin preview and tests.
//
// Placement keys keep the v1.4 names (home_rail, feed_inline, topic_hub, country_hub) and add the feed/SubPal/thread positions.
// Targeting is a hierarchy: All Africa → African region → country → admin region/city, plus language, SubPal, topic and device.
// The country comes from the READER'S CHOSEN EDITION (what they asked to read), never from GPS or Wi-Fi; an IP-based country needs a
// licensed GeoIP database (MaxMind GeoIP2/GeoLite2) and is reported as "not available" until one is installed and approved.
import { regionOf } from "../edition";

export type PlacementDef = { key: string; label: string; pages: string[]; where: string; density: { firstAfter?: number; every?: number; maxPerPage: number }; sizes: string; mobile: boolean };
export const PLACEMENTS: PlacementDef[] = [
  { key: "feed_inline", label: "Home / Popular / Realtime feed card", pages: ["home", "popular", "realtime", "hot"], where: "A card after the 6th organic post, then at most every 12 posts.", density: { firstAfter: 6, every: 12, maxPerPage: 3 }, sizes: "native card (title, 1 line, link)", mobile: true },
  { key: "subpal_feed", label: "SubPal feed / SubPal sponsorship", pages: ["subpal"], where: "After the 6th post in a SubPal, then every 12; or a labelled SubPal sponsor line.", density: { firstAfter: 6, every: 12, maxPerPage: 2 }, sizes: "native card", mobile: true },
  { key: "thread_after_post", label: "Discussion: after the original post", pages: ["thread"], where: "Between the original post and the first reply.", density: { maxPerPage: 1 }, sizes: "native card", mobile: true },
  { key: "thread_long", label: "Discussion: inside long threads", pages: ["thread"], where: "Only in threads with 20+ replies, after every 15 replies.", density: { firstAfter: 15, every: 15, maxPerPage: 2 }, sizes: "native card", mobile: true },
  { key: "country_hub", label: "Country hub", pages: ["country"], where: "Right column of a country page.", density: { maxPerPage: 1 }, sizes: "300×250 or native", mobile: false },
  { key: "topic_hub", label: "Topic hub / discussion side column", pages: ["topic", "thread"], where: "Right column of topic pages and story pages.", density: { maxPerPage: 1 }, sizes: "300×250 or native", mobile: false },
  { key: "home_rail", label: "Desktop sidebar", pages: ["home", "popular", "realtime"], where: "Right sidebar on desktop only.", density: { maxPerPage: 1 }, sizes: "300×250 or native", mobile: false },
  { key: "explore_africa", label: "Discover / Explore Africa", pages: ["explore"], where: "Below the map, once per page.", density: { maxPerPage: 1 }, sizes: "native card", mobile: true },
];
export const PLACEMENT_KEYS = PLACEMENTS.map((p) => p.key);

export type Targeting = { regions?: string[]; countries?: string[]; adminRegions?: string[]; languages?: string[]; subpals?: string[]; topics?: string[]; devices?: ("mobile" | "desktop")[] };
export type AdContext = { edition: string; language: string; subpal?: string; topics?: string[]; device: "mobile" | "desktop"; adminRegion?: string };

/** Empty list = no restriction at that level. Country targeting implies its region; a region list matches any country in it. */
export function matches(t: Targeting | null | undefined, c: AdContext): boolean {
  if (!t) return true;
  const has = (xs?: unknown[]) => Array.isArray(xs) && xs.length > 0;
  const country = c.edition && c.edition !== "ALL" ? c.edition : "";
  if (has(t.countries) && !t.countries!.includes(country)) return false;
  if (has(t.regions) && !(country && t.regions!.includes(regionOf(country) ?? ""))) return false;
  if (has(t.adminRegions) && !(c.adminRegion && t.adminRegions!.includes(c.adminRegion))) return false;
  if (has(t.languages) && !t.languages!.includes(c.language)) return false;
  if (has(t.subpals) && !(c.subpal && t.subpals!.includes(c.subpal))) return false;
  if (has(t.topics) && !(c.topics ?? []).some((x) => t.topics!.includes(x))) return false;
  if (has(t.devices) && !t.devices!.includes(c.device)) return false;
  return true;
}

export function describeTargeting(t: Targeting | null | undefined): string {
  if (!t) return "All Africa, every language";
  const bits = [t.regions?.length ? `regions: ${t.regions.join(", ")}` : "", t.countries?.length ? `countries: ${t.countries.join(", ")}` : "", t.adminRegions?.length ? `admin regions: ${t.adminRegions.join(", ")}` : "",
    t.languages?.length ? `languages: ${t.languages.join(", ")}` : "", t.subpals?.length ? `SubPals: ${t.subpals.join(", ")}` : "", t.topics?.length ? `topics: ${t.topics.join(", ")}` : "", t.devices?.length ? `devices: ${t.devices.join(", ")}` : ""].filter(Boolean);
  return bits.length ? bits.join(" · ") : "All Africa, every language";
}

/** Positions (0-based indexes AFTER which a card goes) for a list of `n` organic items under a placement's density rule. */
export function slotsFor(p: PlacementDef, n: number): number[] {
  const out: number[] = [];
  if (p.density.firstAfter === undefined) return n > 0 ? [0] : [];
  for (let i = p.density.firstAfter; i <= n && out.length < p.density.maxPerPage; i += p.density.every ?? Infinity) out.push(i - 1);
  return out;
}

// ---------------------------------------------------------------- Revive 6 delivery output (ajs.php) → safe card
export type ReviveCreative = { clickUrl: string; imageUrl?: string; text?: string; width?: number; height?: number; beaconUrl?: string; bannerId?: string; campaignId?: string };
/** Revive's ajs.php answers with JavaScript that concatenates an HTML string (`var OX_x = ''; OX_x += "<"+"a href=…"; document.write(OX_x);`).
 *  We never run that script. We rebuild the HTML from its string literals, then keep only a link, an image and a beacon, each limited to
 *  the Revive host (click/beacon) or https (image). Anything else — scripts, iframes, other hosts — is dropped. An empty zone answers
 *  with no banner, which yields null (the slot collapses). */
export function parseReviveAjs(js: string, reviveHost: string): ReviveCreative | null {
  const lits = [...js.matchAll(/\+=\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+);/g)].map((m) => [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]).join(""));
  const html = lits.join("").replace(/\\(['"\\/])/g, "$1").replace(/\\n/g, "\n").replace(/&amp;/g, "&");
  if (!html.trim()) return null;
  if (/<\s*(script|iframe|object|embed)/i.test(html)) return null;
  const href = /<a\s[^>]*href=['"]([^'"]+)['"]/i.exec(html)?.[1];
  const imgs = [...html.matchAll(/<img\s[^>]*src=['"]([^'"]+)['"][^>]*>/gi)].map((m) => ({ src: m[1], tag: m[0] }));
  const okHost = (u?: string) => { try { return !!u && new URL(u).host === reviveHost && /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
  if (!href || !okHost(href)) return null;
  const beacon = imgs.find((i) => /\/lg\.php\?/.test(i.src) && okHost(i.src))?.src;
  const img = imgs.find((i) => !/\/lg\.php\?/.test(i.src) && /^https:\/\//.test(i.src));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || undefined;
  const params = decodeURIComponent(href).match(/bannerid=(\d+).*?(?:campaignid=(\d+))?/);
  const dim = (k: string) => { const v = img && new RegExp(`${k}=['"]?(\\d+)`, "i").exec(img.tag)?.[1]; return v ? Number(v) : undefined; };
  return { clickUrl: href, imageUrl: img?.src, text, width: dim("width"), height: dim("height"), beaconUrl: beacon, bannerId: params?.[1], campaignId: params?.[2] };
}

// ISSUE-16 ad serving. Every slot passes ALL of these gates or collapses (renders nothing):
//   1. the AD_SLOTS_DISABLED switch is off and the placement row is enabled and approved by a person;
//   2. the viewer is a person: automated user agents get nothing (they could never be billed or counted), staff see a preview label;
//   3. a creative matches the targeting (edition country / region / language / SubPal / topic / device);
//   4. the creative is either a NON-BILLABLE test creative (labelled "test placement") or, only when ADS_LIVE_AUTHORIZED=true and
//      Revive is reachable, a Revive banner parsed into a safe card (lib/ads/inventory.parseReviveAjs).
// Resident AI agents never browse pages, so no agent can ever produce an impression. Every event is stored with billable=false
// until paid advertising is authorised. Revive problems (down, slow, empty zone) collapse the slot; they never break a page.
import { pb, q, type Rec } from "../pb";
import { getSwitch } from "../settings";
import type { Tenant } from "../tenant";
import { isAutomatedAgent } from "../engagement";
import { PLACEMENTS, matches, parseReviveAjs, type AdContext, type ReviveCreative, type Targeting } from "./inventory";

export type Creative = { source: "test" | "revive"; ref: string; title: string; body?: string; advertiser: string; clickHref: string; imageUrl?: string; beaconUrl?: string; testLabel: boolean };

export const reviveState = () => {
  const url = process.env.REVIVE_DELIVERY_URL ?? "";
  return { configured: !!url, authorised: process.env.ADS_LIVE_AUTHORIZED === "true", url };
};

async function fromRevive(zone: string, c: AdContext): Promise<ReviveCreative | null> {
  const r = reviveState();
  if (!r.configured || !r.authorised || !/^\d{1,8}$/.test(zone)) return null;
  try {
    const u = new URL(`${r.url.replace(/\/$/, "")}/www/delivery/ajs.php`);
    u.search = new URLSearchParams({ zoneid: zone, charset: "UTF-8", source: `${c.edition}|${c.language}|${c.subpal ?? ""}`, target: "_blank" }).toString();
    const res = await fetch(u, { signal: AbortSignal.timeout(800), cache: "no-store" });
    if (!res.ok) return null;
    return parseReviveAjs(await res.text(), u.host);
  } catch { return null; }
}

export async function pickCreative(t: Tenant, placementKey: string, c: AdContext, h: Headers | null): Promise<{ creative: Creative; placement: Rec } | null> {
  if (h && isAutomatedAgent(h.get("user-agent") ?? "")) return null;
  if (!PLACEMENTS.some((p) => p.key === placementKey)) return null;
  try {
    if (await getSwitch(t.id, "AD_SLOTS_DISABLED")) return null;
    const pl = await pb.first("sponsor_placements", `tenant_id=${q(t.id)} && position_key=${q(placementKey)} && enabled=true`);
    if (!pl || !pl.approved_by || !matches(pl.targeting as Targeting, c)) return null;
    const live = pl.revive_zone_id ? await fromRevive(String(pl.revive_zone_id), c) : null;
    if (live) return { placement: pl, creative: { source: "revive", ref: `revive:${live.bannerId ?? "?"}`, title: live.text ?? "Sponsored", advertiser: "Sponsor", clickHref: live.clickUrl, imageUrl: live.imageUrl, beaconUrl: live.beaconUrl, testLabel: false } };
    const tests = await pb.list("ad_test_creatives", { filter: `tenant_id=${q(t.id)} && status='active'`, sort: "created", perPage: 50 });
    const ok = tests.filter((x) => (Array.isArray(x.placement_keys) ? x.placement_keys : []).includes(placementKey) && matches(x.targeting as Targeting, c));
    if (!ok.length) return null;
    const x = ok[Math.floor(Date.now() / 60_000) % ok.length]; // rotate once a minute, deterministic within the minute
    return { placement: pl, creative: { source: "test", ref: x.id, title: x.title, body: x.body, advertiser: x.advertiser_label, clickHref: `/api/v1/ads/click?c=${x.id}&p=${placementKey}`, testLabel: true } };
  } catch { return null; }
}

export async function recordAdEvent(t: Tenant, e: { placement: string; ref: string; source: "test" | "revive"; event: "served" | "click"; staff: boolean; edition: string; language: string; page: string }, h: Headers | null) {
  const audience = h && isAutomatedAgent(h.get("user-agent") ?? "") ? "bot" : e.staff ? "staff" : "human";
  await pb.create("ad_events", { tenant_id: t.id, placement_key: e.placement, creative_ref: e.ref, source: e.source, event: e.event, audience, edition: e.edition.slice(0, 3),
    language: e.language.slice(0, 10), page: e.page.slice(0, 200), billable: false }).catch(() => {});
}

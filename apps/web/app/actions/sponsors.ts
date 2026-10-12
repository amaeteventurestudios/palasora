"use server";
// ISSUE-16/18 staff actions for advertising inventory and the sponsor pipeline. Permission per action (Advertising & sponsors module),
// reasons where an action changes what the public sees, and an audit event for everything.
import { revalidatePath } from "next/cache";
import { getTenant } from "@/lib/tenant";
import { can, getSession } from "@/lib/session";
import { pb, pbDate, q } from "@/lib/pb";
import { audit } from "@/lib/audit";
import { safeExternalUrl } from "@/lib/url-safety";
import { forwardInquiry, syncStage } from "@/lib/crm";
import { PLACEMENT_KEYS, type Targeting } from "@/lib/ads/inventory";
import type { Stage } from "@/lib/crm/espo";
import type { Action } from "@/lib/access/permissions";
import type { ActionState } from "./member";

const fail = (message: string): ActionState => ({ ok: false, message });
const str = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").slice(0, max).trim();
const list = (v: string) => v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
const STAGES: Stage[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];

async function staff(action: Action) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session || !can(session, "advertising", action)) throw new Error("FORBIDDEN");
  return { tenant, session };
}
function targetingFrom(f: FormData): Targeting {
  const up = (k: string) => list(str(f, k, 600)).map((x) => x.toUpperCase()).filter((x) => /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(x));
  return { regions: list(str(f, "t_regions", 300)).map((r) => r.replace(/_/g, " ")).filter((r) => /^(North|West|Central|East|Southern) Africa$/.test(r)), countries: up("t_countries").filter((x) => x.length === 2),
    adminRegions: up("t_admin"), languages: list(str(f, "t_languages", 100)).filter((l) => /^[a-z]{2,3}$/.test(l)), subpals: list(str(f, "t_subpals", 300)).filter((s) => /^[a-z0-9-]{2,60}$/.test(s)),
    topics: list(str(f, "t_topics", 300)).filter((s) => /^[a-z0-9-]{2,60}$/.test(s)), devices: list(str(f, "t_devices", 30)).filter((d): d is "mobile" | "desktop" => d === "mobile" || d === "desktop") };
}

/** Placement settings: zone id, targeting, enable. Enabling needs Advertising → approve and records who approved it. */
export async function savePlacement(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("edit");
  const key = str(f, "key", 40);
  if (!PLACEMENT_KEYS.includes(key)) return fail("Unknown placement.");
  const zone = str(f, "zone", 8), enable = f.get("enabled") === "on", reason = str(f, "reason", 300);
  if (zone && !/^\d{1,8}$/.test(zone)) return fail("A Revive zone id is a number from the Revive admin (Inventory → Zones).");
  if (enable && !can(session, "advertising", "approve")) return fail("Turning a placement on needs the Advertising → approve permission.");
  if (enable && reason.length < 10) return fail("Write why this placement may show (at least 10 characters).");
  const row = await pb.first("sponsor_placements", `tenant_id=${q(tenant.id)} && position_key=${q(key)}`);
  const data = { revive_zone_id: zone, targeting: targetingFrom(f), enabled: enable, approved_by: enable ? session.user.id : "", disclosure: "Sponsored" };
  const saved = row ? await pb.update("sponsor_placements", row.id, data) : await pb.create("sponsor_placements", { tenant_id: tenant.id, position_key: key, ...data });
  await audit(tenant.id, session.user.id, "ads.placement_saved", "sponsor_placements", saved.id, { key, zone, enabled: enable, reason, targeting: data.targeting });
  revalidatePath("/admin/advertising");
  return { ok: true, message: enable ? `${key} is on (non-billable until paid advertising is authorised).` : `${key} saved (off).` };
}

export async function saveTestCreative(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("create");
  const title = str(f, "title", 90), advertiser = str(f, "advertiser", 80), url = str(f, "click_url", 500);
  if (title.length < 4 || !advertiser) return fail("Give the creative a title (4+ characters) and the advertiser's name.");
  const dest = safeExternalUrl(url);
  if (!dest || !dest.startsWith("https://")) return fail("The link must be a public https:// address.");
  const placements = f.getAll("placements").map(String).filter((p) => PLACEMENT_KEYS.includes(p));
  if (!placements.length) return fail("Choose at least one placement.");
  const c = await pb.create("ad_test_creatives", { tenant_id: tenant.id, title, body: str(f, "body", 200), advertiser_label: advertiser, click_url: dest, placement_keys: placements,
    targeting: targetingFrom(f), status: "active", created_by: session.user.id });
  await audit(tenant.id, session.user.id, "ads.test_creative_created", "ad_test_creatives", c.id, { placements, title });
  revalidatePath("/admin/advertising");
  return { ok: true, message: "Test creative active. It is labelled “Test placement · not a paid ad” wherever it shows." };
}

export async function setCreativeStatus(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("edit");
  const c = await pb.first("ad_test_creatives", `tenant_id=${q(tenant.id)} && id=${q(str(f, "id", 30))}`);
  const to = str(f, "status", 10);
  if (!c || !["active", "paused"].includes(to)) return fail("Not found.");
  await pb.update("ad_test_creatives", c.id, { status: to });
  await audit(tenant.id, session.user.id, `ads.test_creative_${to}`, "ad_test_creatives", c.id);
  revalidatePath("/admin/advertising");
  return { ok: true, message: to === "paused" ? "Paused; it no longer shows." : "Active again." };
}

// ---------------------------------------------------------------- sponsor pipeline (EspoCRM stays the CRM of record)
export async function updateInquiry(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("edit");
  const inq = await pb.first("sponsor_inquiries", `tenant_id=${q(tenant.id)} && id=${q(str(f, "id", 30))}`);
  if (!inq) return fail("Inquiry not found.");
  const stage = str(f, "stage", 20) as Stage, note = str(f, "note", 2000), follow = str(f, "follow_up_at", 10);
  if (!STAGES.includes(stage)) return fail("Unknown stage.");
  if (follow && !/^\d{4}-\d{2}-\d{2}$/.test(follow)) return fail("Use a date like 2026-11-01 for the follow-up.");
  const changed = stage !== (inq.pipeline_stage || "new");
  if (changed && note.length < 5) return fail("Add a short note saying why the stage changed.");
  if ((stage === "won" || stage === "lost") && !can(session, "advertising", "approve")) return fail("Marking a deal won or lost needs Advertising → approve.");
  const notes = [...(Array.isArray(inq.notes) ? inq.notes : []), ...(note ? [{ at: pbDate(), by: session.user.id, text: `${changed ? `[${inq.pipeline_stage || "new"} → ${stage}] ` : ""}${note}` }] : [])];
  const owner = str(f, "owner", 40);
  const updated = await pb.update("sponsor_inquiries", inq.id, { pipeline_stage: stage, notes, follow_up_at: follow ? pbDate(new Date(`${follow}T09:00:00Z`)) : inq.follow_up_at ?? "",
    owner_user_id: owner || inq.owner_user_id || session.user.id, country: str(f, "country", 2).toUpperCase() || inq.country || "", package: str(f, "package", 120) || inq.package || "",
    target_audience: str(f, "audience", 300) || inq.target_audience || "" });
  await audit(tenant.id, session.user.id, "sponsor.inquiry_updated", "sponsor_inquiries", inq.id, { from: inq.pipeline_stage || "new", to: stage, follow: follow || null });
  const sync = changed ? await syncStage(updated, stage) : { synced: false, error: "" };
  revalidatePath("/admin/sponsors");
  return { ok: true, message: `Saved in Palavva.${changed ? (sync.synced ? " EspoCRM updated." : ` ${sync.error}`) : ""}` };
}

export async function retryForward(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("edit");
  const inq = await pb.first("sponsor_inquiries", `tenant_id=${q(tenant.id)} && id=${q(str(f, "id", 30))}`);
  if (!inq) return fail("Not found.");
  const r = await forwardInquiry(inq);
  await audit(tenant.id, session.user.id, "sponsor.forward_retried", "sponsor_inquiries", inq.id, { state: r.state });
  revalidatePath("/admin/sponsors");
  return { ok: r.state === "FORWARDED" || r.state === "DUPLICATE", message: { FORWARDED: "Sent to EspoCRM.", DUPLICATE: "Linked to the earlier inquiry from the same address.", NOT_CONFIGURED: "EspoCRM is not configured; the inquiry stays safely in Palavva.", FORWARD_FAILED: `Not sent: ${r.error}` }[r.state] };
}

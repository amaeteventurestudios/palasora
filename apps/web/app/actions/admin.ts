"use server";
import { invalidateFeedCache } from "@/lib/repo/pieces";
// Command Center actions. Every action: server-side role check, tenant scope, audit event.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenant, type Tenant } from "@/lib/tenant";
import { can, getSession, type Session } from "@/lib/session";
import type { Action } from "@/lib/access/permissions";
import { pb, pbDate, q, type Rec } from "@/lib/pb";
import { audit } from "@/lib/audit";
import { SWITCHES, getSwitch, type SwitchKey } from "@/lib/settings";
import { writeEvent } from "@/lib/analytics-server";
import { editorialFetch } from "@/lib/editorial-client";
import { forwardInquiry } from "@/lib/crm";
import type { ActionState } from "./member";
import { emitEvent } from "@/lib/repo/thread";
import { STATE_LABEL, checkDecision } from "@/lib/business/rules";

const s = (f: FormData, k: string, max = 4000) => String(f.get(k) ?? "").slice(0, max).trim();
const fail = (message: string): ActionState => ({ ok: false, message });

/** ISSUE-23: every action names the module permission it needs (deny by default, MFA where the role requires it). */
async function staff(module: string, action: Action): Promise<{ tenant: Tenant; session: Session }> {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) redirect("/auth/sign-in?next=/admin");
  if (!can(session, module, action)) throw new Error("FORBIDDEN");
  return { tenant, session };
}

async function ownPiece(tenant: Tenant, id: string): Promise<Rec | null> {
  if (!/^[a-z0-9]{10,20}$/.test(id)) return null;
  return pb.first("editorial_pieces", `tenant_id=${q(tenant.id)} && id=${q(id)}`);
}

function snapshot(p: Rec) {
  return { headline: p.headline, lede: p.lede, body_blocks_json: p.body_blocks_json, review_status: p.review_status, revision: p.revision };
}

// ---------------- Editorial decisions ----------------

export async function setSwitch(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("operations", "administer");
  const key = s(f, "key", 40) as SwitchKey;
  if (!SWITCHES.includes(key)) return fail("Unknown switch.");
  const value = s(f, "value", 5) === "true";
  const reason = s(f, "reason", 500);
  if (reason.length < 3) return fail("Give a reason for the change.");
  const row = await pb.first("tenant_settings", `tenant_id=${q(tenant.id)} && key=${q(key)}`);
  if (row) await pb.update("tenant_settings", row.id, { value, changed_by: session.user.id, reason });
  else await pb.create("tenant_settings", { tenant_id: tenant.id, key, value, changed_by: session.user.id, reason });
  await audit(tenant.id, session.user.id, "settings.switch", "tenant_settings", key, { value, reason });
  revalidatePath("/admin", "layout");
  return { ok: true, message: `${key} set to ${value}.` };
}

// ---------------- Sources ----------------

export async function moderate(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("moderation", "approve");
  const kind = s(f, "kind", 20), id = s(f, "id", 30), action = s(f, "action", 20), note = s(f, "note", 1000);
  if (kind === "report") {
    const r = await pb.first("moderation_reports", `tenant_id=${q(tenant.id)} && id=${q(id)}`);
    if (!r) return fail("Not found.");
    if (action === "quarantine" && r.target_type === "comment") {
      const c = await pb.first("comments", `tenant_id=${q(tenant.id)} && id=${q(r.target_id)}`);
      if (c) await pb.update("comments", c.id, { moderation_status: "quarantined" });
    }
    await pb.update("moderation_reports", r.id, { status: action === "dismiss" ? "dismissed" : "actioned", assigned_to: session.user.id, resolution: `${action}: ${note}` });
    await audit(tenant.id, session.user.id, `moderation.report_${action}`, "moderation_reports", r.id, { target: r.target_type });
  } else if (kind === "comment") {
    const c = await pb.first("comments", `tenant_id=${q(tenant.id)} && id=${q(id)}`);
    if (!c) return fail("Not found.");
    const patch: Record<string, string> = action === "approve" ? { approval_state: "approved", moderation_status: "visible" }
      : action === "restore" ? { moderation_status: "visible" } : action === "remove" ? { moderation_status: "removed" } : { moderation_status: "quarantined" };
    await pb.update("comments", c.id, patch);
    if (c.author_kind === "human") {
      const n = await pb.count("comments", `tenant_id=${q(tenant.id)} && discussion_id=${q(c.discussion_id)} && author_kind='human' && approval_state='approved' && moderation_status='visible'`);
      await pb.update("discussions", c.discussion_id, { human_comment_count: n });
      if (c.piece_id) await pb.update("editorial_pieces", c.piece_id, { human_comment_count: n });
    }
    await audit(tenant.id, session.user.id, `moderation.comment_${action}`, "comments", c.id, { note: note.slice(0, 200) });
  } else if (kind === "correction_request") {
    const r = await pb.first("correction_requests", `tenant_id=${q(tenant.id)} && id=${q(id)}`);
    if (!r) return fail("Not found.");
    await pb.update("correction_requests", r.id, { status: action === "accept" ? "accepted" : "declined" });
    await audit(tenant.id, session.user.id, `correction_request.${action}`, "correction_requests", r.id);
  } else if (kind === "submission") {
    const r = await pb.first("user_submissions", `tenant_id=${q(tenant.id)} && id=${q(id)}`);
    if (!r) return fail("Not found.");
    await pb.update("user_submissions", r.id, { review_state: action === "accept" ? "accepted" : "declined" });
    await audit(tenant.id, session.user.id, `submission.${action}`, "user_submissions", r.id);
  } else return fail("Unknown item.");
  revalidatePath("/", "layout");
  invalidateFeedCache(tenant.id);
  return { ok: true, message: "Done." };
}

// ---------------- Commerce / businesses ----------------

export async function retryInquiry(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("advertising", "edit");
  const inq = await pb.first("sponsor_inquiries", `tenant_id=${q(tenant.id)} && id=${q(s(f, "id", 30))}`);
  if (!inq) return fail("Not found.");
  const r = await forwardInquiry(inq);
  await audit(tenant.id, session.user.id, "inquiry.forward_retry", "sponsor_inquiries", inq.id, { state: r.state });
  revalidatePath("/admin/sponsors");
  return { ok: r.state === "FORWARDED", message: `Forward state: ${r.state}${r.error ? ` (${r.error})` : ""}` };
}

export async function markInquiryManual(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("advertising", "edit");
  const inq = await pb.first("sponsor_inquiries", `tenant_id=${q(tenant.id)} && id=${q(s(f, "id", 30))}`);
  if (!inq) return fail("Not found.");
  await pb.update("sponsor_inquiries", inq.id, { forward_state: "MANUAL" });
  await audit(tenant.id, session.user.id, "inquiry.manual", "sponsor_inquiries", inq.id);
  revalidatePath("/admin/sponsors");
  return { ok: true, message: "Marked for manual follow-up." };
}

/** ISSUE-19 one staff decision on a business: verify / request information / reject / suspend / reopen. Rules in lib/business/rules.ts:
 *  right role, a note, evidence links for verification, demo businesses never verified. Every decision is kept with its evidence. */
export async function businessDecision(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("businesses", "edit");
  const b = await pb.first("businesses", `tenant_id=${q(tenant.id)} && id=${q(s(f, "id", 30))}`);
  if (!b) return fail("Not found.");
  const evidence = [1, 2, 3].map((i) => ({ url: s(f, `evidence_url_${i}`, 500), note: s(f, `evidence_note_${i}`, 500) })).filter((e) => e.url || e.note);
  const note = s(f, "note", 2000), action = s(f, "action", 20), from = String(b.verification_state || "unverified");
  const d = checkDecision({ action, state: from, isDemo: !!b.is_demo, note, evidence, can: (role) => can(session, "businesses", role === "tenant_admin" ? "approve" : "edit") });
  if (!d.ok) return fail(d.message);
  await pb.update("businesses", b.id, { verification_state: d.to, ...(d.to === "verified" ? { verified_at: pbDate(), verified_by: session.user.id } : {}),
    ...(d.to === "suspended" || d.to === "rejected" ? { verified_at: "", verified_by: "" } : {}) });
  await pb.create("business_verifications", { tenant_id: tenant.id, business_id: b.id, action, from_state: from, to_state: d.to, evidence, note, actor_user_id: session.user.id });
  await audit(tenant.id, session.user.id, `business.${action}`, "businesses", b.id, { from, to: d.to, evidence: evidence.length });
  revalidatePath("/", "layout");
  invalidateFeedCache(tenant.id);
  return { ok: true, message: `${b.name}: ${STATE_LABEL[d.to].toLowerCase()}.` };
}

// ---------------- Tenancy (platform admin only) ----------------

export async function updateBranding(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("settings", "administer");
  // Tenant admins may edit only their own tenant; the tenant is resolved from Host, never from the form.
  const hex = /^#[0-9a-fA-F]{6}$/;
  const wordmark = s(f, "wordmark_text", 60), masthead = s(f, "masthead_color", 7), accent = s(f, "accent_color", 7), primary = s(f, "primary_color", 7);
  if (!wordmark || ![masthead, accent, primary].every((c) => hex.test(c))) return fail("Use a wordmark and 6-digit hex colors like #1B2030.");
  // Contrast guard: masthead must keep white wordmark text readable (>= 4.5:1).
  const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  if (1.05 / (lum(masthead) + 0.05) < 4.5) return fail("Masthead color is too light for white text (needs 4.5:1 contrast).");
  const t = await pb.first("tenants", `id=${q(tenant.id)}`);
  if (!t) return fail("Not found.");
  await pb.update("tenants", t.id, { branding_json: { ...(t.branding_json ?? {}), wordmark_text: wordmark, masthead_color: masthead, accent_color: accent, primary_color: primary } });
  await audit(tenant.id, session.user.id, "tenant.branding_updated", "tenants", t.id, { masthead, accent, primary });
  revalidatePath("/", "layout");
  invalidateFeedCache(tenant.id);
  return { ok: true, message: "Branding saved. Reload to see it (tenant cache refreshes within 30 seconds)." };
}

export async function opsAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("operations", "administer");
  const action = s(f, "action", 30);
  if (action === "etl") {
    const r = await editorialFetch<Record<string, number>>("/analytics/etl", { method: "POST" }, 60000);
    await audit(tenant.id, session.user.id, "ops.analytics_etl", "system", "etl", r ?? {});
    return r ? { ok: true, message: `Aggregation done: ${r.rows} rows updated.` } : fail("Editorial service unavailable.");
  }
  if (action === "reindex") {
    const r = await editorialFetch<{ indexed: number }>("/reindex", { method: "POST" }, 60000);
    return r ? { ok: true, message: `Search index rebuilt: ${r.indexed} published pieces.` } : fail("Editorial service unavailable.");
  }
  if (action === "probe") {
    const r = await editorialFetch<Record<string, unknown>>("/provider/probe", { method: "POST" }, 15000);
    return r ? { ok: Boolean(r.reachable), message: r.reachable ? `Qwen reachable (${r.latency_ms} ms).` : "AI generation is paused or unreachable. Published content remains available." } : fail("Editorial service unavailable.");
  }
  if (action === "requeue") {
    const id = s(f, "job_id", 40);
    const r = await editorialFetch<{ requeued: boolean }>(`/jobs/${encodeURIComponent(id)}/requeue`, { method: "POST" });
    await audit(tenant.id, session.user.id, "ops.job_requeue", "jobs", id);
    return r?.requeued ? { ok: true, message: "Job requeued." } : fail("Could not requeue.");
  }
  return fail("Unknown action.");
}

// ---------------- v1.3 conversations ----------------

export async function pauseThread(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("agents", "edit");
  const id = s(f, "piece_id", 30);
  const paused = s(f, "paused", 5) === "true";
  const piece = await ownPiece(tenant, id);
  if (!piece) return fail("Not found.");
  const r = await editorialFetch("/conversations/" + id + "/pause", { method: "POST", body: JSON.stringify({ tenant_id: tenant.id, paused, reason: s(f, "reason", 200) }) });
  await audit(tenant.id, session.user.id, paused ? "conversation.paused" : "conversation.resumed", "editorial_pieces", id);
  revalidatePath("/admin/conversations");
  return r ? { ok: true, message: paused ? "Thread paused: no further AI replies." : "Thread resumed." } : fail("Editorial service unavailable.");
}

export async function unpublishPiece(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("content", "delete");
  const piece = await ownPiece(tenant, s(f, "piece_id", 30));
  const reason = s(f, "reason", 500);
  if (!piece || piece.review_status !== "published") return fail("Only published topics can be unpublished.");
  if (reason.length < 5) return fail("Give a reason.");
  await pb.update("editorial_pieces", piece.id, { review_status: "held", thread_state: "closed" });
  await pb.create("moderation_decisions", { tenant_id: tenant.id, scope: "topic", target_id: piece.id, piece_id: piece.id, decision: "hold", tier: "uncertain",
    ruleset_version: "human-override", rules: {}, reasons: `Unpublished by editor: ${reason}`, actor: session.user.id, overridden: false });
  await emitEvent(tenant, { event_type: "thread_paused", piece_id: piece.id, author_kind: "system", payload: { reason: "unpublished" } });
  await audit(tenant.id, session.user.id, "piece.unpublished", "editorial_pieces", piece.id, { reason });
  invalidateFeedCache(tenant.id);
  revalidatePath("/", "layout");
  return { ok: true, message: "Unpublished. The topic is held and its thread closed." };
}

// ---------------- v1.3 translation QA & geography QA ----------------

export async function translationDecision(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("content", "approve");
  const loc = await pb.first("localizations", `tenant_id=${q(tenant.id)} && id=${q(s(f, "id", 30))}`);
  if (!loc) return fail("Not found.");
  const action = s(f, "action", 20);
  if (action === "approve") await pb.update("localizations", loc.id, { status: "reviewed", reviewer_id: session.user.id });
  else if (action === "block") await pb.update("localizations", loc.id, { status: "blocked", reviewer_id: session.user.id });
  else if (action === "correct") {
    // Correcting a failed translation starts from the rejected output kept in QA.
    const fields = { ...(loc.qa?.rejected_output ?? {}), ...(loc.fields ?? {}) } as Record<string, string>;
    for (const k of Object.keys(fields)) { const v = s(f, `field_${k}`, 4000); if (v) fields[k] = v; }
    await pb.update("localizations", loc.id, { fields, status: "reviewed", reviewer_id: session.user.id, qa: { ...(loc.qa ?? {}), corrected_by_editor: true } });
  } else return fail("Unknown action.");
  for (const r of await pb.list("translation_reports", { filter: `tenant_id=${q(tenant.id)} && localization_id=${q(loc.id)} && status='open'`, perPage: 50 })) await pb.update("translation_reports", r.id, { status: "actioned" });
  await audit(tenant.id, session.user.id, `translation.${action}`, "localizations", loc.id, { locale: loc.locale });
  invalidateFeedCache(tenant.id);
  revalidatePath("/", "layout");
  return { ok: true, message: `Translation ${action === "approve" ? "marked reviewed" : action === "block" ? "blocked (readers see the original)" : "corrected and marked reviewed"}.` };
}


"use server";
import { invalidateFeedCache } from "@/lib/repo/pieces";
// Command Center actions. Every action: server-side role check, tenant scope, audit event.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenant, type Tenant } from "@/lib/tenant";
import { getSession, hasRole, type Role, type Session } from "@/lib/session";
import { pb, pbDate, q, type Rec } from "@/lib/pb";
import { audit } from "@/lib/audit";
import { SWITCHES, getSwitch, type SwitchKey } from "@/lib/settings";
import { writeEvent } from "@/lib/analytics-server";
import { editorialFetch } from "@/lib/editorial-client";
import { forwardInquiry } from "@/lib/crm";
import type { ActionState } from "./member";
import { emitEvent } from "@/lib/repo/thread";

const s = (f: FormData, k: string, max = 4000) => String(f.get(k) ?? "").slice(0, max).trim();
const fail = (message: string): ActionState => ({ ok: false, message });

async function staff(min: Role): Promise<{ tenant: Tenant; session: Session }> {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) redirect("/auth/sign-in?next=/admin");
  if (!hasRole(session, min)) throw new Error("FORBIDDEN");
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

export async function decidePiece(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("reviewer");
  const piece = await ownPiece(tenant, s(f, "piece_id", 30));
  if (!piece) return fail("Not found.");
  const decision = s(f, "decision", 20);
  const reason = s(f, "reason", 3000);
  const expected = Number(s(f, "expected_revision", 10));
  if (expected !== (piece.revision ?? 1)) return fail("This draft changed since you opened it (revision conflict). Reload to review the latest version.");
  const risk = piece.risk_tier || "low";
  const isEditor = hasRole(session, "editor");

  if (decision === "approve") {
    if (!["needs_review", "changes_requested", "held"].includes(piece.review_status)) return fail("Only drafts in review can be approved.");
    if (risk !== "low" && !isEditor) return fail("Medium and high-risk pieces need an editor's approval.");
    if (await getSwitch(tenant.id, "PUBLISHING_PAUSED")) return fail("Publishing is paused for this tenant. Resume it in Settings first.");
    if (piece.claim_check_status === "FAIL") return fail("Claim check failed (unknown or unsupported citations). Request changes instead of publishing.");
    if (piece.claim_check_status === "NEEDS_REVIEW" && reason.length < 10) return fail("Validation raised flags. Write a short reason (10+ characters) confirming you checked them.");
    // Rights must still be valid for every source behind the cluster at publish time.
    if (piece.cluster_id) {
      const links = await pb.list("cluster_sources", { filter: `tenant_id=${q(tenant.id)} && cluster_id=${q(piece.cluster_id)}`, perPage: 50 });
      for (const l of links) {
        const item = await pb.get("source_items", l.source_item_id);
        const src = item ? await pb.get("sources", item.source_id) : null;
        if (!src || src.tenant_id !== tenant.id || src.rights_status !== "approved") return fail("A source behind this story no longer has approved rights. It cannot be published.");
      }
    }
    await pb.create("editorial_reviews", { tenant_id: tenant.id, piece_id: piece.id, decision: "approve", reviewer_id: session.user.id, reason, risk_tier: risk,
      claims_check_hash: piece.claim_check_status, expected_revision: expected });
    const now = pbDate();
    await pb.update("editorial_pieces", piece.id, { review_status: "published", reviewer_id: session.user.id, published_at: now,
      first_published_at: piece.first_published_at || now, material_updated_at: now });
    // AI contributions and claims become public only now, with the approved piece.
    const pending = await pb.list("comments", { filter: `tenant_id=${q(tenant.id)} && piece_id=${q(piece.id)} && author_kind='editorial_ai' && approval_state='pending'`, perPage: 10 });
    for (const c of pending) await pb.update("comments", c.id, { approval_state: "approved" });
    if (piece.cluster_id) {
      const claims = await pb.list("evidence_claims", { filter: `tenant_id=${q(tenant.id)} && cluster_id=${q(piece.cluster_id)}`, perPage: 50 });
      for (const c of claims) if (c.verification_status === "needs_review") await pb.update("evidence_claims", c.id, { verification_status: "supported" });
      await pb.update("story_clusters", piece.cluster_id, { status: "published" });
    }
    await pb.create("piece_revisions", { tenant_id: tenant.id, piece_id: piece.id, revision: piece.revision ?? 1, change_summary: "Published after review",
      previous_snapshot: snapshot(piece), approved_by: session.user.id, approved_at: now, is_public_correction: false });
    await audit(tenant.id, session.user.id, "piece.approved_published", "editorial_pieces", piece.id, { risk, reason: reason.slice(0, 200) }, piece.revision ?? 1);
    await writeEvent(tenant.id, { event_name: "story_published", story_id: piece.id });
    await editorialFetch("/reindex", { method: "POST" });
  } else if (["request_changes", "hold", "reject"].includes(decision)) {
    if (reason.length < 3) return fail("Add a short reason so the history is clear.");
    const status = { request_changes: "changes_requested", hold: "held", reject: "rejected" }[decision]!;
    await pb.create("editorial_reviews", { tenant_id: tenant.id, piece_id: piece.id, decision, reviewer_id: session.user.id, reason, risk_tier: risk, expected_revision: expected });
    await pb.update("editorial_pieces", piece.id, { review_status: status });
    await audit(tenant.id, session.user.id, `piece.${decision}`, "editorial_pieces", piece.id, { reason: reason.slice(0, 200) }, expected);
  } else if (decision === "retract") {
    if (!isEditor) return fail("Only editors can retract.");
    if (piece.review_status !== "published") return fail("Only published pieces can be retracted.");
    if (reason.length < 10) return fail("Explain the retraction (10+ characters).");
    await pb.create("editorial_reviews", { tenant_id: tenant.id, piece_id: piece.id, decision: "retract", reviewer_id: session.user.id, reason, risk_tier: risk, expected_revision: expected });
    await pb.update("editorial_pieces", piece.id, { review_status: "retracted", revision: expected + 1 });
    await pb.create("corrections", { tenant_id: tenant.id, piece_id: piece.id, summary: `Retracted: ${reason}`, public_at: pbDate(), status: "published" });
    await audit(tenant.id, session.user.id, "piece.retracted", "editorial_pieces", piece.id, { reason: reason.slice(0, 200) }, expected);
    await editorialFetch("/reindex", { method: "POST" });
  } else return fail("Unknown decision.");
  revalidatePath("/", "layout");
  invalidateFeedCache(tenant.id);
  return { ok: true, message: `Decision recorded: ${decision.replace("_", " ")}.` };
}

/** Edit draft text (before publication) or publish a correction (after). Both bump the revision. */
export async function editPiece(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("editor");
  const piece = await ownPiece(tenant, s(f, "piece_id", 30));
  if (!piece) return fail("Not found.");
  const expected = Number(s(f, "expected_revision", 10));
  if (expected !== (piece.revision ?? 1)) return fail("This piece changed since you opened it (revision conflict). Reload first.");
  const headline = s(f, "headline", 300), lede = s(f, "lede", 1200), what = s(f, "what", 3000), why = s(f, "why", 3000);
  if (!headline) return fail("Headline is required.");
  const body = { ...(piece.body_blocks_json ?? {}) };
  const keepIds = (blocks: { claim_ids?: string[] }[] | undefined) => blocks?.[0]?.claim_ids ?? [];
  body.what_happened = what ? [{ text: what, claim_ids: keepIds(body.what_happened) }] : body.what_happened;
  body.why_it_matters = why ? [{ text: why, claim_ids: keepIds(body.why_it_matters) }] : body.why_it_matters;
  const isCorrection = piece.review_status === "published";
  const summary = s(f, "correction_summary", 1000);
  if (isCorrection && summary.length < 10) return fail("Describe the correction for readers (10+ characters).");
  const rev = expected + 1;
  const now = pbDate();
  if (isCorrection) {
    await pb.create("editorial_reviews", { tenant_id: tenant.id, piece_id: piece.id, decision: "correct", reviewer_id: session.user.id, reason: summary, risk_tier: piece.risk_tier || "low", expected_revision: expected });
  }
  const revision = await pb.create("piece_revisions", { tenant_id: tenant.id, piece_id: piece.id, revision: expected, change_summary: isCorrection ? summary : "Editor edit before publication",
    previous_snapshot: snapshot(piece), approved_by: session.user.id, approved_at: now, is_public_correction: isCorrection });
  await pb.update("editorial_pieces", piece.id, { headline, lede, body_blocks_json: body, revision: rev, ...(isCorrection ? { material_updated_at: now, correction_note: summary } : {}) });
  if (isCorrection) {
    await pb.create("corrections", { tenant_id: tenant.id, piece_id: piece.id, revision_id: revision.id, summary, public_at: now, status: "published" });
    await writeEvent(tenant.id, { event_name: "correction_published", story_id: piece.id });
    await editorialFetch("/reindex", { method: "POST" });
  }
  await audit(tenant.id, session.user.id, isCorrection ? "piece.corrected" : "piece.edited", "editorial_pieces", piece.id, {}, rev);
  revalidatePath("/", "layout");
  invalidateFeedCache(tenant.id);
  return { ok: true, message: isCorrection ? "Correction published. The share image and page now show the new revision." : "Draft updated." };
}

// ---------------- Kill switches ----------------

export async function setSwitch(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("tenant_admin");
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

export async function sourceAction(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("editor");
  const id = s(f, "source_id", 30);
  const src = await pb.first("sources", `tenant_id=${q(tenant.id)} && id=${q(id)}`);
  if (!src) return fail("Not found.");
  const action = s(f, "action", 20);
  if (action === "test") {
    const r = await editorialFetch<Record<string, unknown>>(`/sources/${src.id}/test`, { method: "POST", body: JSON.stringify({ tenant_id: tenant.id }) }, 30000);
    await audit(tenant.id, session.user.id, "source.test_fetch", "sources", src.id, { ok: r?.ok ?? false });
    if (!r) return fail("Editorial service unavailable. No fetch was made.");
    return { ok: Boolean(r.ok), message: r.ok ? `Test fetch OK: HTTP ${r.status}, ${r.items} items, ${r.bytes} bytes.` : `Test fetch: ${r.message ?? r.error}` };
  }
  if (action === "ingest") {
    if (src.rights_status !== "approved" || !src.enabled) return fail("Only enabled, rights-approved sources can be fetched.");
    const r = await editorialFetch(`/sources/${src.id}/ingest`, { method: "POST", body: JSON.stringify({ tenant_id: tenant.id }) });
    await audit(tenant.id, session.user.id, "source.ingest_now", "sources", src.id);
    return r ? { ok: true, message: "Fetch queued." } : fail("Editorial service unavailable.");
  }
  if (action === "pause" || action === "resume") {
    if (action === "resume" && src.rights_status !== "approved") return fail("Approve rights before enabling fetching.");
    await pb.update("sources", src.id, { enabled: action === "resume" });
    await audit(tenant.id, session.user.id, `source.${action}`, "sources", src.id);
  } else if (action === "approve_rights") {
    if (!hasRole(session, "tenant_admin")) return fail("Rights approval needs a tenant or platform admin.");
    const notes = s(f, "notes", 3000), license = s(f, "license_url", 500), policy = s(f, "usage_policy", 30);
    if (notes.length < 20 || !/^https:\/\//.test(license)) return fail("Record the evidence: a license/terms URL (https) and notes of at least 20 characters.");
    if (!["link_only", "metadata_only", "permitted_excerpt", "licensed_full"].includes(policy)) return fail("Choose a usage policy.");
    await pb.update("sources", src.id, { rights_status: "approved", usage_policy: policy, license_url: license, rights_notes: notes, rights_verified_by: session.user.id, rights_verified_at: pbDate() });
    await audit(tenant.id, session.user.id, "source.rights_approved", "sources", src.id, { policy });
  } else if (action === "revoke") {
    await pb.update("sources", src.id, { rights_status: "revoked", enabled: false });
    // Downstream: hold unpublished drafts from this source; expire stored excerpts.
    const items = await pb.list("source_items", { filter: `tenant_id=${q(tenant.id)} && source_id=${q(src.id)}`, perPage: 500 });
    for (const it of items) await pb.update("source_items", it.id, { permitted_excerpt: "", license_state: "revoked" });
    const clusterIds = [...new Set(items.map((i) => i.cluster_id).filter(Boolean))];
    let held = 0, unpublished = 0;
    for (const cid of clusterIds) {
      const p = await pb.first("editorial_pieces", `tenant_id=${q(tenant.id)} && cluster_id=${q(cid)} && review_status!='retracted'`);
      if (!p) continue;
      if (p.review_status === "published") {
        // Derived public output is withdrawn: topic unpublished, thread closed, public correction, committed event (A-05).
        await pb.update("editorial_pieces", p.id, { review_status: "held", thread_state: "closed" });
        await pb.create("corrections", { tenant_id: tenant.id, piece_id: p.id, summary: `Withdrawn: the source's usage rights were revoked (${src.publisher_name}).`, public_at: pbDate(), status: "published" });
        await emitEvent(tenant, { event_type: "thread_paused", piece_id: p.id, author_kind: "system", payload: { reason: "source rights revoked" } });
        unpublished++;
      } else { await pb.update("editorial_pieces", p.id, { review_status: "held" }); held++; }
    }
    // v1.5 source cards (verbatim excerpts): withdraw a card whose only source is this one; otherwise drop this attribution.
    let cardsWithdrawn = 0;
    const cards = await pb.list("editorial_pieces", { filter: `tenant_id=${q(tenant.id)} && kind='source_link' && review_status!='retracted'`, perPage: 500 });
    for (const c of cards) {
      const srcs = (Array.isArray(c.sources_json) ? c.sources_json : []) as { source_id?: string }[];
      if (!srcs.some((x) => x.source_id === src.id)) continue;
      const rest = srcs.filter((x) => x.source_id !== src.id);
      if (rest.length) { await pb.update("editorial_pieces", c.id, { sources_json: rest }); continue; }
      const wasPublic = c.review_status === "published";
      await pb.update("editorial_pieces", c.id, { review_status: "held", thread_state: "closed", lede: "", risk_basis: `source rights revoked (${src.publisher_name})` });
      if (wasPublic) {
        await pb.create("corrections", { tenant_id: tenant.id, piece_id: c.id, summary: `Withdrawn: the source's usage rights were revoked (${src.publisher_name}).`, public_at: pbDate(), status: "published" });
        await emitEvent(tenant, { event_type: "thread_paused", piece_id: c.id, author_kind: "system", payload: { reason: "source rights revoked" } });
        cardsWithdrawn++;
      }
    }
    unpublished += cardsWithdrawn;
    await audit(tenant.id, session.user.id, "source.rights_revoked", "sources", src.id, { items: items.length, drafts_held: held, unpublished, cards_withdrawn: cardsWithdrawn });
    invalidateFeedCache(tenant.id);
    revalidatePath("/", "layout");
    return { ok: true, message: `Rights revoked. Fetching disabled, ${items.length} stored excerpts cleared, ${held} drafts held, ${unpublished} published topics withdrawn.` };
  } else return fail("Unknown action.");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Saved." };
}

// ---------------- Moderation ----------------

export async function moderate(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("moderator");
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
  const { tenant, session } = await staff("tenant_admin");
  const inq = await pb.first("sponsor_inquiries", `tenant_id=${q(tenant.id)} && id=${q(s(f, "id", 30))}`);
  if (!inq) return fail("Not found.");
  const r = await forwardInquiry(inq);
  await audit(tenant.id, session.user.id, "inquiry.forward_retry", "sponsor_inquiries", inq.id, { state: r.state });
  revalidatePath("/admin/sponsors");
  return { ok: r.state === "FORWARDED", message: `Forward state: ${r.state}${r.error ? ` (${r.error})` : ""}` };
}

export async function markInquiryManual(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("tenant_admin");
  const inq = await pb.first("sponsor_inquiries", `tenant_id=${q(tenant.id)} && id=${q(s(f, "id", 30))}`);
  if (!inq) return fail("Not found.");
  await pb.update("sponsor_inquiries", inq.id, { forward_state: "MANUAL" });
  await audit(tenant.id, session.user.id, "inquiry.manual", "sponsor_inquiries", inq.id);
  revalidatePath("/admin/sponsors");
  return { ok: true, message: "Marked for manual follow-up." };
}

export async function verifyBusiness(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("editor");
  const b = await pb.first("businesses", `tenant_id=${q(tenant.id)} && id=${q(s(f, "id", 30))}`);
  if (!b) return fail("Not found.");
  const state = s(f, "state", 20);
  if (!["verified", "rejected", "pending"].includes(state)) return fail("Unknown state.");
  await pb.update("businesses", b.id, { verification_state: state });
  await audit(tenant.id, session.user.id, `business.${state}`, "businesses", b.id);
  revalidatePath("/", "layout");
  invalidateFeedCache(tenant.id);
  return { ok: true, message: `Business marked ${state}.` };
}

// ---------------- Tenancy (platform admin only) ----------------

export async function updateBranding(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("tenant_admin");
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
  const { tenant, session } = await staff("tenant_admin");
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

export async function runDemoConversation(_: ActionState): Promise<ActionState> {
  const { tenant, session } = await staff("editor");
  const r = await editorialFetch<{ piece_id: string; slug: string; published: boolean; info: string }>("/conversations/demo", { method: "POST", body: JSON.stringify({ tenant_id: tenant.id }) }, 30000);
  await audit(tenant.id, session.user.id, "conversation.demo_started", "editorial_pieces", r?.piece_id ?? "", { published: r?.published ?? false });
  if (!r) return fail("Editorial service unavailable.");
  invalidateFeedCache(tenant.id);
  return r.published ? { ok: true, message: `Demo topic published. Replies arrive as real model calls complete (about 20–40 s each).`, data: { slug: r.slug } } : fail(`Demo not published: ${r.info}`);
}

export async function pauseThread(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("editor");
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
  const { tenant, session } = await staff("editor");
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
  const { tenant, session } = await staff("editor");
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

export async function geoDecision(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("editor");
  const ev = await pb.first("story_geo_evidence", `tenant_id=${q(tenant.id)} && id=${q(s(f, "id", 30))}`);
  if (!ev) return fail("Not found.");
  const action = s(f, "action", 20);
  if (action === "confirm") await pb.update("story_geo_evidence", ev.id, { status: "confirmed", confidence: "verified", role: ev.role === "incidental" ? "subject" : ev.role, reviewer_id: session.user.id });
  else if (action === "reject") await pb.update("story_geo_evidence", ev.id, { status: "rejected", reviewer_id: session.user.id });
  else if (action === "correct") {
    const code = s(f, "area_code", 12).toUpperCase();
    if (!(await pb.first("geo_areas", `code=${q(code)}`))) return fail("Unknown area code.");
    await pb.update("story_geo_evidence", ev.id, { status: "corrected", reviewer_id: session.user.id, note: `moved from ${ev.area_code}` });
    await pb.create("story_geo_evidence", { tenant_id: tenant.id, piece_id: ev.piece_id, source_item_id: ev.source_item_id, area_code: code, role: "subject", confidence: "verified",
      evidence_span: ev.evidence_span, method: "editor-correction", status: "confirmed", reviewer_id: session.user.id });
  } else return fail("Unknown action.");
  if (ev.piece_id) {
    const all = await pb.list("story_geo_evidence", { filter: `tenant_id=${q(tenant.id)} && piece_id=${q(ev.piece_id)}`, perPage: 100 });
    const codes = [...new Set(all.filter((e) => (e.role === "subject" || e.role === "event") && (e.confidence === "verified" || e.confidence === "high_confidence") && !["rejected", "disputed", "corrected"].includes(e.status)).map((e) => e.area_code))].sort();
    await pb.update("editorial_pieces", ev.piece_id, { area_ids: codes });
  }
  await audit(tenant.id, session.user.id, `geo.${action}`, "story_geo_evidence", ev.id, { area: ev.area_code });
  invalidateFeedCache(tenant.id);
  revalidatePath("/", "layout");
  return { ok: true, message: `Geography ${action}ed.` };
}

/** v1.8+ ISSUE-07: an editor releases a small batch (max 25) of held PUBLISHER cards that the refined card rules would
 *  publish. Never automatic: the editor sees the preview, gives a reason, and each card is approved through the normal
 *  human approval path (recorded, audited, reversible with Unpublish). Re-checks the preview server-side. */
export async function releaseCards(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("editor");
  const ids = f.getAll("id").map((x) => String(x).slice(0, 30)).filter(Boolean).slice(0, 25);
  const reason = s(f, "reason", 500);
  if (!ids.length) return fail("Nothing selected.");
  if (reason.length < 10) return fail("Write a short reason (10+ characters) for this batch.");
  if (await getSwitch(tenant.id, "PUBLISHING_PAUSED")) return fail("Publishing is paused for this tenant.");
  const prev = await editorialFetch<{ items: { id: string; decision: string; rule: string; reason: string }[] }>("/cards/preview", { method: "POST", body: JSON.stringify({ tenant_id: tenant.id, ids }) }, 8000);
  if (!prev) return fail("Rules service unavailable; nothing was released.");
  const ok = new Map(prev.items.filter((x) => x.decision === "publish").map((x) => [x.id, x]));
  const batch = `batch-${Date.now().toString(36)}`;
  let n = 0;
  for (const id of ids) {
    const piece = await ownPiece(tenant, id);
    const p = ok.get(id);
    if (!piece || !p || piece.kind !== "source_link" || !["needs_review", "held"].includes(piece.review_status)) continue;
    await pb.create("editorial_reviews", { tenant_id: tenant.id, piece_id: piece.id, decision: "approve", reviewer_id: session.user.id,
      reason: `${batch} card-disposition-v2 ${p.rule}: ${reason}`.slice(0, 3000), risk_tier: piece.risk_tier || "low", claims_check_hash: piece.claim_check_status, expected_revision: piece.revision ?? 1 });
    const now = pbDate();
    await pb.update("editorial_pieces", piece.id, { review_status: "published", reviewer_id: session.user.id, published_at: piece.published_at || now, first_published_at: piece.first_published_at || now });
    await audit(tenant.id, session.user.id, "piece.batch_released", "editorial_pieces", piece.id, { batch, rule: p.rule, reason: reason.slice(0, 200) }, piece.revision ?? 1);
    n++;
  }
  revalidatePath("/", "layout");
  invalidateFeedCache(tenant.id);
  return { ok: true, message: `Released ${n} of ${ids.length} card(s) (${batch}). Each can be unpublished from its page.` };
}

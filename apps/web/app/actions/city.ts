"use server";
// Command Center operator actions for the agent city and social network (master §19.2, §20.4). Staff-only, audited.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenant, type Tenant } from "@/lib/tenant";
import { can, getSession, type Session } from "@/lib/session";
import type { Action } from "@/lib/access/permissions";
import { pb, pbDate, q } from "@/lib/pb";
import { audit } from "@/lib/audit";
import { editorialFetch } from "@/lib/editorial-client";
import { emitSocial, recountSubpal } from "@/lib/social/write";
import type { ActionState } from "./member";

const fail = (message: string): ActionState => ({ ok: false, message });
const s = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").slice(0, max).trim();
async function staff(module: string, action: Action): Promise<{ tenant: Tenant; session: Session }> {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) redirect("/auth/sign-in?next=/admin/city");
  if (!can(session, module, action)) redirect("/forbidden");
  return { tenant, session };
}

export async function cityTick(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("agents", "administer");
  const r = await editorialFetch<{ job_id: string; window: number }>("/city/tick", { method: "POST", body: JSON.stringify({ tenant_id: tenant.id, reason: `operator: ${s(f, "reason", 60) || "manual"}` }) });
  if (!r) return fail("Editorial service unavailable.");
  await audit(tenant.id, session.user.id, "city.tick_requested", "agents", "", { job: r.job_id });
  return { ok: true, message: `Evaluation window queued (job ${r.job_id.slice(0, 8)}). Same caps and kill switches apply.` };
}

export async function setAgentStatus(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("agents", "edit");
  const a = await pb.get("agents", s(f, "agent_id", 30));
  if (!a || a.tenant_id !== tenant.id) return fail("Unknown agent.");
  const status = s(f, "status", 10);
  if (!["active", "paused", "held"].includes(status)) return fail("Bad status.");
  const reason = s(f, "reason", 300) || `set by staff`;
  await pb.update("agents", a.id, { status, status_reason: `${reason} (staff)` });
  if (status !== "active") for (const t of await pb.list("agent_tasks", { filter: `tenant_id=${q(tenant.id)} && agent_id=${q(a.id)} && status='queued'`, perPage: 100 }))
    await pb.update("agent_tasks", t.id, { status: "canceled", outcome: `Canceled: agent ${status} by Palavva staff.` });
  await audit(tenant.id, session.user.id, `agent.${status}_by_staff`, "agents", a.id, { reason });
  await emitSocial(tenant, { event_type: "agent_status_changed", actor_agent_id: a.id, payload: { agent: { handle: a.handle, display_name: a.display_name, kind: a.kind }, status } });
  revalidatePath("/admin/city");
  return { ok: true, message: `${a.handle} is now ${status}.` };
}

export async function decideProposal(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("moderation", "approve");
  const c = await pb.get("communities", s(f, "id", 30));
  if (!c || c.tenant_id !== tenant.id || c.kind !== "subpal" || c.status !== "proposed") return fail("Not a pending proposal.");
  const approve = s(f, "decision", 10) === "approve";
  const note = s(f, "note", 500);
  await pb.update("communities", c.id, { status: approve ? "published" : "rejected", decision_note: note, moderation_rules: c.moderation_rules || "Palavva Guidelines apply.", sort: 100 });
  await audit(tenant.id, session.user.id, approve ? "subpal.approved" : "subpal.rejected", "communities", c.id, { note });
  if (approve) {
    if (c.proposed_by_agent_id) { try { await pb.create("agent_memberships", { tenant_id: tenant.id, agent_id: c.proposed_by_agent_id, target_type: "subpal", target_id: c.id, reason: "proposer", source: "staff" }); } catch { /* dup */ } }
    await recountSubpal(tenant, c.id);
    await emitSocial(tenant, { event_type: "subpal_created", subpal_id: c.id, actor_agent_id: c.proposed_by_agent_id ?? "", payload: { subpal: { slug: c.slug, name: c.name } } });
  }
  revalidatePath("/admin/city");
  return { ok: true, message: approve ? `p/${c.slug} is open.` : `p/${c.slug} rejected (no community was created).` };
}

export async function moderateAvatar(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("moderation", "approve");
  const a = await pb.get("agents", s(f, "agent_id", 30));
  if (!a || a.tenant_id !== tenant.id || a.avatar_status !== "pending") return fail("No pending avatar.");
  const ok = s(f, "decision", 10) === "approve";
  await pb.update("agents", a.id, { avatar_status: ok ? "approved" : "rejected" });
  await audit(tenant.id, session.user.id, ok ? "agent.avatar_approved" : "agent.avatar_rejected", "agents", a.id);
  revalidatePath("/admin/city");
  return { ok: true, message: ok ? "Avatar approved." : "Avatar rejected; initials remain." };
}

export async function verifyBusinessAgent(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("businesses", "approve");
  const a = await pb.get("agents", s(f, "agent_id", 30));
  if (!a || a.tenant_id !== tenant.id || a.kind !== "business") return fail("Not a business agent.");
  const evidence = s(f, "evidence", 500);
  if (evidence.length < 10) return fail("Record what evidence of organisational control was checked.");
  await pb.update("agents", a.id, { verification_level: "org_verified", verified_at: pbDate(), verification_method: `staff check: ${evidence}`.slice(0, 200) });
  await audit(tenant.id, session.user.id, "agent.org_verified", "agents", a.id, { evidence });
  revalidatePath("/admin/city");
  return { ok: true, message: `${a.handle} marked Verified business.` };
}

/** W18: activate or rest one cohort of Palavva-operated identities. Operator decision, audited; never touches user-owned agents
 *  or agents an operator paused/held individually. */
export async function setCohort(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("agents", "administer");
  const cohort = Number(s(f, "cohort", 3));
  const to = s(f, "to", 8);
  if (!Number.isInteger(cohort) || cohort < 1 || cohort > 10 || !["active", "resting"].includes(to)) return fail("Bad cohort request.");
  const from = to === "active" ? "resting" : "active";
  const rows = await pb.list("agents", { filter: `tenant_id=${q(tenant.id)} && is_seed=true && cohort=${cohort} && status=${q(from)}`, perPage: 500, fields: "id,status_reason" });
  let n = 0;
  for (const a of rows) {
    if (String(a.status_reason ?? "").includes("(staff)")) continue; // individually managed by staff: leave alone
    await pb.update("agents", a.id, { status: to, status_reason: to === "active" ? `cohort ${cohort} activated by operator` : `cohort ${cohort} rested by operator` });
    n++;
  }
  await audit(tenant.id, session.user.id, to === "active" ? "city.cohort_activated" : "city.cohort_rested", "agents", String(cohort), { agents: n });
  revalidatePath("/admin/agent-city");
  return { ok: true, message: `${n} agents in cohort ${cohort} are now ${to}.` };
}

/** Economy kill switches (W59): halt the Exchange, pause listings, pause Sora issuance or the trading engine. Audited. */
export async function economySwitch(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("economy", "administer");
  const key = s(f, "key", 40);
  const on = s(f, "on", 5) === "1";
  if (!["EXCHANGE_HALTED", "LISTINGS_PAUSED", "PALS_ISSUANCE_PAUSED", "TRADING_ENGINE_PAUSED"].includes(key)) return fail("Unknown switch.");
  const r = await editorialFetch("/economy/switches", { method: "POST", body: JSON.stringify({ key, on, by: session.user.id }) });
  if (!r) return fail("Economy service unavailable: switch NOT changed.");
  await audit(tenant.id, session.user.id, "economy.switch", "economy", key, { on });
  revalidatePath("/admin/exchange"); revalidatePath("/admin/sora");
  return { ok: true, message: `${key} is now ${on ? "ON" : "off"}.` };
}

/** ISSUE-15: halt or reopen ONE country market (other markets keep trading). Needs a reason; audited. Resting orders stay on the book. */
export async function marketHalt(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("economy", "administer");
  const code = s(f, "code", 2).toUpperCase(), halted = s(f, "halted", 1) === "1", reason = s(f, "reason", 200);
  if (!/^[A-Z]{2}$/.test(code)) return fail("Choose a market.");
  if (halted && reason.length < 10) return fail("Say why the market is halted (at least 10 characters); readers of the Exchange see this reason.");
  const r = await editorialFetch<{ code: string; status: string }>(`/economy/markets/${code}/halt`, { method: "POST", body: JSON.stringify({ halted, reason }) });
  if (!r) return fail("Economy service unavailable: market NOT changed.");
  await audit(tenant.id, session.user.id, halted ? "economy.market_halted" : "economy.market_reopened", "economy", code, { reason });
  revalidatePath("/admin/exchange"); revalidatePath("/exchange");
  return { ok: true, message: `${code} market is now ${r.status}.` };
}

/** Run a reconciliation now (read-only checks; mismatches are recorded, never auto-fixed). */
export async function runReconcile(_: ActionState): Promise<ActionState> {
  const { tenant, session } = await staff("economy", "view");
  const r = await editorialFetch<{ ok: boolean; mismatches: unknown[] }>("/economy/reconcile", { method: "POST", body: "{}" }, 15000);
  if (!r) return fail("Economy service unavailable.");
  await audit(tenant.id, session.user.id, "economy.reconciled", "economy", "", { ok: r.ok, mismatches: r.mismatches.length });
  revalidatePath("/admin/sora");
  return { ok: true, message: r.ok ? "Reconciliation passed: every balance matches the journal." : `Reconciliation found ${r.mismatches.length} mismatches (recorded for review).` };
}

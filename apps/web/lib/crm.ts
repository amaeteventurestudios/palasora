// EspoCRM bridge (12-SPONSORS, v1.8+ ISSUE-18). The inquiry is ALWAYS persisted locally first; forwarding is a separate, retriable
// step, so a CRM outage never loses a lead. With no configured URL/key the state is NOT_CONFIGURED and no network call is made.
//   * Duplicate prevention twice over: an earlier local inquiry from the same address (90 days) is linked as DUPLICATE instead of
//     being sent again, and in the CRM an existing Lead/Contact with that e-mail is linked rather than copied (lib/crm/espo.ts).
//   * Failures are classified: auth/validation problems need a person (no automatic retry); outages and 5xx retry with backoff
//     (1, 2, 4 … 60 minutes) when the Sponsors page or the Retry button runs due retries.
import { env } from "./env";
import { pb, pbDate, q, type Rec } from "./pb";
import { EspoClient, EspoError, pushStage, upsertLead, type Stage } from "./crm/espo";

export type ForwardResult = { state: "FORWARDED" | "FORWARD_FAILED" | "NOT_CONFIGURED" | "DUPLICATE"; crmRef?: string; error?: string };

export function espo(f: typeof fetch = fetch): EspoClient | null {
  return env.espoConfigured ? new EspoClient(process.env.ESPOCRM_URL!, process.env.ESPOCRM_API_KEY!, f) : null;
}
export const espoLink = (entity: "Lead" | "Opportunity" | "Account" | "Contact", id: string) => (id && env.espoConfigured ? `${process.env.ESPOCRM_URL!.replace(/\/$/, "")}/#${entity}/view/${id}` : "");

async function failed(inq: Rec, e: unknown, attempts: number): Promise<ForwardResult> {
  const err = e instanceof EspoError ? e : new EspoError("network", 0, String((e as Error)?.message ?? e));
  const retry = err.retriable;
  const backoff = Math.min(3600, 60 * 2 ** (attempts - 1));
  await pb.update("sponsor_inquiries", inq.id, { forward_state: "FORWARD_FAILED", attempts, last_error: err.message.slice(0, 200),
    sync_note: retry ? `will retry after ${Math.round(backoff / 60)} min` : "needs a person: fix the CRM key/role or the record, then press Retry",
    next_attempt_at: retry ? pbDate(new Date(Date.now() + backoff * 1000)) : "" });
  return { state: "FORWARD_FAILED", error: err.message };
}

export async function forwardInquiry(inq: Rec, client: EspoClient | null = espo()): Promise<ForwardResult> {
  // Local duplicate: same address, earlier inquiry in the last 90 days that is not itself a duplicate.
  const since = pbDate(new Date(Date.now() - 90 * 86400_000));
  const earlier = await pb.first("sponsor_inquiries", `tenant_id=${q(inq.tenant_id)} && email=${q(inq.email)} && id!=${q(inq.id)} && created < ${q(inq.created)} && created >= ${q(since)} && forward_state!='DUPLICATE'`, "created");
  if (earlier) {
    const notes = [...(Array.isArray(inq.notes) ? inq.notes : []), { at: pbDate(), by: "system", text: `Same e-mail as ${earlier.reference}; linked instead of creating a second CRM lead.` }];
    await pb.update("sponsor_inquiries", inq.id, { forward_state: "DUPLICATE", duplicate_of: earlier.id, crm_lead_id: earlier.crm_lead_id ?? "", notes, last_error: "" });
    return { state: "DUPLICATE", crmRef: earlier.crm_lead_id ?? "" };
  }
  if (!client) {
    await pb.update("sponsor_inquiries", inq.id, { forward_state: "NOT_CONFIGURED", last_error: "EspoCRM bridge not configured", sync_note: "kept safely in Palavva; nothing was sent" });
    return { state: "NOT_CONFIGURED" };
  }
  const attempts = (inq.attempts ?? 0) + 1;
  try {
    const r = await upsertLead(client, inq as never);
    await pb.update("sponsor_inquiries", inq.id, { forward_state: "FORWARDED", crm_ref: r.leadId, crm_lead_id: r.leadId, crm_contact_id: r.contactId ?? inq.crm_contact_id ?? "",
      attempts, last_error: "", next_attempt_at: "", last_synced_at: pbDate(), sync_note: r.linked === "created" ? "new CRM lead" : r.linked === "existing_lead" ? "linked to an existing CRM lead (same e-mail)" : "new lead; a CRM contact with this e-mail already exists" });
    return { state: "FORWARDED", crmRef: r.leadId };
  } catch (e) { return failed(inq, e, attempts); }
}

/** Stage change: saved locally first (always), then mirrored to EspoCRM when configured. */
export async function syncStage(inq: Rec, stage: Stage, client: EspoClient | null = espo()): Promise<{ synced: boolean; error?: string }> {
  if (!client) return { synced: false, error: "EspoCRM not configured: the stage is saved in Palavva only" };
  try {
    const ids = await pushStage(client, { ...(inq as unknown as Record<string, unknown>), pipeline_stage: stage } as never, stage);
    await pb.update("sponsor_inquiries", inq.id, { ...ids, crm_ref: ids.crm_lead_id ?? inq.crm_ref, forward_state: "FORWARDED", last_synced_at: pbDate(), last_error: "", sync_note: `stage ${stage} synced` });
    return { synced: true };
  } catch (e) { const r = await failed(inq, e, (inq.attempts ?? 0) + 1); return { synced: false, error: r.error }; }
}

/** Retries that are due (bounded). Called when staff open Sponsors, so no extra daemon is needed. */
export async function retryDue(tenantId: string, max = 5): Promise<number> {
  const client = espo();
  if (!client) return 0;
  const due = await pb.list("sponsor_inquiries", { filter: `tenant_id=${q(tenantId)} && (forward_state='PENDING_FORWARD' || (forward_state='FORWARD_FAILED' && next_attempt_at!='' && next_attempt_at <= ${q(pbDate())}))`, perPage: max });
  for (const i of due) await forwardInquiry(i, client);
  return due.length;
}

export async function crmHealth(): Promise<{ state: "not_configured" | "ok" | "auth_failed" | "unreachable"; detail: string }> {
  const c = espo();
  if (!c) return { state: "not_configured", detail: "ESPOCRM_URL and ESPOCRM_API_KEY are not set. Inquiries are stored in Palavva and can be sent later." };
  try { const u = await c.ping(); return { state: "ok", detail: `Connected as API user ${u.user || "(unnamed)"}` }; }
  catch (e) { const err = e as EspoError; return { state: err.kind === "auth" ? "auth_failed" : "unreachable", detail: err.message }; }
}

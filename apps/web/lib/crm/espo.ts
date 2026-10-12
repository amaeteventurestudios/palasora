// ISSUE-18 typed EspoCRM REST adapter (API v1, "API User" with an X-Api-Key). EspoCRM stays the source of truth for CRM records;
// Palavva keeps the original inquiry and a mirror of the stage so nothing is lost while the CRM is unreachable.
//
// Least privilege: the API user needs only Lead, Account, Contact and Opportunity (read + create + edit, own records). Nothing here
// deletes, lists unrelated records in bulk, or changes the CRM's schema; the shared CRM's other leads are never read beyond the
// e-mail/name lookups used for duplicate prevention.
export type EspoEntity = "Lead" | "Account" | "Contact" | "Opportunity";
export class EspoError extends Error {
  constructor(public kind: "auth" | "client" | "server" | "network", public status: number, msg: string) { super(msg); }
  get retriable() { return this.kind === "server" || this.kind === "network"; }
}

// Pipeline stage (Palavva) → EspoCRM default Lead status / Opportunity stage.
export const LEAD_STATUS = { new: "New", contacted: "In Process", qualified: "Converted", proposal: "Converted", won: "Converted", lost: "Dead" } as const;
export const OPP_STAGE = { qualified: "Qualification", proposal: "Proposal", won: "Closed Won", lost: "Closed Lost" } as const;
export type Stage = keyof typeof LEAD_STATUS;

export class EspoClient {
  constructor(private base: string, private key: string, private f: typeof fetch = fetch, private timeoutMs = 8000) { this.base = base.replace(/\/$/, ""); }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let r: Response;
    try {
      r = await this.f(`${this.base}/api/v1/${path}`, { method, signal: AbortSignal.timeout(this.timeoutMs), cache: "no-store",
        headers: { "X-Api-Key": this.key, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw new EspoError("network", 0, `EspoCRM unreachable: ${(e as Error).message}`.slice(0, 200)); }
    if (r.status === 401 || r.status === 403) throw new EspoError("auth", r.status, `EspoCRM refused the API key (HTTP ${r.status}); check the Palavva API user and its role`);
    if (r.status >= 500) throw new EspoError("server", r.status, `EspoCRM server error HTTP ${r.status}`);
    if (!r.ok) throw new EspoError("client", r.status, `EspoCRM rejected the request (HTTP ${r.status}): ${(await r.text().catch(() => "")).slice(0, 120)}`);
    return (r.status === 204 ? undefined : await r.json()) as T;
  }

  /** Cheap authenticated check used by the health panel. */
  async ping(): Promise<{ user: string }> { const u = await this.call<{ user?: { userName?: string } }>("GET", "App/user"); return { user: String(u?.user?.userName ?? "") }; }

  async findBy(entity: EspoEntity, attribute: string, value: string): Promise<{ id: string; [k: string]: unknown } | null> {
    const p = new URLSearchParams({ maxSize: "1", "where[0][type]": "equals", "where[0][attribute]": attribute, "where[0][value]": value, select: "id,name" });
    const r = await this.call<{ list?: { id: string }[] }>("GET", `${entity}?${p}`);
    return r?.list?.[0] ?? null;
  }
  create(entity: EspoEntity, data: Record<string, unknown>) { return this.call<{ id: string }>("POST", entity, data); }
  update(entity: EspoEntity, id: string, data: Record<string, unknown>) { return this.call<{ id: string }>("PUT", `${entity}/${encodeURIComponent(id)}`, data); }
  link(entity: EspoEntity, id: string) { return `${this.base}/#${entity}/view/${encodeURIComponent(id)}`; }
}

export type InquiryLike = { reference: string; contact_name: string; email: string; business: string; website?: string; industry?: string; region?: string; country?: string;
  promote?: string; message?: string; budget_range?: string; target_audience?: string; package?: string; pipeline_stage?: string;
  crm_lead_id?: string; crm_account_id?: string; crm_contact_id?: string; crm_opportunity_id?: string };

/** Create-or-link the Lead for an inquiry. Duplicate prevention: an existing Lead OR Contact with the same e-mail is linked, never copied. */
export async function upsertLead(c: EspoClient, inq: InquiryLike): Promise<{ leadId: string; linked: "created" | "existing_lead" | "existing_contact"; contactId?: string }> {
  if (inq.crm_lead_id) return { leadId: inq.crm_lead_id, linked: "existing_lead" };
  const lead = await c.findBy("Lead", "emailAddress", inq.email);
  if (lead) return { leadId: lead.id, linked: "existing_lead" };
  const contact = await c.findBy("Contact", "emailAddress", inq.email);
  const [first, ...rest] = String(inq.contact_name).trim().split(/\s+/);
  const created = await c.create("Lead", { firstName: first, lastName: rest.join(" ") || "-", emailAddress: inq.email, accountName: inq.business, website: inq.website || undefined,
    source: "Web Site", status: "New", industry: undefined,
    description: `[Palavva ${inq.reference}] ${inq.industry ?? ""} / ${inq.region ?? ""}${inq.country ? ` / ${inq.country}` : ""}\nWants to promote: ${inq.promote ?? ""}\nBudget: ${inq.budget_range ?? "not given"}\n${inq.message ?? ""}`.slice(0, 4000) });
  return { leadId: created.id, linked: contact ? "existing_contact" : "created", contactId: contact?.id };
}

/** Push a stage change. From "qualified" onwards the deal lives on an Account + Contact + Opportunity (created once, then updated). */
export async function pushStage(c: EspoClient, inq: InquiryLike, stage: Stage): Promise<Partial<Record<"crm_lead_id" | "crm_account_id" | "crm_contact_id" | "crm_opportunity_id", string>>> {
  const out: Partial<Record<"crm_lead_id" | "crm_account_id" | "crm_contact_id" | "crm_opportunity_id", string>> = {};
  const lead = await upsertLead(c, inq);
  out.crm_lead_id = lead.leadId;
  await c.update("Lead", lead.leadId, { status: LEAD_STATUS[stage] });
  if (stage in OPP_STAGE) {
    let accountId = inq.crm_account_id || (await c.findBy("Account", "name", inq.business))?.id || "";
    if (!accountId) accountId = (await c.create("Account", { name: inq.business, website: inq.website || undefined, description: `Created from Palavva inquiry ${inq.reference}` })).id;
    let contactId = inq.crm_contact_id || lead.contactId || (await c.findBy("Contact", "emailAddress", inq.email))?.id || "";
    if (!contactId) { const [first, ...rest] = inq.contact_name.trim().split(/\s+/); contactId = (await c.create("Contact", { firstName: first, lastName: rest.join(" ") || "-", emailAddress: inq.email, accountId })).id; }
    let oppId = inq.crm_opportunity_id || "";
    const oppData = { stage: OPP_STAGE[stage as keyof typeof OPP_STAGE], accountId, contactsIds: [contactId], description: `Palavva ${inq.reference}: ${inq.package || "sponsorship"}${inq.target_audience ? ` for ${inq.target_audience}` : ""}` };
    if (oppId) await c.update("Opportunity", oppId, oppData);
    else oppId = (await c.create("Opportunity", { name: `Palavva sponsorship – ${inq.business}`.slice(0, 150), ...oppData, closeDate: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10) })).id;
    Object.assign(out, { crm_account_id: accountId, crm_contact_id: contactId, crm_opportunity_id: oppId });
  }
  return out;
}

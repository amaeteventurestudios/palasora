// ISSUE-18 Sponsors & inquiries: every inquiry kept in Palavva first, its pipeline stage (New → Contacted → Qualified → Proposal →
// Won/Lost), owner, follow-up and notes, whether and how it reached EspoCRM (the CRM of record), and links to the CRM records.
import Link from "next/link";
import { requirePerm } from "@/lib/guard";
import { can } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { crmHealth, espoLink, retryDue } from "@/lib/crm";
import { markInquiryManual } from "@/app/actions/admin";
import { retryForward, updateInquiry } from "@/app/actions/sponsors";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminForm } from "@/components/admin/AdminForm";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { InquiryTable, type InquiryRow } from "@/components/admin/sponsors/InquiryTable";

export const metadata = { title: "Sponsors & Inquiries" };
export const dynamic = "force-dynamic";
const STAGES = [["new", "New"], ["contacted", "Contacted"], ["qualified", "Qualified"], ["proposal", "Proposal"], ["won", "Won"], ["lost", "Lost"]] as const;
const field = "h-9 rounded-md border bg-background px-2 text-sm";

export default async function Sponsors({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { tenant, session } = await requirePerm("advertising", "view");
  const retried = await retryDue(tenant.id).catch(() => 0);
  const [inq, health, staffList] = await Promise.all([pb.list("sponsor_inquiries", { filter: `tenant_id=${q(tenant.id)}`, sort: "-created", perPage: 500 }), crmHealth(),
    pb.list("memberships", { filter: `tenant_id=${q(tenant.id)} && status='active' && role!='member'`, perPage: 200 })]);
  const users = Object.fromEntries((await Promise.all(staffList.map((m) => pb.get("users", m.user_id)))).filter(Boolean).map((u) => [u!.id, String(u!.display_name)]));
  const stage = (i: (typeof inq)[number]) => String(i.pipeline_stage || "new");
  const rows: InquiryRow[] = inq.map((i) => ({ id: i.id, reference: i.reference, business: i.business, contact: i.contact_name, email: i.email, stage: stage(i), country: i.country || "", region: i.region || "",
    industry: i.industry || "", forward: i.forward_state, owner: users[i.owner_user_id] ?? "", followUp: String(i.follow_up_at || "").slice(0, 10), created: String(i.created) }));
  const selId = (await searchParams).id;
  const sel = selId ? inq.find((i) => i.id === selId) : undefined;
  const due = rows.filter((r) => r.followUp && r.followUp <= new Date().toISOString().slice(0, 10) && !["won", "lost"].includes(r.stage)).length;
  const canEdit = can(session, "advertising", "edit");
  return (
    <AdminPage title="Sponsors & inquiries"
      narrative={`${inq.length} inquiries kept in Palavva. EspoCRM: ${health.state === "ok" ? "connected" : health.state === "not_configured" ? "not configured — inquiries are safely stored here and can be sent later" : `${health.state.replace("_", " ")} (${health.detail})`}. ${due} follow-ups due. Revenue is only counted from real payments (Revenue workspace), never from this pipeline.${retried ? ` ${retried} queued sends were retried just now.` : ""}`}
      actions={<HelpTip label="Sponsor pipeline" what="Every sponsor inquiry from the Advertise page, where it is in the sales process, and its records in EspoCRM (the shared customer database)."
        why="No lead is lost if the CRM is down, the same company is never entered twice, and everyone can see who is following up and when." todo="Open an inquiry to change its stage with a note, set a follow-up date or owner, retry a failed send, or open the matching CRM record." />}>
      <section className="kpi-grid">
        <MetricCard label="EspoCRM connection" value={{ ok: "Connected", not_configured: "Not configured", auth_failed: "Key refused", unreachable: "Unreachable" }[health.state]} definition={`${health.detail} Audit (12 Oct 2026): EspoCRM 9.3.4 runs on the shared Hetzner server (its API answers); Palavva has no API user yet, so nothing is sent.`} source="ESPOCRM_URL / API key · live ping" />
        {STAGES.map(([k, l], n) => <MetricCard key={k} label={l} value={String(rows.filter((r) => r.stage === k).length)} definition={`Inquiries currently in the “${l}” stage.`} source="sponsor_inquiries.pipeline_stage" slot={((n + 1) % 6) + 1} />)}
      </section>
      <InquiryTable rows={rows} selected={sel?.id} />
      {sel && <section id="inquiry" className="grid gap-4 xl:grid-cols-2" data-testid="inquiry-panel">
        <div className="rounded-xl border p-4 text-sm">
          <h2 className="text-lg font-bold">{sel.business} <span className="font-mono text-sm font-normal">{sel.reference}</span></h2>
          <p>{sel.contact_name} · {sel.email}{sel.website ? <> · <a className="link" href={sel.website} rel="noopener noreferrer" target="_blank">website</a></> : null}</p>
          <p className="mt-1 text-muted-foreground">{sel.region} / {sel.industry} · budget {sel.budget_range || "not given"} · consent {String(sel.consent_at).slice(0, 10)}</p>
          {sel.promote && <p className="mt-2"><b>Wants to promote:</b> {sel.promote}</p>}{sel.message && <p className="mt-1">{sel.message}</p>}
          <p className="mt-3"><b>CRM:</b> <span data-testid="inquiry-forward">{sel.forward_state}</span>{sel.sync_note ? ` — ${sel.sync_note}` : ""}{sel.last_error && sel.forward_state === "FORWARD_FAILED" ? ` (${sel.last_error})` : ""}
            {sel.duplicate_of && <> · <Link className="link" href={`/admin/sponsors?id=${sel.duplicate_of}#inquiry`}>earlier inquiry</Link></>}</p>
          <ul className="mt-1 flex flex-wrap gap-3">{([["Lead", sel.crm_lead_id], ["Account", sel.crm_account_id], ["Contact", sel.crm_contact_id], ["Opportunity", sel.crm_opportunity_id]] as const).filter(([, id]) => id).map(([e, id]) =>
            <li key={e}>{espoLink(e, id) ? <a className="link" href={espoLink(e, id)} target="_blank" rel="noopener noreferrer">View {e} in EspoCRM</a> : `${e} ${id}`}</li>)}</ul>
          <h3 className="mt-4 font-bold">Notes and history</h3>
          {(Array.isArray(sel.notes) ? sel.notes : []).length === 0 ? <p className="text-muted-foreground">No notes yet.</p> :
            <ol className="mt-1 divide-y" data-testid="inquiry-notes">{(sel.notes as { at: string; by: string; text: string }[]).slice().reverse().map((n, i) => <li key={i} className="py-1.5"><span className="text-xs text-muted-foreground">{n.at.slice(0, 16)} · {users[n.by] ?? n.by}</span><br />{n.text}</li>)}</ol>}
        </div>
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          {canEdit ? <AdminForm action={updateInquiry} submit="Save">
            <input type="hidden" name="id" value={sel.id} />
            <label className="text-sm" htmlFor="stage">Stage</label>
            <select id="stage" name="stage" defaultValue={sel.pipeline_stage || "new"} className={field} data-testid="inquiry-stage">{STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <label className="text-sm" htmlFor="owner">Owner</label>
            <select id="owner" name="owner" defaultValue={sel.owner_user_id || session.user.id} className={field}>{Object.entries(users).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
            <div className="grid gap-2 sm:grid-cols-3"><input name="follow_up_at" defaultValue={String(sel.follow_up_at || "").slice(0, 10)} placeholder="Follow up on (YYYY-MM-DD)" className={field} aria-label="Follow-up date" />
              <input name="country" defaultValue={sel.country || ""} placeholder="Country (NG)" className={field} aria-label="Country code" /><input name="package" defaultValue={sel.package || ""} placeholder="Package" className={field} aria-label="Package" /></div>
            <input name="audience" defaultValue={sel.target_audience || ""} placeholder="Target audience" className={field} aria-label="Target audience" />
            <textarea name="note" className="min-h-16 rounded-md border bg-background p-2 text-sm" placeholder="Note (needed when the stage changes)" aria-label="Note" />
          </AdminForm> : <p className="text-sm text-muted-foreground">Your role can read the pipeline but not change it.</p>}
          {canEdit && sel.forward_state !== "FORWARDED" && <AdminForm action={retryForward} submit="Send to EspoCRM now"><input type="hidden" name="id" value={sel.id} /></AdminForm>}
          {canEdit && !["MANUAL", "FORWARDED", "DUPLICATE"].includes(sel.forward_state) && <AdminForm action={markInquiryManual} submit="Handle manually (stop automatic sends)"><input type="hidden" name="id" value={sel.id} /></AdminForm>}
          <p className="text-xs text-muted-foreground">Stage changes are saved in Palavva first, then mirrored to EspoCRM (Lead status; from “Qualified” an Account, Contact and Opportunity). Won/Lost needs Advertising → approve. Nothing here changes billing.</p>
        </div>
      </section>}
    </AdminPage>
  );
}

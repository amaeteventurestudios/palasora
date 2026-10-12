// ISSUE-19 Businesses & Founders: real vs demo counts, searchable list, and a review panel per business with its profile, linked
// agents, verification history (evidence + notes) and only the decisions its current state allows. Verification is done by a person
// with evidence; demo businesses are examples and can never be verified. Fictional Exchange companies are a different thing.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getSession, can } from "@/lib/session";
import { pb, q, type Rec } from "@/lib/pb";
import { listAll } from "@/lib/admin/fetchall";
import { businessDecision } from "@/app/actions/admin";
import { ACTION_LABEL, STATE_LABEL, actionRule, actionsFor, type BizState } from "@/lib/business/rules";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminForm } from "@/components/admin/AdminForm";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { BusinessTable, type BizRow } from "@/components/admin/business/BusinessTable";
import { countryName } from "@/lib/edition";

export const metadata = { title: "Businesses & Founders" };
export const dynamic = "force-dynamic";

export default async function Businesses({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const session = await getSession(t);
  const sp = await searchParams;
  const T = `tenant_id=${q(t.id)}`;
  const [biz, spots] = await Promise.all([listAll("businesses", T, "", 5000, "-created"), pb.list("spotlights", { filter: T, perPage: 500 })]);
  const st = (b: Rec) => (String(b.verification_state || "unverified")) as BizState;
  const real = biz.filter((b) => !b.is_demo);
  const count = (s: BizState) => real.filter((b) => st(b) === s).length;
  const rows: BizRow[] = biz.map((b) => ({ id: b.id, name: b.name, country: b.country_code ?? "", sector: b.sector ?? "", state: st(b), stateLabel: STATE_LABEL[st(b)], isDemo: !!b.is_demo,
    placement: spots.find((x) => x.business_id === b.id && x.approval_status === "approved")?.placement_type ?? "", created: String(b.created), agents: Array.isArray(b.agent_ids) ? b.agent_ids.length : 0 }));
  const sel = sp.id ? biz.find((b) => b.id === sp.id) : undefined;
  const history = sel ? await pb.list("business_verifications", { filter: `${T} && business_id=${q(sel.id)}`, sort: "-created", perPage: 50 }) : [];
  const agents = sel && Array.isArray(sel.agent_ids) && sel.agent_ids.length
    ? await pb.list("agents", { filter: `${T} && (${(sel.agent_ids as string[]).slice(0, 20).map((id) => `id=${q(id)}`).join(" || ")})`, perPage: 20, fields: "id,display_name,handle,verification_level,kind" }) : [];
  const allowed = (r: "editor" | "tenant_admin") => can(session, "businesses", r === "tenant_admin" ? "approve" : "edit");
  return (
    <AdminPage title="Businesses & Founders"
      narrative={`${real.length.toLocaleString("en")} real business ${real.length === 1 ? "profile" : "profiles"} (${count("verified")} verified by staff, ${count("pending") + count("unverified")} not yet reviewed, ${count("needs_info")} waiting for information) and ${(biz.length - real.length).toLocaleString("en")} demo ${biz.length - real.length === 1 ? "example" : "examples"}. Demo businesses are labelled everywhere and can never be verified. Fictional Exchange companies are separate and never listed here.`}
      actions={<HelpTip label="Business verification" what="A person on the Palavva team checks evidence (for example an official business registry entry, the business's own website or documents) and records what was checked."
        why="A verified badge tells readers the business is real and the people behind it are who they say. Paying for a placement never earns it." todo="Open a business, read its history, then Verify with evidence links, Request information, Reject, Suspend or Reopen. Every decision is kept." />}>
      <section className="kpi-grid">
        <MetricCard label="Real businesses" value={String(real.length)} definition="Profiles that are not demo examples." source="businesses" />
        <MetricCard label="Verified" value={String(count("verified"))} definition="A staff member checked evidence and recorded it." source="businesses + business_verifications" slot={2} />
        <MetricCard label="Not yet reviewed" value={String(count("unverified") + count("pending"))} definition="Waiting for a first review." source="businesses" slot={3} />
        <MetricCard label="Information requested" value={String(count("needs_info"))} definition="Staff asked the business for more evidence." source="businesses" slot={4} />
        <MetricCard label="Rejected / suspended" value={`${count("rejected")} / ${count("suspended")}`} definition="Not shown in the public directory." source="businesses" slot={5} />
        <MetricCard label="Demo examples" value={String(biz.length - real.length)} definition="Sample profiles for testing and demonstrations; never verified, always labelled." source="businesses.is_demo" slot={6} />
      </section>
      <BusinessTable rows={rows} selected={sel?.id} />
      {sel && <section id="review" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="biz-review">
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-bold">{sel.name}{sel.is_demo && <span className="ms-2 rounded-full border px-2 text-xs">Demo example</span>}</h2>
          <p className="text-sm text-muted-foreground">{countryName(sel.country_code ?? "") || "No country"}{sel.sector ? ` · ${sel.sector}` : ""}{sel.region ? ` · ${sel.region}` : ""} · <b data-testid="biz-state">{STATE_LABEL[st(sel)]}</b>
            {sel.profile_status === "published" && <> · <Link className="link" href={`/business/${sel.slug}`}>Public profile</Link></>}</p>
          {sel.about && <p className="mt-2 text-sm">{sel.about}</p>}
          {sel.founder_bio && <p className="mt-2 text-sm"><b>Founder:</b> {sel.founder_bio}</p>}
          {Array.isArray(sel.products) && sel.products.length > 0 && <p className="mt-2 text-sm"><b>Products and services:</b> {(sel.products as string[]).join(", ")}</p>}
          <p className="mt-2 text-sm"><b>Linked agents:</b> {agents.length ? agents.map((a) => `${a.display_name} (@${a.handle}${a.verification_level === "org_verified" ? ", verified affiliation" : ""})`).join(", ") : "none"}</p>
          <h3 className="mt-4 font-bold">Verification history</h3>
          {history.length === 0 ? <p className="text-sm text-muted-foreground">No decisions yet.</p> :
            <ol className="mt-1 divide-y text-sm" data-testid="biz-history">{history.map((h) => <li key={h.id} className="py-2"><b>{ACTION_LABEL[h.action as keyof typeof ACTION_LABEL] ?? h.action}</b>: {STATE_LABEL[h.from_state as BizState] ?? h.from_state} → {STATE_LABEL[h.to_state as BizState] ?? h.to_state}
              <span className="text-xs text-muted-foreground"> · {String(h.created).slice(0, 16)} UTC</span><br />{h.note}
              {Array.isArray(h.evidence) && h.evidence.length > 0 && <ul className="ms-4 list-disc text-xs">{(h.evidence as { url: string; note: string }[]).map((e, i) => <li key={i}>{e.url} {e.note && `— ${e.note}`}</li>)}</ul>}</li>)}</ol>}
        </div>
        <div className="rounded-xl border p-4" data-testid="biz-actions">
          <h3 className="font-bold">Decide</h3>
          {sel.is_demo && <p className="mt-1 text-sm text-muted-foreground">This is a demo example: it can be asked for information or rejected, but never verified.</p>}
          {actionsFor(st(sel), !!sel.is_demo).length === 0 && <p className="text-sm text-muted-foreground">No decision applies in this state.</p>}
          {actionsFor(st(sel), !!sel.is_demo).map((a) => { const r = actionRule(a); return (
            <details key={a} className="mt-2 rounded-lg border p-3" open={a === "verify" ? false : undefined} data-action={a}><summary className="cursor-pointer font-semibold">{ACTION_LABEL[a]} <span className="text-xs font-normal text-muted-foreground">→ {STATE_LABEL[r.to]} · {r.role === "tenant_admin" ? "tenant admins" : "editors and above"}{!allowed(r.role) ? " (not your role)" : ""}</span></summary>
              <AdminForm action={businessDecision} submit={ACTION_LABEL[a]}><input type="hidden" name="id" value={sel.id} /><input type="hidden" name="action" value={a} />
                {r.evidence && [1, 2].map((i) => <div key={i} className="mt-2 grid gap-1 sm:grid-cols-2"><input name={`evidence_url_${i}`} placeholder="https:// link to evidence (registry entry, official site)" className="h-9 rounded-md border bg-background px-2 text-sm" aria-label={`Evidence link ${i}`} />
                  <input name={`evidence_note_${i}`} placeholder="What this link shows" className="h-9 rounded-md border bg-background px-2 text-sm" aria-label={`Evidence note ${i}`} /></div>)}
                <textarea name="note" className="mt-2 min-h-16 w-full rounded-md border bg-background p-2 text-sm" placeholder={`Note (at least ${r.minNote} characters; kept in the history${a === "request_info" ? " and tells the business what is missing" : ""})`} aria-label={`${ACTION_LABEL[a]} note`} />
              </AdminForm></details>); })}
        </div>
      </section>}
    </AdminPage>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession, hasRole } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { decidePiece, editPiece } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Pill, Ago, Table } from "@/components/admin/ui";
import { pieceHref } from "@/components/StoryCard";

export const metadata = { title: "Review" };
type Block = { text: string; claim_ids?: string[] };

export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  const session = (await getSession(t))!;
  const id = (await params).id;
  if (!/^[a-z0-9]{10,20}$/.test(id)) notFound();
  const p = await pb.first("editorial_pieces", `tenant_id=${q(t.id)} && id=${q(id)}`);
  if (!p) notFound();
  const T = `tenant_id=${q(t.id)}`;
  const [claims, links, runs, reviews, comments, revisions] = await Promise.all([
    p.cluster_id ? pb.list("evidence_claims", { filter: `${T} && cluster_id=${q(p.cluster_id)}`, sort: "claim_key", perPage: 50 }) : [],
    p.cluster_id ? pb.list("cluster_sources", { filter: `${T} && cluster_id=${q(p.cluster_id)}`, perPage: 50 }) : [],
    p.cluster_id ? pb.list("ai_runs", { filter: `${T} && cluster_id=${q(p.cluster_id)}`, sort: "created", perPage: 50 }) : [],
    pb.list("editorial_reviews", { filter: `${T} && piece_id=${q(p.id)}`, sort: "-created", perPage: 50 }),
    pb.list("comments", { filter: `${T} && piece_id=${q(p.id)} && author_kind='editorial_ai'`, perPage: 10 }),
    pb.list("piece_revisions", { filter: `${T} && piece_id=${q(p.id)}`, sort: "-revision", perPage: 20 }),
  ]);
  const items = await Promise.all(links.map((l) => pb.get("source_items", l.source_item_id)));
  const srcs = await Promise.all([...new Set(items.filter(Boolean).map((i) => i!.source_id))].map((sid) => pb.get("sources", sid)));
  const body = (p.body_blocks_json ?? {}) as { what_happened?: Block[]; why_it_matters?: Block[]; unknowns?: string[]; questions?: string[]; validation?: { verdict: string; flags: string[] } };
  const flags = body.validation?.flags ?? [];
  const isEditor = hasRole(session, "editor");
  const canApprove = ["needs_review", "changes_requested", "held"].includes(p.review_status) && p.claim_check_status !== "FAIL" && (p.risk_tier === "low" || isEditor);
  return (
    <div className="max-w-6xl">
      <p className="meta"><Link className="link" href="/admin/editorial">Editorial Queue</Link></p>
      <H1 sub={`Revision ${p.revision} · ${p.review_status.replace("_", " ")} · created ${String(p.created).slice(0, 16)} UTC`}>{p.headline}</H1>
      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone={p.risk_tier === "high" ? "bad" : p.risk_tier === "medium" ? "warn" : "neutral"}>Risk: {p.risk_tier}</Pill>
        <Pill tone={p.claim_check_status === "PASS" ? "good" : p.claim_check_status === "FAIL" ? "bad" : "warn"}>Claim check: {p.claim_check_status}</Pill>
        {p.is_demo && <Pill>Demo/fixture</Pill>}
        {p.review_status === "published" && <Link className="link text-sm" href={pieceHref(p)}>View public page</Link>}
      </div>
      {flags.length > 0 && <div className="card mb-4 p-4"><h2 className="font-bold">Validation flags</h2><ul className="mt-1 flex flex-wrap gap-2">{flags.map((f) => <li key={f}><Pill tone={f.startsWith("UNKNOWN") || f.includes("INJECTION") ? "bad" : "warn"}>{f}</Pill></li>)}</ul></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="draft-h">
          <h2 id="draft-h" className="text-lg font-bold">Draft</h2>
          <p className="mt-2 text-muted">{p.lede}</p>
          <h3 className="mt-3 font-semibold">What happened?</h3>{(body.what_happened ?? []).map((b, i) => <p key={i}>{b.text} <span className="meta">[{(b.claim_ids ?? []).join(", ") || "uncited"}]</span></p>)}
          <h3 className="mt-3 font-semibold">Why it matters</h3>{(body.why_it_matters ?? []).map((b, i) => <p key={i}>{b.text} <span className="meta">[{(b.claim_ids ?? []).join(", ") || "uncited"}]</span></p>)}
          {(body.unknowns ?? []).length > 0 && <><h3 className="mt-3 font-semibold">Unknowns</h3><ul className="list-disc pl-5">{body.unknowns!.map((u, i) => <li key={i}>{u}</li>)}</ul></>}
          <h3 className="mt-3 font-semibold">AI role contributions ({comments.length})</h3>
          {comments.map((c) => <p key={c.id} className="mt-1 rounded-lg bg-ai-surface p-2 text-sm"><strong>{c.role_id}</strong> ({c.approval_state}): {c.body_text} <span className="meta">[{(c.claim_ids ?? []).join(", ")}]</span></p>)}
        </section>
        <section className="card p-4" aria-labelledby="ev-h">
          <h2 id="ev-h" className="text-lg font-bold">Claims and evidence</h2>
          <ol className="mt-2 flex flex-col gap-3 text-sm">{claims.map((c) => (
            <li key={c.id}><strong>{c.claim_key}</strong> ({c.kind}, {c.verification_status}): {c.statement}<br /><span className="meta break-all">Evidence: {c.source_locator}</span>{c.uncertainty_note && <><br /><span className="meta">Uncertainty: {c.uncertainty_note}</span></>}</li>))}
          </ol>
          <h3 className="mt-4 font-semibold">Source items and rights</h3>
          <ul className="mt-1 flex flex-col gap-2 text-sm">{items.filter(Boolean).map((it) => { const src = srcs.find((s) => s?.id === it!.source_id); return (
            <li key={it!.id}><a className="link" href={it!.canonical_url} target="_blank" rel="noopener noreferrer">{it!.title}</a><br />
              <span className="meta">{src?.publisher_name} · rights {src?.rights_status} ({src?.usage_policy}) · published <Ago v={it!.published_at} /> · fetched <Ago v={it!.fetched_at} /></span>
              {it!.permitted_excerpt && <p className="meta">Excerpt: {it!.permitted_excerpt}</p>}</li>); })}</ul>
        </section>
      </div>

      <section className="card mt-4 p-4" aria-labelledby="dec-h">
        <h2 id="dec-h" className="text-lg font-bold">Decision</h2>
        {!canApprove && p.review_status !== "published" && <p className="text-sm text-muted">Approve is unavailable: {p.claim_check_status === "FAIL" ? "claim check failed." : p.risk_tier !== "low" && !isEditor ? "medium/high risk needs an editor." : `status is ${p.review_status}.`}</p>}
        <div className="mt-2 grid gap-4 md:grid-cols-2">
          {canApprove && (
            <AdminForm action={decidePiece} submit="Approve and publish" variant="primary" confirm="Publish this piece to readers?">
              <input type="hidden" name="piece_id" value={p.id} /><input type="hidden" name="expected_revision" value={p.revision} /><input type="hidden" name="decision" value="approve" />
              <label className="field-label" htmlFor="ap-reason">Review note {p.claim_check_status === "NEEDS_REVIEW" ? "(required: confirm you checked the flags)" : "(optional)"}</label>
              <textarea id="ap-reason" name="reason" rows={2} className="input" />
            </AdminForm>
          )}
          {p.review_status !== "published" && p.review_status !== "rejected" && p.review_status !== "retracted" && (
            <AdminForm action={decidePiece} submit="Record decision">
              <input type="hidden" name="piece_id" value={p.id} /><input type="hidden" name="expected_revision" value={p.revision} />
              <label className="field-label" htmlFor="dec">Decision</label>
              <select id="dec" name="decision" className="input"><option value="request_changes">Request changes</option><option value="hold">Hold</option><option value="reject">Reject</option></select>
              <label className="field-label" htmlFor="dec-r">Reason</label><textarea id="dec-r" name="reason" rows={2} className="input" required />
            </AdminForm>
          )}
          {p.review_status === "published" && isEditor && (
            <AdminForm action={decidePiece} submit="Retract" confirm="Retract this published piece? Readers will no longer see it.">
              <input type="hidden" name="piece_id" value={p.id} /><input type="hidden" name="expected_revision" value={p.revision} /><input type="hidden" name="decision" value="retract" />
              <label className="field-label" htmlFor="rt">Public retraction reason</label><textarea id="rt" name="reason" rows={2} className="input" />
            </AdminForm>
          )}
        </div>
      </section>

      {isEditor && p.review_status !== "rejected" && p.review_status !== "retracted" && (
        <section className="card mt-4 p-4" aria-labelledby="ed-h">
          <h2 id="ed-h" className="text-lg font-bold">{p.review_status === "published" ? "Publish a correction" : "Edit draft"}</h2>
          <AdminForm action={editPiece} submit={p.review_status === "published" ? "Publish correction" : "Save edit"}>
            <input type="hidden" name="piece_id" value={p.id} /><input type="hidden" name="expected_revision" value={p.revision} />
            <label className="field-label" htmlFor="e-h">Headline</label><input id="e-h" name="headline" defaultValue={p.headline} className="input" maxLength={300} />
            <label className="field-label" htmlFor="e-l">Standfirst</label><textarea id="e-l" name="lede" defaultValue={p.lede} rows={2} className="input" />
            <label className="field-label" htmlFor="e-w">What happened (claim IDs kept)</label><textarea id="e-w" name="what" defaultValue={(body.what_happened ?? []).map((b) => b.text).join(" ")} rows={3} className="input" />
            <label className="field-label" htmlFor="e-y">Why it matters</label><textarea id="e-y" name="why" defaultValue={(body.why_it_matters ?? []).map((b) => b.text).join(" ")} rows={3} className="input" />
            {p.review_status === "published" && <><label className="field-label" htmlFor="e-c">Correction summary shown to readers</label><textarea id="e-c" name="correction_summary" rows={2} className="input" /></>}
          </AdminForm>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Table caption="AI runs for this cluster" head={["Stage", "Role", "Provider/model", "Status", "Time", "Tokens in/out"]} empty="No AI runs.">
          {runs.map((r) => <tr key={r.id}><td className="px-3 py-2">{r.task_type}</td><td className="px-3 py-2">{r.role_id || "–"}</td><td className="px-3 py-2">{r.provider}/{r.model}</td>
            <td className="px-3 py-2">{r.status}{r.error_code ? ` (${r.error_code})` : ""}</td><td className="px-3 py-2">{(r.duration_ms / 1000).toFixed(1)} s</td>
            <td className="px-3 py-2">{r.tokens_json?.input ?? "?"}/{r.tokens_json?.output ?? "?"}</td></tr>)}
        </Table>
        <Table caption="Review and revision history" head={["When", "Decision", "By", "Note"]} empty="No decisions yet.">
          {[...reviews.map((r) => ({ id: r.id, at: r.created, what: r.decision, by: r.reviewer_id, note: r.reason })), ...revisions.map((r) => ({ id: r.id, at: r.created, what: `revision ${r.revision}${r.is_public_correction ? " (public correction)" : ""}`, by: r.approved_by, note: r.change_summary }))]
            .sort((a, b) => b.at.localeCompare(a.at)).map((r) => <tr key={r.id}><td className="px-3 py-2"><Ago v={r.at} /></td><td className="px-3 py-2">{r.what}</td><td className="px-3 py-2">{r.by === session.user.id ? "you" : r.by.slice(0, 6)}</td><td className="px-3 py-2">{r.note}</td></tr>)}
        </Table>
      </div>
    </div>
  );
}

import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { moderate } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Table, Ago } from "@/components/admin/ui";

export const metadata = { title: "Content & Moderation" };

function Act({ kind, id, actions }: { kind: string; id: string; actions: [string, string][] }) {
  return <div className="flex flex-wrap gap-2">{actions.map(([a, l]) => <AdminForm key={a} action={moderate} submit={l}><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="action" value={a} /></AdminForm>)}</div>;
}

export default async function Moderation() {
  const t = await getTenant();
  const T = `tenant_id=${q(t.id)}`;
  const [reports, pending, flagged, corrections, subs] = await Promise.all([
    pb.list("moderation_reports", { filter: `${T} && status='open'`, sort: "created", perPage: 100 }),
    pb.list("comments", { filter: `${T} && author_kind='human' && approval_state='pending'`, sort: "created", perPage: 100 }),
    pb.list("comments", { filter: `${T} && (moderation_status='quarantined' || moderation_status='removed')`, sort: "-updated", perPage: 50 }),
    pb.list("correction_requests", { filter: `${T} && status='open'`, sort: "created", perPage: 100 }),
    pb.list("user_submissions", { filter: `${T} && review_state='queued'`, sort: "created", perPage: 100 }),
  ]);
  const targets = await Promise.all(reports.map((r) => r.target_type === "comment" ? pb.first("comments", `${T} && id=${q(r.target_id)}`) : Promise.resolve(null)));
  return (
    <div className="flex flex-col gap-6">
      <H1 sub="Reports, held comments, correction requests and submissions. Every action is audited.">Content &amp; Moderation</H1>
      <Table caption={`Open reports (${reports.length})`} head={["When", "Target", "Reason", "Notes", "Action"]} empty="No open reports.">
        {reports.map((r, i) => <tr key={r.id}><td className="px-3 py-2"><Ago v={r.created} /></td><td className="px-3 py-2">{r.target_type}{targets[i] ? `: “${targets[i]!.body_text.slice(0, 80)}”` : ` ${r.target_id}`}</td>
          <td className="px-3 py-2">{r.reason}</td><td className="px-3 py-2">{r.notes}</td><td className="px-3 py-2"><Act kind="report" id={r.id} actions={[["quarantine", "Quarantine"], ["dismiss", "Dismiss"]]} /></td></tr>)}
      </Table>
      <Table caption={`Comments waiting for approval (${pending.length})`} head={["When", "Comment", "Action"]} empty="No held comments.">
        {pending.map((c) => <tr key={c.id}><td className="px-3 py-2"><Ago v={c.created} /></td><td className="px-3 py-2 whitespace-pre-line">{c.body_text.slice(0, 400)}</td>
          <td className="px-3 py-2"><Act kind="comment" id={c.id} actions={[["approve", "Approve"], ["remove", "Remove"]]} /></td></tr>)}
      </Table>
      <Table caption="Quarantined or removed comments (appeals)" head={["Updated", "Comment", "State", "Action"]} empty="None.">
        {flagged.map((c) => <tr key={c.id}><td className="px-3 py-2"><Ago v={c.updated} /></td><td className="px-3 py-2">{c.body_text.slice(0, 200)}</td><td className="px-3 py-2">{c.moderation_status}</td>
          <td className="px-3 py-2"><Act kind="comment" id={c.id} actions={[["restore", "Restore"], ["remove", "Remove"]]} /></td></tr>)}
      </Table>
      <Table caption={`Correction requests (${corrections.length})`} head={["When", "Story", "Issue", "Evidence", "Action"]} empty="No open correction requests.">
        {corrections.map((c) => <tr key={c.id}><td className="px-3 py-2"><Ago v={c.created} /></td><td className="px-3 py-2 break-all">{c.story_url}</td><td className="px-3 py-2">{c.issue}</td>
          <td className="px-3 py-2 break-all">{c.evidence_url}</td><td className="px-3 py-2"><Act kind="correction_request" id={c.id} actions={[["accept", "Accept"], ["decline", "Decline"]]} /></td></tr>)}
      </Table>
      <Table caption={`Submissions (${subs.length})`} head={["When", "Kind", "Link", "Reason", "Action"]} empty="No queued submissions.">
        {subs.map((s) => <tr key={s.id}><td className="px-3 py-2"><Ago v={s.created} /></td><td className="px-3 py-2">{s.kind}</td><td className="px-3 py-2 break-all">{s.source_url}</td><td className="px-3 py-2">{s.reason}</td>
          <td className="px-3 py-2"><Act kind="submission" id={s.id} actions={[["accept", "Accept"], ["decline", "Decline"]]} /></td></tr>)}
      </Table>
    </div>
  );
}

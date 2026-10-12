// ISSUE-07 Editorial queue: why each item waits, in plain words, what the refined card rules would do, and a human
// batch release for routine publisher headlines. Nothing old is released automatically.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getSession, hasRole } from "@/lib/session";
import { pb, q, type Rec } from "@/lib/pb";
import { getSwitch } from "@/lib/settings";
import { editorialFetch } from "@/lib/editorial-client";
import { listAll } from "@/lib/admin/fetchall";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { AdminForm } from "@/components/admin/AdminForm";
import { setSwitch } from "@/app/actions/admin";
import { QueueWorkspace, type QueueRow } from "@/components/admin/editorial/QueueWorkspace";

export const metadata = { title: "Editorial queue" };
export const dynamic = "force-dynamic";
const TABS = [["attention", "Needs attention"], ["held", "Held"], ["auto", "Published automatically (7 d)"], ["published", "All published"], ["blocked", "Blocked or retracted"], ["history", "History"]] as const;
const AUTO = ["auto_low_risk", "source_card", "link_signal", "agent"];

function why(p: Rec, dec?: string): [string, string] {
  const b = String(p.risk_basis ?? "");
  if (b.startsWith("withdrawn")) return [b, "Withdrawn"];
  if (b.startsWith("classifier risk tier")) return [`Keyword rule (v1): the headline contains a word on the sensitive list, so a person must check it. ${p.kind === "source_link" ? "Palavva shows the publisher's own headline only." : ""}`, "Sensitive-word rule"];
  if (b.startsWith("card-disposition-v2")) return [b.replace(/^card-disposition-v2 \w+: /, "Refined rule: "), "Refined rule hold"];
  if (dec?.includes("near-duplicate")) return [`Very similar to a story already published: ${dec.replace(/^near-duplicate \([\d.]+\) of recently published topic /, "").replace(/ \(.*$/, "")}. An editor decides whether it adds anything.`, "Near-duplicate"];
  if (dec?.includes("rate cap")) return ["Hourly automatic-publication limit was reached; it will be retried.", "Hourly limit"];
  if (dec?.includes("sensitive")) return ["Sensitive subject: mandatory human review.", "Sensitive subject"];
  if (p.claim_check_status === "NEEDS_REVIEW") return ["The validator could not match every claim to a source.", "Claim questions"];
  if (p.claim_check_status === "FAIL") return ["Claims not supported by the sources.", "Unsupported claims"];
  if (p.risk_tier === "medium") return ["Medium risk (money or uncertain subject): an editor approves.", "Medium risk"];
  return [dec || b || "Waiting for review (no reason recorded).", "Other"];
}
const age = (iso: string) => { const h = (Date.now() - Date.parse(String(iso).replace(" ", "T"))) / 3600_000; return h < 48 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} d`; };

export default async function Queue({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getTenant();
  const session = (await getSession(t))!;
  const raw = (await searchParams).tab ?? "attention";
  const tab = raw === "review" ? "attention" : raw; // v1.3 links used ?tab=review
  const T = `tenant_id=${q(t.id)}`;
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString().replace("T", " ");
  const filter = { attention: "(review_status='needs_review' || review_status='changes_requested')", held: "review_status='held'",
    auto: `review_status='published' && published_at >= ${q(since7)} && (${AUTO.map((x) => `publish_path=${q(x)}`).join(" || ")})`, published: "review_status='published'", blocked: "(review_status='rejected' || review_status='retracted')", history: "" }[tab] ?? "";
  const [rows, counts, switchOn] = await Promise.all([
    filter ? listAll("editorial_pieces", `${T} && ${filter}`, "", tab === "published" ? 500 : 3000, "-created") : Promise.resolve([] as Rec[]),
    Promise.all(["(review_status='needs_review' || review_status='changes_requested')", "review_status='held'", `review_status='published' && published_at >= ${q(since7)} && (${AUTO.map((x) => `publish_path=${q(x)}`).join(" || ")})`,
      `review_status='published' && published_at >= ${q(since7)} && reviewer_id!='' && reviewer_id!~'system:'`].map((f) => pb.count("editorial_pieces", `${T} && ${f}`))),
    getSwitch(t.id, "LINK_POLICY_V2"),
  ]);
  const decs = new Map<string, string>();
  const discIds = rows.filter((r) => r.kind !== "source_link").map((r) => r.id);
  for (let i = 0; i < discIds.length; i += 60) for (const d of await pb.list("moderation_decisions", { filter: `${T} && scope='topic' && (${discIds.slice(i, i + 60).map((x) => `target_id=${q(x)}`).join(" || ")})`, sort: "-created", perPage: 200 }))
    if (!decs.has(d.target_id)) decs.set(d.target_id, d.reasons);
  const cardIds = (tab === "attention" || tab === "held") ? rows.filter((r) => r.kind === "source_link").map((r) => r.id) : [];
  const prev = cardIds.length ? await editorialFetch<{ items: { id: string; decision: string; rule: string; reason: string; matched: string[] }[] }>("/cards/preview", { method: "POST", body: JSON.stringify({ tenant_id: t.id, ids: cardIds }) }, 15000) : null;
  const pm = new Map((prev?.items ?? []).map((x) => [x.id, x]));
  const qrows: QueueRow[] = rows.map((p) => { const [w, c] = tab === "auto" || tab === "published" ? [(AUTO.includes(String(p.publish_path)) ? `Published automatically via ${p.publish_path}` : "Published after human approval"), String(p.publish_path)] : why(p, decs.get(p.id));
    return { id: p.id, headline: p.headline, kind: p.kind, publisher: (p.sources_json ?? [])[0]?.name ?? (p.kind === "agent_post" ? "agent" : "Palavva editorial AI"), countries: (p.country_codes ?? []).join(", "),
      age: age(p.created), created: p.created, risk: p.risk_tier, check: p.claim_check_status, why: w, whyClass: c, preview: pm.get(p.id) }; });
  const history = tab === "history" ? await pb.list("editorial_reviews", { filter: T, sort: "-created", perPage: 200 }) : [];
  const isAdmin = hasRole(session, "tenant_admin");
  return (
    <AdminPage title="Editorial queue" narrative={`${counts[0]} items need attention, ${counts[1]} are held. In the last 7 days ${counts[2]} items were published automatically by named rules and ${counts[3]} were approved by people. Low-risk, rights-cleared items publish automatically; sensitive or unsupported ones wait here. Nothing old is released without a person.`}
      actions={<HelpTip label="Why things wait here" what="Each item shows the exact rule that stopped automatic publication, in plain words. 'Publisher headline' items are the publisher's own words with a link; Palavva adds nothing. AI-written items must also pass a claim check."
        why="A trusted newspaper is good evidence of where a story came from, but not proof of every claim. Routine attributed news can flow; violence, incitement, health scares and unsupported AI claims need a person."
        todo="Use the filters to find routine items, open any item to review it, or release a small checked batch of publisher headlines that the refined rules would publish." />}>
      <section className="kpi-grid" aria-label="Queue">
        <MetricCard label="Needs attention" value={String(counts[0])} definition="Waiting for a person: sensitive words, claim questions, near-duplicates or rate limits." source="editorial_pieces" />
        <MetricCard label="Held" value={String(counts[1])} definition="Held on purpose (for example an AI draft that repeats a published story)." source="editorial_pieces" />
        <MetricCard label="Published automatically (7 d)" value={String(counts[2])} definition="Published by a named automatic rule: low-risk AI drafts, publisher cards, agent posts." source="editorial_pieces" />
        <MetricCard label="Approved by people (7 d)" value={String(counts[3])} definition="Published after a recorded human approval." source="editorial_pieces" />
      </section>
      <section className="rounded-xl border p-3 text-sm" data-testid="refined-switch">
        <p><b>Refined rules for publisher headlines are {switchOn ? "ON" : "OFF"}.</b> {switchOn ? "New publisher headlines with routine attributed news (politics, courts, police statements, markets) publish automatically; violence, incitement, conflict, health scares and kidnapping still wait." : "New publisher headlines containing any listed sensitive word wait here, even routine court or election news. Turning the refined rules on lets routine attributed headlines flow; violence, incitement, conflict, health scares and kidnapping still wait. This is a publication-policy decision for the founder."}</p>
        {isAdmin && <AdminForm action={setSwitch} submit={switchOn ? "Turn refined rules off" : "Turn refined rules on"} className="mt-2" confirm={switchOn ? "Turn the refined rules off?" : "Turn the refined rules on for NEW publisher headlines? Held items are not released by this."}>
          <input type="hidden" name="key" value="LINK_POLICY_V2" /><input type="hidden" name="value" value={switchOn ? "false" : "true"} />
          <label className="text-xs" htmlFor="sw-reason">Reason (required, recorded in the audit log)</label><input id="sw-reason" name="reason" className="input max-w-xl" /></AdminForm>}
      </section>
      <nav aria-label="Queue tabs" className="flex flex-wrap gap-2" data-testid="queue-tabs">{TABS.map(([k, l]) => <Link key={k} href={`/admin/editorial?tab=${k}`} aria-current={tab === k ? "page" : undefined}
        className={`rounded-full border px-3 py-1 text-sm font-semibold ${tab === k ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{l}</Link>)}</nav>
      {tab === "history" ? (
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[720px] text-sm" data-testid="queue-history"><thead className="bg-card text-xs text-muted-foreground"><tr>
          <th className="px-3 py-2 text-start">When (UTC)</th><th className="px-3 py-2 text-start">Decision</th><th className="px-3 py-2 text-start">By</th><th className="px-3 py-2 text-start">Reason</th><th className="px-3 py-2 text-start">Item</th></tr></thead>
          <tbody className="divide-y">{history.map((h) => <tr key={h.id}><td className="whitespace-nowrap px-3 py-2">{String(h.created).slice(0, 16)}</td><td className="px-3 py-2">{h.decision}</td>
            <td className="px-3 py-2 text-xs">{String(h.reviewer_id).startsWith("system:") ? h.reviewer_id.replace("system:", "automatic: ") : "person"}</td><td className="max-w-[60ch] px-3 py-2 text-xs">{h.reason}</td>
            <td className="px-3 py-2"><Link className="link text-xs" href={`/admin/editorial/${h.piece_id}`}>open</Link></td></tr>)}</tbody></table></div>
      ) : <QueueWorkspace rows={qrows} canRelease={hasRole(session, "editor") && (tab === "attention" || tab === "held")} switchOn={switchOn} />}
    </AdminPage>
  );
}

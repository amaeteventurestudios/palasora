import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getPublicCorrections } from "@/lib/repo/pieces";
import { pb, q } from "@/lib/pb";
import { CorrectionForm } from "@/components/forms/CorrectionForm";
import { fullDate, parsePbDate, safeNext } from "@/lib/format";
export const metadata = { title: "Corrections" };
export const dynamic = "force-dynamic";
export default async function Corrections({ searchParams }: { searchParams: Promise<{ story?: string }> }) {
  const t = await getTenant();
  const story = safeNext((await searchParams).story, "");
  const list = await getPublicCorrections(t);
  const pieces = list.length ? await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && review_status='published' && (${list.map((c) => `id=${q(c.piece_id)}`).join(" || ")})`, perPage: 100 }) : [];
  const pm = new Map(pieces.map((p) => [p.id, p]));
  return (
    <div className="container-pv max-w-3xl py-10">
      <h1 className="text-[34px] font-extrabold">Getting the record right matters.</h1>
      <p className="mt-2 text-muted">If a story contains an error, tell us exactly what needs review. Helpful source links make it easier to verify the record.</p>
      <h2 className="mt-8 text-xl font-bold">Published corrections</h2>
      {list.length === 0 ? <p className="mt-2">There are no public correction entries in this view.</p> : (
        <ul className="mt-2 divide-y divide-border">{list.map((c) => { const p = pm.get(c.piece_id); return (
          <li key={c.id} className="py-3"><p className="font-semibold">{p ? <Link className="link" href={`/${p.kind === "story" ? "story" : "discussion"}/${p.slug}`}>{p.headline}</Link> : "Story"}</p>
            <p>{c.summary}</p><p className="meta"><time dateTime={parsePbDate(c.public_at)?.toISOString()}>{fullDate(parsePbDate(c.public_at))}</time></p></li>); })}</ul>
      )}
      <section id="request" className="card mt-8 scroll-mt-20 p-6"><h2 className="mb-4 text-xl font-bold">Request a correction</h2><CorrectionForm story={story ? `http://${t.host}${story}` : ""} /></section>
    </div>
  );
}

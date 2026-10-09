import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getPublishedPiece, getTimeLens } from "@/lib/repo/pieces";
import { pb, q } from "@/lib/pb";
import { pieceHref } from "@/components/StoryCard";

export const dynamic = "force-dynamic";
const ERAS = ["1950s", "1960s", "1980s", "1990s", "2000s", "Today"];

export default async function TimeLens({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ era?: string }> }) {
  const tenant = await getTenant();
  const piece = await getPublishedPiece(tenant, (await params).slug);
  if (!piece) notFound();
  const era = (await searchParams).era;
  const entries = await getTimeLens(tenant, piece.id);
  const shown = era ? entries.filter((e) => e.era === era) : entries;
  const archiveIds = [...new Set(shown.flatMap((e) => e.archive_source_ids ?? []))] as string[];
  const archives = archiveIds.length ? await pb.list("archive_sources", { filter: `tenant_id=${q(tenant.id)} && verified=true && (${archiveIds.map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 50 }) : [];
  const list = (xs: unknown) => (Array.isArray(xs) ? (xs as string[]) : []);
  return (
    <div className="container-pv max-w-4xl py-8">
      <p className="meta"><Link className="link" href={pieceHref(piece)}>Back to: {piece.headline}</Link></p>
      <h1 className="mt-2 text-3xl font-extrabold">The past has something to teach us.</h1>
      <p className="mt-1 text-muted">See where today&apos;s developments connect to earlier choices, and where the comparisons stop making sense.</p>
      <div role="group" aria-label="Take me back to..." className="scroll-row mt-4">
        <span className="self-center text-sm font-semibold">Take me back to...</span>
        {ERAS.map((e) => <Link key={e} href={`/time-lens/${piece.slug}?era=${e}`} className="chip" aria-current={era === e ? "true" : undefined}>{e}</Link>)}
      </div>
      {shown.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border p-5" style={{ background: "var(--gold-surface)" }}>
          <p className="font-semibold" style={{ color: "var(--gold-ink)" }}>No verified archival material for this period yet.</p>
          <p className="mt-1">We haven&apos;t found reliable records for this comparison yet. We won&apos;t invent the missing history.</p>
        </div>
      ) : shown.map((e) => (
        <section key={e.id} className="card mt-6 p-5" style={{ borderTop: "4px solid var(--brand-gold)" }}>
          <h2 className="text-xl font-bold">{e.era}: {e.title}</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div><h3 className="font-semibold">Then</h3><ul className="list-disc ps-5">{list(e.then_points).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div><h3 className="font-semibold">Now</h3><ul className="list-disc ps-5">{list(e.now_points).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div><h3 className="font-semibold">What&apos;s similar</h3><ul className="list-disc ps-5">{list(e.similarities).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div><h3 className="font-semibold">What&apos;s different</h3><ul className="list-disc ps-5">{list(e.differences).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          </div>
          <h3 className="mt-3 font-semibold">What isn&apos;t clear</h3><ul className="list-disc ps-5">{list(e.unknowns).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      ))}
      {archives.length > 0 && <section className="mt-6"><h2 className="text-xl font-bold">Original records</h2>
        <ul className="mt-2">{archives.map((a) => <li key={a.id}><a className="link" href={a.citation_url} target="_blank" rel="noopener noreferrer">{a.institution}: {a.document_id}</a> ({a.source_date})</li>)}</ul></section>}
      <p className="meta mt-6">History can help us ask better questions. It doesn&apos;t guarantee the same outcome.</p>
    </div>
  );
}

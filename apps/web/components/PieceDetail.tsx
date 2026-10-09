import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getTenant, originFor, type Tenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q, type Rec } from "@/lib/pb";
import { getClaims, getDiscussion, getPublicCorrections, getPublishedPiece, getRedirect, getTimeLens, relatedPieces, toSummary } from "@/lib/repo/pieces";
import { taxonomy } from "@/lib/repo/taxonomy";
import { fullDate, parsePbDate } from "@/lib/format";
import { DemoBadge, KindBadge } from "./Labels";
import { Kicker, StoryCard, pieceHref } from "./StoryCard";
import { AIContribution, AINote, ClaimText, HumanComment, SourceCitation, TimeLensEmpty, type Block } from "./Editorial";
import { ShareBar } from "./ShareBar";
import { CommentForm } from "./CommentForm";
import { SaveButton, VoteButton } from "./MemberButtons";
import { ReportForm } from "./ReportForm";
import { StoryTracker } from "./StoryTracker";
import { SponsoredSlot } from "./SponsoredSlot";

export async function loadPiece(slug: string, kind: "story" | "discussion") {
  const tenant = await getTenant();
  const piece = await getPublishedPiece(tenant, slug);
  if (!piece) {
    const to = await getRedirect(tenant, `/${kind}/${slug}`);
    if (to) permanentRedirect(to);
    notFound();
  }
  return { tenant, piece };
}

export async function pieceMetadata(slug: string, kind: "story" | "discussion"): Promise<Metadata> {
  const tenant = await getTenant();
  const piece = await getPublishedPiece(tenant, slug);
  if (!piece) return { title: "Not found", robots: { index: false } };
  const url = `${originFor(tenant)}${pieceHref(piece)}`;
  const img = `${originFor(tenant)}/og/${piece.slug}?v=${piece.revision ?? 1}`;
  return {
    title: piece.headline,
    description: piece.lede,
    alternates: { canonical: url },
    // Demo fixtures and demo tenants are never indexed (01 §5).
    robots: piece.is_demo || tenant.isDemo ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { type: "article", title: piece.headline, description: piece.lede, url, siteName: tenant.slug === "palavva" ? "Palavva" : tenant.name,
      images: [{ url: img, width: 1200, height: 630, alt: piece.headline }], publishedTime: parsePbDate(piece.first_published_at)?.toISOString(),
      modifiedTime: parsePbDate(piece.material_updated_at)?.toISOString() },
    twitter: { card: "summary_large_image", title: piece.headline, description: piece.lede, images: [img] },
  };
}

function articleJsonLd(tenant: Tenant, piece: Rec, url: string) {
  return {
    "@context": "https://schema.org", "@type": "NewsArticle", headline: piece.headline, description: piece.lede,
    datePublished: parsePbDate(piece.first_published_at)?.toISOString(), dateModified: parsePbDate(piece.material_updated_at)?.toISOString(),
    mainEntityOfPage: url, image: [`${originFor(tenant)}/og/${piece.slug}`],
    author: { "@type": "Organization", name: "Palavva Editorial" }, publisher: { "@type": "Organization", name: "Palavva" },
    isBasedOn: (piece.sources_json ?? []).map((s: { url: string }) => s.url),
  };
}

export async function PieceDetail({ tenant, piece, kind }: { tenant: Tenant; piece: Rec; kind: "story" | "discussion" }) {
  const session = await getSession(tenant);
  const [tax, claims, disc, corrections, lens, related, roles] = await Promise.all([
    taxonomy(), getClaims(tenant, piece.cluster_id), getDiscussion(tenant, piece.id), getPublicCorrections(tenant, piece.id),
    getTimeLens(tenant, piece.id), relatedPieces(tenant, piece), pb.list("ai_roles", { filter: `tenant_id=${q(tenant.id)}`, perPage: 20 }),
  ]);
  const [myVote, mySave] = session ? await Promise.all([
    pb.first("votes", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && target_kind='piece' && target_id=${q(piece.id)}`),
    pb.first("saves", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && piece_id=${q(piece.id)}`),
  ]) : [null, null];
  const names = { countries: Object.fromEntries(tax.countries.map((c) => [c.iso2, c.name])), topics: Object.fromEntries(tax.topics.map((t) => [t.slug, t.name])) };
  const roleLabel = Object.fromEntries(roles.map((r) => [r.key, r.label]));
  const body = (piece.body_blocks_json ?? {}) as { what_happened?: Block[]; why_it_matters?: Block[]; unknowns?: string[]; questions?: string[] };
  const claimIndex: Record<string, number> = Object.fromEntries(claims.map((c, i) => [c.claim_key, i + 1]));
  const summary = toSummary(piece);
  const url = `${originFor(tenant)}${pieceHref(summary)}`;
  const path = pieceHref(summary);
  const published = parsePbDate(piece.first_published_at || piece.published_at);
  const updated = parsePbDate(piece.material_updated_at);
  const wasUpdated = published && updated && updated.getTime() - published.getTime() > 60_000;
  const signedIn = !!session;
  const verified = !!session?.user.verified;
  return (
    <article className="container-pv pt-6">
      <StoryTracker storyId={piece.id} country={summary.country_codes[0]} topic={summary.topic_slugs[0]} />
      {!piece.is_demo && !tenant.isDemo && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(tenant, piece, url)).replace(/</g, "\\u003c") }} />
      )}
      <nav aria-label="Breadcrumb" className="meta mb-3">
        <ol className="flex flex-wrap gap-1">
          <li><Link href="/" className="hover:underline">Home</Link> /</li>
          {summary.country_codes[0] && <li><Link href={`/country/${tax.countries.find((c) => c.iso2 === summary.country_codes[0])?.slug ?? ""}`} className="hover:underline">{names.countries[summary.country_codes[0]]}</Link> /</li>}
          {summary.topic_slugs[0] && <li><Link href={`/topic/${summary.topic_slugs[0]}`} className="hover:underline">{names.topics[summary.topic_slugs[0]]}</Link></li>}
        </ol>
      </nav>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <header className="max-w-[760px]">
            <div className="flex flex-wrap items-center gap-2">
              {piece.is_demo && <DemoBadge />}
              <KindBadge kind={piece.kind} />
              {piece.still_developing && <span className="label-pill label-human">Still developing</span>}
              <Kicker p={summary} names={names} />
            </div>
            <h1 className="mt-3 text-[28px] font-extrabold leading-[1.15] tracking-tight sm:text-[38px]">{piece.headline}</h1>
            {piece.lede && <p className="mt-3 text-[18px] leading-relaxed text-muted">{piece.lede}</p>}
            <p className="meta mt-3">
              {published && <>Published <time dateTime={published.toISOString()}>{fullDate(published)}</time></>}
              {wasUpdated && updated && <> · Updated <time dateTime={updated.toISOString()}>{fullDate(updated)}</time></>}
              {summary.sources[0] && <> · Source: {summary.sources.map((s) => s.name).join(", ")}</>}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <VoteButton kind="piece" id={piece.id} score={piece.vote_score ?? 0} voted={!!myVote} signedIn={signedIn} returnPath={path} />
              <SaveButton id={piece.id} saved={!!mySave} signedIn={signedIn} returnPath={path} />
              <Link href="#conversation" className="btn btn-secondary !min-h-[40px] !px-3 text-sm">{summary.counts.human_comments} human {summary.counts.human_comments === 1 ? "reply" : "replies"}</Link>
            </div>
          </header>

          {corrections.length > 0 && (
            <aside className="mt-5 max-w-[760px] rounded-xl border border-border bg-card-muted p-4" role="note" aria-label="Correction">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} aria-hidden="true" />Correction</p>
              {corrections.map((c) => (
                <p key={c.id} className="mt-1 text-sm">{c.summary} <span className="meta">(<time dateTime={parsePbDate(c.public_at)?.toISOString()}>{fullDate(parsePbDate(c.public_at))}</time>)</span></p>
              ))}
              <Link href="/corrections" className="mt-1 inline-block text-sm link">See correction and revision history</Link>
            </aside>
          )}

          <div className="prose-pv mt-6 max-w-[720px] text-[17px] leading-[1.7]">
            <h2>What happened?</h2>
            {(body.what_happened ?? []).map((b, i) => <ClaimText key={i} block={b} claimIndex={claimIndex} />)}
            {(body.why_it_matters ?? []).length > 0 && <><h2>Why it matters</h2>{body.why_it_matters!.map((b, i) => <ClaimText key={i} block={b} claimIndex={claimIndex} />)}</>}
          </div>

          <section aria-labelledby="sources-h" className="mt-6 max-w-[760px]">
            <h2 id="sources-h" className="text-[22px] font-bold">Read the sources</h2>
            {summary.sources.length ? <ol className="divide-y divide-border">{summary.sources.map((s, i) => <SourceCitation key={i} s={s} i={i} />)}</ol>
              : <p className="text-muted">This draft cannot be published until its claims are supported.</p>}
            {claims.length > 0 && (
              <details className="mt-2 rounded-xl border border-border bg-card p-4">
                <summary className="cursor-pointer font-semibold">Evidence for each claim ({claims.length})</summary>
                <ol className="mt-3 flex flex-col gap-3 text-sm">
                  {claims.map((c, i) => (
                    <li key={c.id} id={`evidence-${c.claim_key}`} className="scroll-mt-20">
                      <span className="font-semibold">[{i + 1}]</span> {c.statement} <span className="meta">({c.kind}; {c.verification_status.replace("_", " ")})</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </section>

          {disc.ai.length > 0 && (
            <section aria-labelledby="ai-h" className="mt-8 max-w-[760px]">
              <h2 id="ai-h" className="text-[22px] font-bold">AI analysis</h2>
              <AINote />
              <div className="mt-3 flex flex-col gap-3">
                {disc.ai.slice(0, 3).map((c) => <AIContribution key={c.id} c={c} roleLabel={roleLabel[c.role_id] ?? "Editorial AI"} claimIndex={claimIndex} />)}
              </div>
            </section>
          )}

          {(body.unknowns ?? []).length > 0 && (
            <section aria-labelledby="unk-h" className="mt-8 max-w-[760px]">
              <h2 id="unk-h" className="text-[22px] font-bold">What we still don&apos;t know</h2>
              <ul className="mt-2 list-disc pl-6">{body.unknowns!.map((u, i) => <li key={i}>{u}</li>)}</ul>
            </section>
          )}

          <section aria-labelledby="lens-h" className="mt-8 max-w-[760px]">
            <h2 id="lens-h" className="text-[22px] font-bold">A look back</h2>
            <div className="mt-2">
              {lens.length ? lens.map((l) => (
                <Link key={l.id} href={`/time-lens/${piece.slug}?era=${l.era}`} data-time-lens className="block rounded-xl border border-border p-4 hover:bg-card-muted" style={{ background: "var(--gold-surface)" }}>
                  <span className="font-semibold">{l.era}: {l.title}</span>
                </Link>
              )) : <TimeLensEmpty slug={piece.slug} />}
            </div>
          </section>

          <section className="mt-8 max-w-[760px] border-y border-border py-4">
            <ShareBar url={url} title={piece.headline} storyId={piece.id} />
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <ReportForm type="piece" id={piece.id} />
              <Link href={`/corrections?story=${encodeURIComponent(path)}#request`} className="text-sm link">Request a correction</Link>
            </div>
          </section>

          <section id="conversation" aria-labelledby="conv-h" className="mt-8 max-w-[760px] scroll-mt-20">
            <h2 id="conv-h" className="text-[22px] font-bold">The conversation</h2>
            <p className="meta">{disc.human.length} community {disc.human.length === 1 ? "response" : "responses"}{disc.ai.length ? ` · ${disc.ai.length} AI ${disc.ai.length === 1 ? "contribution" : "contributions"} shown separately above` : ""}</p>
            {(body.questions ?? []).length > 0 && <p className="mt-3 rounded-lg bg-card-muted p-3 text-[15px]"><span className="font-semibold">A question worth asking: </span>{body.questions![0]}</p>}
            <div className="mt-2">
              {disc.human.length === 0 ? <p className="py-4 text-muted">No community responses yet. Start the conversation.</p> :
                disc.human.map((c) => (
                  <HumanComment key={c.id} c={c}>
                    <VoteButton kind="comment" id={c.id} score={c.vote_score} voted={false} signedIn={signedIn} returnPath={`${path}#comment-${c.id}`} label="Upvote comment" />
                    <ReportForm type="comment" id={c.id} />
                  </HumanComment>
                ))}
            </div>
            <div className="mt-4">
              {disc.discussion?.status === "open" ? (
                <CommentForm pieceId={piece.id} returnPath={`${path}#conversation`} signedIn={signedIn} verified={verified} />
              ) : <p className="text-muted">This conversation is closed to new replies.</p>}
              {!signedIn && (
                <noscript><p className="mt-2 text-sm"><Link className="link" href={`/auth/sign-in?next=${encodeURIComponent(`${path}#conversation`)}`}>Log in to comment</Link></p></noscript>
              )}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:col-span-4" aria-label="Related">
          <div className="card p-5">
            <h2 className="text-lg font-bold">Related conversations</h2>
            {related.length === 0 ? <p className="mt-2 text-sm text-muted">No related conversations yet.</p> :
              <ul className="mt-2 flex flex-col gap-3">{related.map((r) => <li key={r.id}><StoryCard p={r} names={names} /></li>)}</ul>}
          </div>
          <SponsoredSlot tenant={tenant} position="topic_hub" />
        </aside>
      </div>
    </article>
  );
}

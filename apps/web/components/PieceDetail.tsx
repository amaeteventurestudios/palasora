import { GlossNote } from "./live/PostCard";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AlertTriangle, User } from "lucide-react";
import { getTenant, originFor, type Tenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q, type Rec } from "@/lib/pb";
import { getDiscussion, getPublicCorrections, getPublishedPiece, getRedirect, relatedPieces, toSummary } from "@/lib/repo/pieces";
import { taxonomy } from "@/lib/repo/taxonomy";
import { fullDate, parsePbDate } from "@/lib/format";
import { DemoBadge, KindBadge } from "./Labels";
import { Kicker, StoryCard, pieceHref } from "./StoryCard";
import { AINote, SourceCitation } from "./Editorial";
import { getThreadPosts, latestSeq } from "@/lib/repo/thread";
import { getT, localeInfo } from "@/lib/i18n/context";
import { localizePiece } from "@/lib/repo/localize";
import { TranslationBar } from "./TranslationBar";
import { LiveCount, LiveEventsProvider } from "./live/LiveEvents";
import { LiveThread } from "./live/LiveThread";
import { ShareBar } from "./ShareBar";
import { EngagementBeacon } from "./EngagementBeacon";
import { SaveButton } from "./MemberButtons";
import { LiveScore } from "./social/LiveBits";
import { ThreadParticipation } from "./social/ThreadParticipation";
import { AgentAvatar } from "./social/AgentAvatar";
import { AgentBadge } from "./social/AgentBadge";
import { POST_LABELS } from "./social/AgentPostCard";
import { toAgentView } from "@/lib/social/agents";
import { myVotes } from "@/lib/social/human";
import { ReportForm } from "./ReportForm";
import { StoryTracker } from "./StoryTracker";
import { SponsoredSlot } from "./SponsoredSlot";

export async function loadPiece(slug: string, kind: "posts") {
  const tenant = await getTenant();
  const piece = await getPublishedPiece(tenant, slug);
  if (!piece) {
    const to = await getRedirect(tenant, `/${kind}/${slug}`);
    if (to) permanentRedirect(to);
    notFound();
  }
  return { tenant, piece };
}

export async function pieceMetadata(slug: string, kind: "posts"): Promise<Metadata> {
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

function articleJsonLd(piece: Rec, url: string) {
  return {
    "@context": "https://schema.org", "@type": "DiscussionForumPosting", headline: piece.headline, text: piece.lede, url,
    datePublished: parsePbDate(piece.first_published_at)?.toISOString(),
    author: piece.kind === "human_post" ? { "@type": "Person", name: "Palasora member" } : piece.kind === "town_event" ? { "@type": "Organization", name: "Palasora town record" } : { "@type": "Thing", name: "AI agent on Palasora" },
  };
}

export async function PieceDetail({ tenant, piece: canonical, kind, showOriginal = false }: { tenant: Tenant; piece: Rec; kind: "posts"; showOriginal?: boolean }) {
  const session = await getSession(tenant);
  const { t, ctx } = await getT(tenant);
  const loc = await localizePiece(tenant, canonical, ctx.reading);
  const piece = showOriginal ? canonical : loc.piece;
  const lname = (c: string) => localeInfo(c)?.native ?? c;
  const srcLang = (canonical.sources_json ?? [])[0]?.language as string | undefined;
  const [tax, disc, corrections, related, threadPosts, cursor] = await Promise.all([
    taxonomy(), getDiscussion(tenant, piece.id), getPublicCorrections(tenant, piece.id), relatedPieces(tenant, piece),
    getThreadPosts(tenant, piece.id), latestSeq(tenant),
  ]);
  const mySave = session ? await pb.first("saves", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && piece_id=${q(piece.id)}`) : null;
  const isHumanPost = piece.kind === "human_post";
  const isTownEvent = piece.kind === "town_event"; // Palasora Phase 4: one stored town event, shown in its town's SubPal
  const isAgentPost = piece.kind === "agent_post" || isHumanPost || isTownEvent; // community posts (body, SubPal, label)
  const [authorRec, subpalRec, personRec] = isAgentPost ? await Promise.all([!isHumanPost && piece.author_agent_id ? pb.get("agents", piece.author_agent_id) : null,
    piece.community_id ? pb.get("communities", piece.community_id) : null, isHumanPost && piece.author_user_id ? pb.get("users", piece.author_user_id) : null]) : [null, null, null];
  const author = authorRec && authorRec.tenant_id === tenant.id ? toAgentView(authorRec) : null;
  const person = personRec && personRec.tenant_id === tenant.id ? { handle: String(personRec.handle), display_name: String(personRec.display_name || personRec.handle) } : null;
  const votes = session ? await myVotes(tenant, session.user.id, [piece.id, ...threadPosts.map((p) => p.id)]) : {};
  const names = { countries: Object.fromEntries(tax.countries.map((c) => [c.iso2, c.name])), topics: Object.fromEntries(tax.topics.map((t) => [t.slug, t.name])) };
  const body = (piece.body_blocks_json ?? {}) as { questions?: string[] };
  const summary = toSummary(piece);
  const url = `${originFor(tenant)}${pieceHref(summary)}`;
  const path = pieceHref(summary);
  const published = parsePbDate(piece.first_published_at || piece.published_at);
  const updated = parsePbDate(piece.material_updated_at);
  const wasUpdated = published && updated && updated.getTime() - published.getTime() > 60_000;
  const signedIn = !!session;
  const verified = !!session?.user.verified;
  return (
    <LiveEventsProvider cursor={cursor} piece={piece.id}>
    <article className="container-pv pt-6">
      <StoryTracker storyId={piece.id} country={summary.country_codes[0]} topic={summary.topic_slugs[0]} />
      {!piece.is_demo && !tenant.isDemo && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(piece, url)).replace(/</g, "\\u003c") }} />
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
            {isAgentPost ? (
              <div className="flex flex-wrap items-center gap-2 text-[14px]" data-testid="post-author">
                {author && <><AgentAvatar handle={author.handle} glyph={author.glyph} avatarUrl={author.avatar_url} size={34} />
                  <Link href={`/agents/${author.handle}`} className="font-bold hover:underline">{author.display_name}</Link>
                  <AgentBadge kind={author.kind} level={author.verification_level} /></>}
                {isHumanPost && <><span className="label-pill label-human" data-testid="person-label"><User size={12} aria-hidden="true" />Person</span>
                  {person ? <Link href={`/profile/${person.handle}`} className="font-bold hover:underline">{person.display_name}</Link> : <span className="font-bold">Deleted account</span>}</>}
                {isTownEvent && <span className="label-pill label-human" data-testid="town-label">Town record</span>}
                {subpalRec && <><span className="text-muted-foreground">in</span><Link href={`/p/${subpalRec.slug}`} className="font-semibold link">p/{subpalRec.slug}</Link></>}
                <span className="label-pill label-status">{isTownEvent ? "Town event" : POST_LABELS[piece.post_label] ?? "Community Discussion"}{author?.hosting === "external" && !summary.sources.length ? " · unverified" : ""}</span>
              </div>
            ) : (
            <div className="flex flex-wrap items-center gap-2">
              {piece.is_demo && <DemoBadge />}
              <KindBadge kind={piece.kind} />
              {piece.still_developing && <span className="label-pill label-human">Still developing</span>}
              <Kicker p={summary} names={names} />
            </div>
            )}
            <h1 className="mt-3 text-[28px] font-extrabold leading-[1.15] tracking-tight sm:text-[38px]" lang={piece.language || undefined} dir="auto">{piece.headline}</h1>
            {piece.lede && <p className="mt-3 text-[18px] leading-relaxed text-muted-foreground">{piece.lede}</p>}
            <p className="meta mt-3">
              {published && <>Published <time dateTime={published.toISOString()}>{fullDate(published)}</time></>}
              {wasUpdated && updated && <> · Updated <time dateTime={updated.toISOString()}>{fullDate(updated)}</time></>}
              {summary.sources[0] && <> · Source: {summary.sources.map((s) => s.name).join(", ")}</>}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="btn btn-secondary !min-h-[40px] !cursor-default !px-2 text-sm"><LiveScore kind="piece" id={piece.id} up={piece.up_votes ?? 0} down={piece.down_votes ?? 0}
                signedIn={signedIn} mine={votes[piece.id] ?? 0} own={isHumanPost && !!session && piece.author_user_id === session.user.id} returnPath={path} /></span>
              <SaveButton id={piece.id} saved={!!mySave} signedIn={signedIn} returnPath={path} />
              <Link href="#conversation" className="btn btn-secondary !min-h-[40px] !px-3 text-sm"><LiveCount pieceId={piece.id} initial={threadPosts.filter((p) => p.author_kind === "editorial_ai" || p.author_kind === "agent").length} kind="ai" one="AI reply" many="AI replies" /></Link>
            </div>
          </header>

          <TranslationBar status={loc.translation.status} fromLabel={lname(loc.translation.from)} toLabel={lname(loc.translation.to)} path={path}
            showingOriginal={showOriginal} localizationId={loc.translation.localization_id} originalUrl={(canonical.sources_json ?? [])[0]?.url}
            sourceLangLabel={srcLang && srcLang !== "en" ? lname(srcLang) : undefined} />
          {corrections.length > 0 && (
            <aside className="mt-5 max-w-[760px] rounded-xl border border-border bg-card-muted p-4" role="note" aria-label="Correction">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} aria-hidden="true" />Correction</p>
              {corrections.map((c) => (
                <p key={c.id} className="mt-1 text-sm">{c.summary} <span className="meta">(<time dateTime={parsePbDate(c.public_at)?.toISOString()}>{fullDate(parsePbDate(c.public_at))}</time>)</span></p>
              ))}
              <Link href="/corrections" className="mt-1 inline-block text-sm link">See correction and revision history</Link>
            </aside>
          )}

          {isAgentPost ? (
            <div className="mt-6 max-w-[720px] whitespace-pre-line text-[17px] leading-[1.7]" data-testid="post-body"><div lang={piece.language || "en"} dir="auto">{String((piece.body_blocks_json ?? {}).post_body ?? piece.lede)}</div>
              <GlossNote language={piece.language} gloss={String((piece.body_blocks_json ?? {}).gloss_en ?? "")} />
              {piece.correction_note && <p className="meta mt-3">{piece.correction_note}</p>}
              {isTownEvent ? <p className="meta mt-4" data-testid="town-record-note">Written by the town from a stored event, not by a person or an AI. <Link href={`/town/event/${piece.town_event_id}`} className="link">See the live record</Link> for today&apos;s numbers.</p>
                : isHumanPost ? <p className="meta mt-4">Written by a person. Palasora&apos;s community rules checked it before publication; facts in it are the writer&apos;s own and have not been verified.</p>
                : <p className="meta mt-4">Written and published by an AI agent{author?.kind === "palavva_ai" ? " operated by Palavva" : ""}. {author?.hosting === "external" ? "Facts in this post are the agent's own claims; Palavva has not verified them." : "Palavva's rules checked it for unsupported names, numbers and unsafe content before publication."}</p>}
            </div>
          ) : null}
          <section aria-labelledby="sources-h" className="mt-6 max-w-[760px]">
            <h2 id="sources-h" className="text-[22px] font-bold">{t("story.sources")}</h2>
            {summary.sources.length ? <ol className="divide-y divide-border">{summary.sources.map((s, i) => <SourceCitation key={i} s={s} i={i} />)}</ol>
              : isHumanPost ? <p className="text-muted-foreground">No source attached. Treat this as the writer&apos;s own question or opinion.</p>
              : isAgentPost ? <p className="text-muted-foreground">No source attached. Treat this as the agent&apos;s own question or opinion.</p>
              : <p className="text-muted-foreground">No source attached.</p>}
          </section>

          <section className="mt-8 max-w-[760px] border-y border-border py-4">
            <ShareBar url={url} title={piece.headline} storyId={piece.id} />
            <EngagementBeacon pieceId={piece.id} />
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <ReportForm type="piece" id={piece.id} />
              <Link href={`/corrections?story=${encodeURIComponent(path)}#request`} className="text-sm link">Request a correction</Link>
            </div>
          </section>

          {/* ISSUE-16: one sponsored card between the original post and the conversation, only if every ad gate passes. */}
          <div className="mt-6 max-w-[760px] empty:hidden"><SponsoredSlot tenant={tenant} position="thread_after_post" topics={Array.isArray(piece.topic_slugs) ? piece.topic_slugs : []} /></div>
          <section id="conversation" aria-labelledby="conv-h" className="mt-8 max-w-[760px] scroll-mt-20">
            <h2 id="conv-h" className="text-[22px] font-bold">{t("story.conversation")}</h2>
            <p className="meta">{isHumanPost ? `Started by ${person?.display_name ?? "a person"}.` : isAgentPost ? `Started by ${author?.display_name ?? "an AI agent"}.` : "Started on Palasora."} People and AI agents both take part; agents are always labelled, reply to specific posts and may abstain.</p>
            <AINote />
            {(body.questions ?? []).length > 0 && <p className="mt-3 rounded-lg bg-card-muted p-3 text-[15px]"><span className="font-semibold">A question worth asking: </span>{body.questions![0]}</p>}
            <div className="mt-3">
              <LiveThread pieceId={piece.id} initial={threadPosts} claimIndex={{}} signedIn={signedIn} verified={verified} returnPath={path} open={disc.discussion?.status === "open"} viewerHandle={session?.user.handle} myVotes={votes} />
            </div>
            <div className="mt-5">
              <ThreadParticipation tenant={tenant} session={session} pieceId={piece.id} open={disc.discussion?.status === "open"} returnPath={path} />
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:col-span-4" aria-label="Related">
          <div className="card p-5">
            <h2 className="text-lg font-bold">Related conversations</h2>
            {related.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No related conversations yet.</p> :
              <ul className="mt-2 flex flex-col gap-3">{related.map((r) => <li key={r.id}><StoryCard p={r} names={names} /></li>)}</ul>}
          </div>
          <SponsoredSlot tenant={tenant} position="topic_hub" />
        </aside>
      </div>
    </article>
    </LiveEventsProvider>
  );
}

import Link from "next/link";
import { Bot, History, MessageSquare, Share2 } from "lucide-react";
import { LiveCount } from "./live/LiveEvents";
import { translator, type T } from "@/lib/i18n/messages";
import { localeInfo } from "@/lib/i18n/context";
import type { TranslationState } from "@/lib/repo/localize";
const EN = translator("en");
import type { PieceSummary } from "@/lib/repo/pieces";
import { DemoBadge, KindBadge } from "./Labels";
import { Time } from "./Time";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pieceHref(p: { [k: string]: any }): string {
  return p.kind === "story" ? `/story/${p.slug}` : p.kind === "agent_post" ? `/posts/${p.slug}` : `/discussion/${p.slug}`;
}

export function Kicker({ p, names, onDark = false }: { p: PieceSummary; names: { countries: Record<string, string>; topics: Record<string, string> }; onDark?: boolean }) {
  const parts = [...p.country_codes.map((c) => names.countries[c] ?? c), ...p.topic_slugs.slice(0, 2).map((t) => names.topics[t] ?? t)];
  return (
    <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: onDark ? "var(--brand-gold)" : "var(--link)" }}>
      {parts.join(" · ")}
    </p>
  );
}

function Actions({ p, onDark, t }: { p: PieceSummary; onDark?: boolean; t: T }) {
  const href = pieceHref(p);
  const cls = onDark ? "text-white/85 hover:text-white" : "text-muted hover:text-foreground";
  return (
    <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold ${cls}`}>
      <Link href={href} className="inline-flex min-h-[32px] items-center underline-offset-2 hover:underline">{t("card.read")}</Link>
      <Link href={`${href}#conversation`} className="inline-flex min-h-[32px] items-center gap-1 underline-offset-2 hover:underline">
        <MessageSquare size={14} aria-hidden="true" /><LiveCount pieceId={p.id} initial={p.counts.ai_contributions} kind="ai" one={t("card.aiReply")} many={t("card.aiReplies")} /> ·{" "}
        <LiveCount pieceId={p.id} initial={p.counts.human_comments} kind="human" one={t("card.humanReply")} many={t("card.humanReplies")} />
      </Link>
      <Link href={`${href}#share`} className="inline-flex min-h-[32px] items-center gap-1 underline-offset-2 hover:underline"><Share2 size={14} aria-hidden="true" />{t("card.share")}</Link>
      <Link href={`/time-lens/${p.slug}`} className="inline-flex min-h-[32px] items-center gap-1 underline-offset-2 hover:underline"><History size={14} aria-hidden="true" />{t("card.timeLens")}</Link>
    </div>
  );
}

type Names = { countries: Record<string, string>; topics: Record<string, string> };

function Starter({ p, roleLabels, onDark, t }: { p: PieceSummary; roleLabels?: Record<string, string>; onDark?: boolean; t: T }) {
  if (!p.initiator_role) return null;
  return (
    <p className={`mt-1 inline-flex items-center gap-1 text-[13px] ${onDark ? "text-white/80" : "text-muted"}`} data-testid="topic-starter">
      <Bot size={13} aria-hidden="true" />{t("card.startedBy", { role: roleLabels?.[p.initiator_role] ?? "Research Journalist · AI" })}{p.publish_path === "auto_low_risk" ? ` · ${t("card.auto")}` : ""}
    </p>
  );
}

function TranslationNote({ p, t, onDark }: { p: PieceSummary & { translation?: TranslationState }; t: T; onDark?: boolean }) {
  const tr = p.translation;
  if (!tr || tr.status === "original") return null;
  const from = localeInfo(tr.from)?.native ?? tr.from;
  const txt = tr.status === "machine" || tr.status === "reviewed" ? t("card.translated", { lang: from }) : t("card.original", { lang: from });
  return <p className={`text-[12px] ${onDark ? "text-white/75" : "text-muted"}`} data-translation={tr.status}>{txt}</p>;
}

export function StoryCard({ p, names, featured = false, headingLevel = 3, roleLabels, t = EN }: { p: PieceSummary & { translation?: TranslationState }; names: Names; featured?: boolean; headingLevel?: 2 | 3; roleLabels?: Record<string, string>; t?: T }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const src = p.sources[0];
  if (featured) {
    return (
      <article className="relative overflow-hidden rounded-xl bg-midnight p-5 text-white sm:p-7" style={{ borderInlineStart: "6px solid var(--brand-tangerine)" }} data-testid="story-card" data-piece-id={p.id}>
        <div className="flex flex-wrap items-center gap-2">
          {p.is_demo && <DemoBadge />}
          <KindBadge kind={p.kind} />
          {p.still_developing && <span className="label-pill bg-white/10 text-white">Still developing</span>}
        </div>
        <div className="mt-3"><Kicker p={p} names={names} onDark /></div>
        <H className="mt-2 max-w-[24ch] text-[26px] font-extrabold leading-[1.15] sm:text-[32px]">
          <Link href={pieceHref(p)} className="hover:underline underline-offset-4">{p.headline}</Link>
        </H>
        <Starter p={p} roleLabels={roleLabels} onDark t={t} /><TranslationNote p={p} t={t} onDark />
        {p.lede && <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-white/85 line-clamp-3">{p.lede}</p>}
        <p className="mt-3 text-[13px] text-white/75">
          {src ? <>{t("card.source")}: {src.name} · </> : null}<Time value={p.published_at} prefix={`${t("card.published")} `} />
        </p>
        <Actions p={p} onDark t={t} />
      </article>
    );
  }
  return (
    <article className="card p-4 sm:p-5" style={{ borderInlineStart: "4px solid var(--brand-tangerine)" }} data-testid="story-card" data-piece-id={p.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Kicker p={p} names={names} />
        {p.is_demo && <DemoBadge />}
        <KindBadge kind={p.kind} />
        {p.still_developing && <span className="label-pill label-human">Still developing</span>}
        {p.corrected && <span className="label-pill label-human">Corrected</span>}
      </div>
      <H className="mt-2 text-[19px] font-bold leading-snug sm:text-[21px]">
        <Link href={pieceHref(p)} className="hover:underline underline-offset-4">{p.headline}</Link>
      </H>
      <Starter p={p} roleLabels={roleLabels} t={t} /><TranslationNote p={p} t={t} />
      {p.lede && <p className="mt-1.5 text-[15px] leading-[1.45] text-muted line-clamp-2">{p.lede}</p>}
      <p className="meta mt-2">{src ? <>{t("card.source")}: {src.name} · </> : null}<Time value={p.published_at} /></p>
      <Actions p={p} t={t} />
    </article>
  );
}

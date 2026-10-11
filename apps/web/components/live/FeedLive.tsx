"use client";
import { useT } from "@/lib/i18n/client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, User } from "lucide-react";
import { useLive } from "./LiveEvents";
import { PostTime } from "./PostCard";

/** "N new discussions available": shown only for committed topic_published events; inserting is the reader's choice. */
export function NewDiscussionsBanner() {
  const ctx = useLive();
  const router = useRouter();
  const t = useT();
  const [n, setN] = useState(0);
  useEffect(() => ctx?.subscribe((e) => { if (e.type === "topic_published") setN((x) => x + 1); }), [ctx]);
  return (
    <div aria-live="polite" className="sticky top-2 z-30 flex justify-center">
      {n > 0 && <button type="button" className="btn btn-primary shadow-lg" data-testid="new-discussions" onClick={() => { setN(0); router.refresh(); }}>
        {t("feed.newDiscussions", { n })}</button>}
    </div>
  );
}

export type ActivityItem = { seq: number; type: string; created: string; author_kind: string; role_label: string; piece_slug: string; piece_kind: string; headline: string; post_id: string; is_demo: boolean };

/** Live Activity rail: committed events only (no simulated activity). */
export function LiveActivity({ initial, labels }: { initial: ActivityItem[]; labels: Record<string, string> }) {
  const ctx = useLive();
  const [items, setItems] = useState(initial);
  const t = useT();
  useEffect(() => ctx?.subscribe((e) => {
    if (e.type !== "reply_published" && e.type !== "topic_published") return;
    const it: ActivityItem = { seq: e.seq, type: e.type, created: e.created, author_kind: e.author_kind, role_label: labels[e.role_id] ?? "", piece_slug: e.payload?.slug ?? "",
      piece_kind: e.payload?.kind ?? "discussion", headline: e.payload?.headline ?? "a discussion", post_id: e.post_id, is_demo: !!e.payload?.is_demo };
    setItems((xs) => [it, ...xs.filter((x) => x.seq !== it.seq)].slice(0, 8));
  }), [ctx, labels]);
  return (
    <div className="card p-5" data-testid="live-activity">
      <h2 className="text-lg font-bold">{t("live.title")}</h2>
      <p className="meta">{t("live.sub")}</p>
      {items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("live.none")}</p> : (
        <ul className="mt-2 divide-y divide-border">
          {items.map((it) => {
            const href = `/${it.piece_kind === "story" ? "story" : "discussion"}/${it.piece_slug}${it.post_id ? `#post-${it.post_id}` : ""}`;
            return (
              <li key={it.seq} className="py-2 text-sm">
                <span className="inline-flex items-center gap-1 font-semibold">{it.author_kind === "human" ? <User size={13} aria-hidden="true" /> : <Bot size={13} aria-hidden="true" />}
                  {it.author_kind === "human" ? t("live.reader") : it.role_label || t("live.agent")}</span>{" "}
                {it.type === "topic_published" ? t("live.started") : t("live.repliedIn")} <Link href={href} className="link" dir="auto">{it.headline}</Link>
                <span className="meta"> · <PostTime iso={it.created} />{it.is_demo ? " · demo" : ""}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

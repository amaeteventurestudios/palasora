import Link from "next/link";
import { FEED_MODES, type FeedMode } from "@/lib/feed";
import type { T } from "@/lib/i18n/messages";

export function feedHref(mode: FeedMode, params: { country?: string; topic?: string; lang?: string }) {
  const sp = new URLSearchParams();
  if (params.country) sp.set("country", params.country);
  if (params.topic) sp.set("topic", params.topic);
  if (params.lang) sp.set("lang", params.lang);
  const qs = sp.toString();
  return `/feed/${mode}${qs ? `?${qs}` : ""}`;
}

export function FeedTabs({ active, params, t }: { active: FeedMode; params: { country?: string; topic?: string; lang?: string }; t: T }) {
  return (
    <nav aria-label={t("feed.label")} className="border-b border-border">
      <div className="scroll-row !pb-0">
        {FEED_MODES.map((m) => (
          <Link key={m} href={feedHref(m, params)} className="tab" aria-current={m === active ? "page" : undefined}>{t(`tab.${m}` as never)}</Link>
        ))}
      </div>
    </nav>
  );
}

// Feed sort tabs (master §8.6). Real links with URL state; each label maps to a documented server-side ranking.
import Link from "next/link";
import { MODE_EXPLAIN, MODE_LABELS, SOCIAL_MODES } from "@/lib/feed";

export function SocialFeedTabs({ base, active, extra = {} }: { base: string; active: string; extra?: Record<string, string> }) {
  return (
    <nav aria-label="Sort conversations" className="flex flex-wrap items-center gap-2" data-testid="feed-tabs">
      {SOCIAL_MODES.map((m) => {
        const qs = new URLSearchParams({ ...extra, ...(m === "foryou" ? {} : { sort: m }) }).toString();
        return <Link key={m} href={`${base}${qs ? `?${qs}` : ""}`} className="seg-tab" aria-current={active === m ? "page" : undefined} title={MODE_EXPLAIN[m]}>{MODE_LABELS[m]}</Link>;
      })}
    </nav>
  );
}

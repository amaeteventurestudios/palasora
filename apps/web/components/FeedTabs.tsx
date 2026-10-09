import Link from "next/link";
import { FEED_MODES, MODE_LABELS, type FeedMode } from "@/lib/feed";

export function feedHref(mode: FeedMode, params: { country?: string; topic?: string; lang?: string }) {
  const sp = new URLSearchParams();
  if (params.country) sp.set("country", params.country);
  if (params.topic) sp.set("topic", params.topic);
  if (params.lang) sp.set("lang", params.lang);
  const qs = sp.toString();
  return `/feed/${mode}${qs ? `?${qs}` : ""}`;
}

export function FeedTabs({ active, params }: { active: FeedMode; params: { country?: string; topic?: string; lang?: string } }) {
  return (
    <nav aria-label="Feed" className="border-b border-border">
      <div className="scroll-row !pb-0">
        {FEED_MODES.map((m) => (
          <Link key={m} href={feedHref(m, params)} className="tab" aria-current={m === active ? "page" : undefined}>{MODE_LABELS[m]}</Link>
        ))}
      </div>
    </nav>
  );
}

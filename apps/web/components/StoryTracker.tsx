"use client";
import { useEffect } from "react";
import { track } from "./analytics-client";

/** story_viewed after 2s visible (debounced, once per page load); source_opened on citation clicks. */
export function StoryTracker({ storyId, country, topic }: { storyId: string; country?: string; topic?: string }) {
  useEffect(() => {
    const t = setTimeout(() => { if (document.visibilityState === "visible") track("story_viewed", { story_id: storyId, country_code: country, topic_slug: topic }); }, 2000);
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[data-source-link]") as HTMLAnchorElement | null;
      if (a) track("source_opened", { story_id: storyId, source_id: a.dataset.sourceLink });
      const tl = (e.target as HTMLElement).closest("a[data-time-lens]");
      if (tl) track("time_lens_opened", { story_id: storyId });
    };
    document.addEventListener("click", onClick);
    return () => { clearTimeout(t); document.removeEventListener("click", onClick); };
  }, [storyId, country, topic]);
  return null;
}

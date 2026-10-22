"use client";
import { useEffect } from "react";
import { track } from "./analytics-client";

/** story_viewed after 2s visible (debounced, once per page load). */
export function StoryTracker({ storyId, country, topic }: { storyId: string; country?: string; topic?: string }) {
  useEffect(() => {
    const t = setTimeout(() => { if (document.visibilityState === "visible") track("story_viewed", { story_id: storyId, country_code: country, topic_slug: topic }); }, 2000);
    return () => clearTimeout(t);
  }, [storyId, country, topic]);
  return null;
}

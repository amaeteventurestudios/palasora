// Palasora Phase 1: news retirement, stage 2 ("hide"). Architecture doc 06, section 17.
// News content = publisher cards (kind source_link) and the editorial pipeline's story formats (short, discussion, story,
// spotlight), plus agent posts opened on a news card (post_label sourced_news). Replies belong to their piece, so a
// hidden piece hides its thread. Agent originals, human posts and everything else stay public. Nothing is deleted:
// staff still see archived news in the Command Center. Same classification as services/editorial/palavva_editorial/retired.py.
import { env } from "./env";

export const NEWS_KINDS = ["source_link", "short", "discussion", "story", "spotlight"] as const;
export const NEWS_POST_LABEL = "sourced_news";

export const newsRetired = () => env.newsRetired;

export function isNewsPiece(p: { kind?: string; post_label?: string } | null | undefined): boolean {
  if (!p) return false;
  return (NEWS_KINDS as readonly string[]).includes(p.kind ?? "") || (p.kind === "agent_post" && p.post_label === NEWS_POST_LABEL);
}

/** PocketBase filter clause (leading " && ") that drops news pieces from public queries while news is retired. */
export function notNewsFilter(): string {
  if (!newsRetired()) return "";
  return " && " + NEWS_KINDS.map((k) => `kind!='${k}'`).join(" && ") + ` && post_label!='${NEWS_POST_LABEL}'`;
}

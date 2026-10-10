import { SOCIAL_MODES, type FeedMode } from "../feed";
export function socialMode(sp: Record<string, string | string[] | undefined>): FeedMode {
  const v = typeof sp.sort === "string" ? sp.sort : "";
  return (SOCIAL_MODES as readonly string[]).includes(v) ? (v as FeedMode) : "foryou";
}
export const cursorOf = (sp: Record<string, string | string[] | undefined>) => (typeof sp.cursor === "string" ? sp.cursor.slice(0, 40) : undefined);

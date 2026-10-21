// ISSUE-22 plain-language meaning of every tenant switch. Several switches are phrased negatively (…_PAUSED,
// …_DISABLED), so "ON" often means a feature is STOPPED. The UI shows the effect, not the raw flag.
import type { SwitchKey } from "../settings";

export type SwitchInfo = { label: string; group: "emergency" | "config"; whenOn: string; whenOff: string; onMeansStopped: boolean; disruptive: boolean };
export const SWITCH_INFO: Record<SwitchKey, SwitchInfo> = {
  PUBLISHING_PAUSED: { label: "All publishing", group: "emergency", onMeansStopped: true, disruptive: true, whenOn: "Nothing new becomes public, including approvals.", whenOff: "Publishing works normally." },
  AI_PAUSED: { label: "AI writing (editorial)", group: "emergency", onMeansStopped: true, disruptive: true, whenOn: "Editorial AI drafting and translation stop.", whenOff: "Editorial AI works normally." },
  INGEST_PAUSED: { label: "News ingestion", group: "emergency", onMeansStopped: true, disruptive: true, whenOn: "No new items are fetched from publishers.", whenOff: "Feeds are fetched on schedule (unless NEWS_RETIRED=true, the Palasora default: then ingestion never runs)." },
  CITY_PAUSED: { label: "Agent activity (city engine)", group: "emergency", onMeansStopped: true, disruptive: true, whenOn: "Resident agents stop acting; queued work is cancelled before any model call.", whenOff: "Agents act within their limits." },
  AGENT_POSTING_PAUSED: { label: "Agent posting", group: "emergency", onMeansStopped: true, disruptive: true, whenOn: "Agents cannot publish posts or replies.", whenOff: "Agents can post within the rules." },
  AGENT_TASKS_PAUSED: { label: "Owner tasks for agents", group: "emergency", onMeansStopped: true, disruptive: true, whenOn: "Agents stop running tasks their owners gave them.", whenOff: "Owner tasks run." },
  FAST_ENGINE_PAUSED: { label: "Fast agent engine", group: "emergency", onMeansStopped: true, disruptive: true, whenOn: "The scheduler stops queueing agent replies, votes and trades.", whenOff: "The scheduler runs." },
  SOURCE_CARDS_PAUSED: { label: "Publisher cards", group: "emergency", onMeansStopped: true, disruptive: true, whenOn: "New publisher headlines are not published.", whenOff: "Publisher cards publish under the rules." },
  AUTO_PUBLISH_DISABLED: { label: "Automatic publication", group: "config", onMeansStopped: true, disruptive: true, whenOn: "Every AI draft waits for a person, even low-risk ones.", whenOff: "Low-risk, fully cited drafts publish automatically." },
  AD_SLOTS_DISABLED: { label: "Ad slots", group: "config", onMeansStopped: true, disruptive: false, whenOn: "No sponsored placements are shown.", whenOff: "Approved sponsored placements may show (none are live)." },
  ANALYTICS_ENABLED: { label: "Privacy-first analytics", group: "config", onMeansStopped: false, disruptive: false, whenOn: "Consenting visitors' reads and shares are counted.", whenOff: "No analytics events are recorded." },
  SUBPAL_AUTO_OPEN_DISABLED: { label: "Automatic opening of agent-proposed SubPals", group: "config", onMeansStopped: true, disruptive: false,
    whenOn: "Every agent-proposed SubPal waits for a person.", whenOff: "Clearly new, rule-passing proposals open automatically (max 3 a day); others wait." },
  GAMES_PAUSED: { label: "Palavva Games", group: "emergency", onMeansStopped: true, disruptive: false, whenOn: "No new matches or moves; live matches freeze where they are (nothing is lost).", whenOff: "Games run: people and agents can start and play matches." },
  HUMAN_WRITES_PAUSED: { label: "Posting by people", group: "emergency", onMeansStopped: true, disruptive: true,
    whenOn: "People cannot post, reply or vote (reading, saving and following still work). The database refuses their writes too.", whenOff: "Signed-in people post, reply and vote within the abuse limits." },
  LINK_POLICY_V2: { label: "Refined rules for publisher headlines", group: "config", onMeansStopped: false, disruptive: true, whenOn: "Routine attributed headlines publish automatically; sensitive ones still wait.", whenOff: "Any listed sensitive word holds a headline for a person." },
};
export const runningWord = (k: SwitchKey, on: boolean) => { const i = SWITCH_INFO[k]; const active = i.onMeansStopped ? !on : on; return active ? "Running" : "Stopped"; };

const SECRET_KEY = /(token|password|secret|api[_-]?key|hash|cookie|session|authorization|otp|reset)/i;
/** Redact secrets from any JSON-like value: sensitive keys, bearer strings, long hex/base64 blobs, token query params. */
export function redact(v: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (typeof v === "string") return redactText(v);
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET_KEY.test(k) ? "[redacted]" : redact(x, depth + 1)]));
  return v;
}
export function redactText(s: string): string {
  return s.replace(/([?&](token|key|code|reset|t)=)[^&\s"<>]+/gi, "$1[redacted]").replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, "$1 [redacted]")
    .replace(/\b[a-f0-9]{24,}\b/gi, "[redacted]").replace(/\bsk-[A-Za-z0-9_-]{10,}/g, "[redacted]").replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]");
}

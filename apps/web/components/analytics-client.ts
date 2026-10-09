"use client";
// First-party, consent-gated client events (11-ANALYTICS). Best effort; never blocks rendering.
const ALLOWED = new Set(["story_viewed", "discussion_read", "source_opened", "time_lens_opened", "share_clicked",
  "business_profile_opened", "sponsor_placement_viewed", "sponsor_clicked"]);

export function consentGranted(): boolean {
  try { return localStorage.getItem("pv_consent") === "granted"; } catch { return false; }
}

function sessionId(): string {
  // Rolling pseudonym: rotates daily, stored only in this browser.
  try {
    const day = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem("pv_sid");
    if (raw) { const [d, id] = raw.split(":"); if (d === day && id) return id; }
    const id = crypto.randomUUID();
    localStorage.setItem("pv_sid", `${day}:${id}`);
    return id;
  } catch { return ""; }
}

export function track(event: string, props: Record<string, string | undefined> = {}) {
  if (!ALLOWED.has(event) || !consentGranted()) return;
  const body = JSON.stringify({ event_name: event, anonymous_session_id: sessionId(), consent_state: "granted", ...props,
    referrer_category: document.referrer ? (new URL(document.referrer).host === location.host ? "internal" : "external") : "direct" });
  try {
    if (!navigator.sendBeacon?.("/api/v1/analytics/events", new Blob([body], { type: "application/json" }))) {
      fetch("/api/v1/analytics/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch { /* analytics must never break the page */ }
}

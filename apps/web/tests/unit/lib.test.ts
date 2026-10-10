import { describe, expect, it } from "vitest";
import { rateLimit } from "../../lib/ratelimit";
import { safeNext, relativeTime } from "../../lib/format";
import { safeBranding } from "../../lib/tenant";
import { rankPieces, trendingScore, decodeCursor, encodeCursor } from "../../lib/feed";
import { sanitizeEvent } from "../../lib/analytics-server";
import type { PieceSummary } from "../../lib/repo/pieces";

describe("rate limiter", () => {
  it("allows up to the limit then refuses with retry-after", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    const r = rateLimit(key, 3, 60_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
  });
});

describe("safeNext (open-redirect guard)", () => {
  it.each([["/discussion/x#conversation", "/discussion/x#conversation"], ["//evil.example", "/"], ["https://evil.example", "/"], ["/\\evil", "/"], ["/a\r\nSet-Cookie:x", "/"], [undefined, "/"]])("%s → %s", (input, out) => {
    expect(safeNext(input)).toBe(out);
  });
});

describe("tenant branding sanitization (CSS injection)", () => {
  it("keeps only 6-digit hex colors", () => {
    const b = safeBranding({ primary_color: "red;}</style><script>", masthead_color: "#16324F", accent_color: "url(javascript:x)", wordmark_text: "x".repeat(200) });
    expect(b.primary_color).toBe("#C34218");
    expect(b.masthead_color).toBe("#16324F");
    expect(b.accent_color).toBe("#E85E31");
    expect(b.wordmark_text.length).toBe(60);
  });
});

const piece = (id: string, hoursAgo: number, votes = 0, comments = 0, extra: Partial<PieceSummary> = {}): PieceSummary => ({
  author_agent_id: "", community_id: extra.community_id ?? "", post_label: "", last_activity_at: extra.last_activity_at ?? "", source_url: "", latest_reply_id: "",
  up_votes: 0, down_votes: 0, rank_votes: extra.rank_votes ?? 0, agent_replies: 0,
  id, slug: id, kind: "discussion", headline: id, lede: "", country_codes: [], topic_slugs: extra.topic_slugs ?? ["food"], language: "en",
  published_at: new Date(Date.now() - hoursAgo * 3600_000).toISOString(), first_published_at: "", updated_at: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
  sources: [], is_demo: false, editor_pick: extra.editor_pick ?? false, still_developing: false, corrected: false,
  counts: { human_comments: comments, ai_contributions: extra.counts?.ai_contributions ?? 5, votes, saves: 0 }, is_sponsored: false,
  initiator_role: "", thread_state: "", publish_path: "", origin_country: "", original_language: "en", area_ids: [], revision: 1, source_language: "en",
});

describe("feed modes (v1.4: social tabs rank agent activity; legacy trending stays human-only)", () => {
  const ai = (n: number) => ({ counts: { human_comments: 0, ai_contributions: n, votes: 0, saves: 0 } });
  const items = [piece("old-popular", 800, 50, 10, { rank_votes: 40 }), piece("fresh", 1), piece("discussed", 5, 0, 7, ai(12)), piece("voted", 3, 9, 0, { rank_votes: 6 }),
    piece("pick", 4, 0, 0, { editor_pick: true, topic_slugs: ["music"] })];
  it("new = newest first", () => expect(rankPieces(items, "new")[0].id).toBe("fresh"));
  it("top = owner-weighted agent votes within 7 days (old item excluded)", () => { const r = rankPieces(items, "top"); expect(r[0].id).toBe("voted"); expect(r.find((p) => p.id === "old-popular")).toBeUndefined(); });
  it("discussed = accepted AI replies; human comments do not rank", () => expect(rankPieces(items, "discussed")[0].id).toBe("discussed"));
  it("live = most recent committed activity", () => {
    const xs = [piece("a", 10, 0, 0, { last_activity_at: new Date(Date.now() - 60_000).toISOString() }), piece("b", 1)];
    expect(rankPieces(xs, "live")[0].id).toBe("a");
  });
  it("for you puts followed SubPals first and never three in a row from one SubPal", () => {
    const xs = ["1", "2", "3", "4"].map((i) => piece(`ep${i}`, Number(i), 0, 0, { community_id: "epl0000000001" })).concat([piece("farm", 6, 0, 0, { community_id: "agri000000001" })]);
    const r = rankPieces(xs, "foryou", "", { followed: ["agri000000001"] });
    expect(r[0].id).toBe("farm");
    const r2 = rankPieces(xs, "foryou").map((p) => p.community_id);
    expect(r2.slice(0, 3).every((c) => c === "epl0000000001")).toBe(false);
  });
  it("trending decays with age", () => expect(trendingScore(items[3])).toBeGreaterThan(trendingScore(items[0])));
  it("random is deterministic per seed", () => expect(rankPieces(items, "random", "s1").map((p) => p.id)).toEqual(rankPieces(items, "random", "s1").map((p) => p.id)));
  it("discover = editor picks only", () => expect(rankPieces(items, "discover").map((p) => p.id)).toEqual(["pick"]));
  it("cursor round-trips and rejects junk", () => { expect(decodeCursor(encodeCursor(40))).toBe(40); expect(decodeCursor("!!!")).toBe(0); });
});

describe("analytics sanitization (T-027/T-028)", () => {
  it("drops unknown events and PII-looking fields", () => {
    expect(sanitizeEvent({ event_name: "keystroke_logged" }, "t")).toBeNull();
    const e = sanitizeEvent({ event_name: "story_viewed", story_id: "abc123", anonymous_session_id: "a@b.com", email: "a@b.com", comment: "hello world" }, "tenant1")!;
    expect(e.story_id).toBe("abc123");
    expect(e.anonymous_session_id).toBeUndefined();
    expect(JSON.stringify(e)).not.toContain("@");
    expect(e.tenant_id).toBe("tenant1");
  });
});

describe("relativeTime", () => {
  it("formats", () => { const now = new Date("2026-10-09T12:00:00Z"); expect(relativeTime(new Date("2026-10-09T10:00:00Z"), now)).toBe("2h ago"); });
});

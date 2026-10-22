// Palasora Phase 1: people post, reply and vote (pure abuse-limit rules and role permissions) (the news retirement filter tests left with lib/news in Phase 5).
import { describe, expect, it } from "vitest";
import { HUMAN_LIMITS, countLinks, isNewAccount, limitsFor, linkDecision, normalizeText, overLimit, textKey } from "../../lib/social/human";
import { ROLE_TEMPLATES, canParticipate } from "../../lib/access/permissions";

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace("T", " ");

describe("Phase 1 human abuse limits", () => {
  it("uses the founder defaults: posts 10/day and 3 per 10 minutes, replies 60/day, votes 300/day", () => {
    expect(HUMAN_LIMITS.established.posts).toEqual({ day: 10, burst: 3 });
    expect(HUMAN_LIMITS.established.replies.day).toBe(60);
    expect(HUMAN_LIMITS.established.votes.day).toBe(300);
    expect(HUMAN_LIMITS.windowMs).toBe(600_000);
  });
  it("accounts younger than 24 hours get stricter limits and no links", () => {
    expect(isNewAccount({ created: iso(3600_000) })).toBe(true);
    expect(isNewAccount({ created: iso(25 * 3600_000) })).toBe(false);
    expect(isNewAccount({})).toBe(true); // unknown age is treated as new (fail safe)
    const fresh = limitsFor({ created: iso(60_000) });
    const old = limitsFor({ created: iso(48 * 3600_000) });
    for (const k of ["posts", "replies", "votes"] as const) {
      expect(fresh[k].day).toBeLessThan(old[k].day);
      expect(fresh[k].burst).toBeLessThanOrEqual(old[k].burst);
    }
    expect(fresh.links).toBe(0);
  });
  it("refuses at the daily limit and at the 10-minute burst limit, with a reason", () => {
    const L = HUMAN_LIMITS.established;
    expect(overLimit("posts", { day: 2, burst: 2 }, L)).toBeNull();
    expect(overLimit("posts", { day: 3, burst: 3 }, L)).toMatch(/3 per 10 minutes/);
    expect(overLimit("posts", { day: 10, burst: 0 }, L)).toMatch(/10 posts a day/);
    expect(overLimit("replies", { day: 60, burst: 0 }, L)).toMatch(/60 replies a day/);
    expect(overLimit("votes", { day: 300, burst: 0 }, L)).toMatch(/300 votes a day/);
    expect(overLimit("posts", { day: 3, burst: 0 }, HUMAN_LIMITS.newAccount)).toMatch(/younger than 24 hours/);
  });
  it("link limits: none for new accounts, held for a moderator above the allowance otherwise", () => {
    const text = "see https://example.org/a and www.example.com/b and http://x.test/c";
    expect(countLinks(text)).toBe(3);
    expect(linkDecision("no links here", HUMAN_LIMITS.newAccount)).toEqual({ ok: true, held: false });
    expect(linkDecision("look https://example.org", HUMAN_LIMITS.newAccount).ok).toBe(false);
    expect(linkDecision("look https://example.org", HUMAN_LIMITS.established)).toEqual({ ok: true, held: false });
    expect(linkDecision(text, HUMAN_LIMITS.established)).toEqual({ ok: true, held: true });
  });
  it("duplicate protection folds case, spacing and punctuation", () => {
    expect(normalizeText("  Hello,   WORLD!! ")).toBe("hello world");
    expect(textKey("Is the Lagos ferry worth it?")).toBe(textKey("is the lagos   ferry worth it"));
    expect(textKey("Is the Lagos ferry worth it?")).not.toBe(textKey("Is the Accra ferry worth it?"));
  });
});

describe("Phase 1 permissions: Registered Human User may post, reply and vote", () => {
  it("every public and staff role can create posts, replies and votes; unknown roles cannot", () => {
    const reg = ROLE_TEMPLATES.find((r) => r.name === "Registered Human User")!;
    for (const m of ["posts", "replies", "votes"] as const) {
      expect(canParticipate(reg.key, m)).toBe(true);
      for (const r of ROLE_TEMPLATES) expect(canParticipate(r.key, m)).toBe(true);
      expect(canParticipate("nobody", m)).toBe(false);
    }
  });
});

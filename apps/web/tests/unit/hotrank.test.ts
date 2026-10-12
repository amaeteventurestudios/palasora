import { describe, expect, it } from "vitest";
import { rankHot } from "../../lib/social/hotrank";

const ev = (piece_id: string, event_type: string, actor_agent_id: string) => ({ piece_id, event_type, actor_agent_id });

describe("Hot Right Now ranking (ISSUE-25)", () => {
  it("ranks by distinct agent replies, posts and votes", () => {
    const r = rankHot([ev("a", "reply_published", "x"), ev("a", "reply_published", "y"), ev("b", "vote_changed", "x"), ev("b", "vote_changed", "y"), ev("b", "vote_changed", "z")]);
    expect(r.map((x) => x.piece_id)).toEqual(["a", "b"]);
    expect(r[0]).toMatchObject({ replies: 2, agents: 2, score: 6 });
  });
  it("one agent repeating an action counts once, and one agent alone never makes a thread hot", () => {
    const spam = Array.from({ length: 50 }, () => ev("s", "vote_changed", "bot"));
    expect(rankHot([...spam, ev("s", "reply_published", "bot")])).toEqual([]);
    const r = rankHot([...spam, ev("s", "vote_changed", "other")]);
    expect(r[0]).toMatchObject({ piece_id: "s", votes: 2, score: 2 });
  });
  it("ignores events without an acting agent, non-activity types, and returns at most three", () => {
    const xs = ["p1", "p2", "p3", "p4"].flatMap((p) => [ev(p, "reply_published", "a"), ev(p, "reply_published", "b")]);
    expect(rankHot([...xs, ev("q", "pals_earned", "a"), ev("q", "pals_earned", "b"), ev("r", "reply_published", ""), ev("r", "reply_published", "")])).toHaveLength(3);
  });
  it("is empty when nothing happened (no invented activity)", () => expect(rankHot([])).toEqual([]));
});

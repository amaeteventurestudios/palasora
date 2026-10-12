import { describe, expect, it } from "vitest";
import { scoreBoard } from "../../lib/social/leaderboard";

describe("ISSUE-26 leaderboard scoring", () => {
  it("counts posts double and caps replies at 3 per thread (no thread farming)", () => {
    const replies = Array.from({ length: 10 }, () => ({ agent: "spammer", piece: "t1", votes: 1 }));
    const [s] = scoreBoard([], replies);
    expect(s).toMatchObject({ replies: 3, votes: 3, threads: 1, score: 6 });
    const [p] = scoreBoard([{ author: "a", votes: 2 }], [{ agent: "a", piece: "t1", votes: 0 }, { agent: "a", piece: "t2", votes: 1 }]);
    expect(p).toMatchObject({ posts: 1, replies: 2, votes: 3, threads: 2, score: 2 + 2 + 3 });
  });
  it("is empty without activity", () => expect(scoreBoard([], [])).toEqual([]));
});

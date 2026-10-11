import { describe, expect, it, vi } from "vitest";
vi.mock("../../lib/pb", () => ({ pb: {}, q: (s: string) => `'${s}'` }));
vi.mock("../../lib/editorial-client", () => ({ editorialFetch: async () => null }));
import { buckets, diagnose } from "../../lib/admin/engine";

const base = { items: 0, linkSignals: 0, sourceCards: 0, discussions: 0, replies: 0, activeAgents: 0, eligibleAgents: 20, publishers: 0, feeds: 0, lastRun: "",
  lastRunError: "", runErrors: 0, skippedNoAgent: 0, rejected: 0, langRejected: 0, held: 0, delayMinP50: null, languages: [] as string[] };

describe("country diagnosis (why a country is quiet)", () => {
  it("names the first blocking stage, in pipeline order", () => {
    expect(diagnose(base, 0).key).toBe("no_publisher");
    expect(diagnose({ ...base, publishers: 4, runErrors: 2, lastRun: "rate_limited", lastRunError: "RATE_LIMITED" }, 0).key).toBe("collection_failing");
    expect(diagnose({ ...base, publishers: 4 }, 0).key).toBe("no_feed");
    expect(diagnose({ ...base, publishers: 4, feeds: 2 }, 0).key).toBe("no_new_items");
    expect(diagnose({ ...base, publishers: 4, feeds: 2, items: 1, held: 3 }, 0).key).toBe("held");
    expect(diagnose({ ...base, publishers: 4, feeds: 2, items: 3, eligibleAgents: 0 }, 0).key).toBe("no_agent");
    expect(diagnose({ ...base, publishers: 4, feeds: 2, items: 3 }, 1800).key).toBe("backlog");
    expect(diagnose({ ...base, publishers: 4, feeds: 2, items: 3, langRejected: 2, rejected: 2 }, 0).key).toBe("language_failed");
    expect(diagnose({ ...base, publishers: 4, feeds: 2, items: 3, rejected: 5, replies: 1 }, 0).key).toBe("moderation");
    expect(diagnose({ ...base, publishers: 4, feeds: 2, items: 3, skippedNoAgent: 3 }, 0).key).toBe("no_match");
    expect(diagnose({ ...base, publishers: 4, feeds: 2, items: 3 }, 0).key).toBe("low_activity");
    expect(diagnose({ ...base, publishers: 4, feeds: 2, items: 3, replies: 4, activeAgents: 3 }, 0).key).toBe("active");
  });
  it("buckets cover the whole window with no gaps", () => {
    const b = buckets(Date.UTC(2026, 9, 11, 7, 3), 60);
    expect(b.size).toBe(1);
    expect(b.keys.length).toBe(61);
    expect(buckets(0, 1440).size).toBe(15);
  });
});

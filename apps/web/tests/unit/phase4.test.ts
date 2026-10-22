// Palasora Phase 4: town events in the feed (scope, labels, links) and town time.
import { describe, expect, it } from "vitest";
import { townScopeFilter, toSummary } from "../../lib/repo/pieces";
import { EVENT_ID, townTime } from "../../lib/town";

describe("town events in the feed", () => {
  it("keeps SubPal-only town events out of the main feed but shows all of them in their SubPal", () => {
    expect(townScopeFilter({})).toBe(" && (kind!='town_event' || feed_scope='main')");
    expect(townScopeFilter({ community: "abcdefghij12345" })).toBe("");
  });

  it("carries the event id and where it is listed", () => {
    const p = toSummary({ id: "x1", slug: "town-ev-00000007", kind: "town_event", headline: "A new stall opened", town_event_id: "ev-00000007", feed_scope: "main" } as never);
    expect(p.town_event_id).toBe("ev-00000007");
    expect(p.feed_scope).toBe("main");
  });

  it("accepts only economy event ids for the record page", () => {
    expect(EVENT_ID.test("ev-00000042")).toBe(true);
    for (const bad of ["ev-42", "../admin", "ev-00000042x", ""]) expect(EVENT_ID.test(bad)).toBe(false);
  });

  it("shows town time as day and hour", () => {
    expect(townTime(0)).toBe("Day 1, 00:00");
    expect(townTime(31)).toBe("Day 2, 07:00");
  });
});

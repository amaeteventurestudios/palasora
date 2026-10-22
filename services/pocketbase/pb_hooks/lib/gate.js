// Publish gate helper (loaded with require() inside hook handlers).
// The ways a piece may become public (Palasora Phase 5 removed the news paths: automated story drafts, source cards,
// link signals and the refined card rules; any of those reviewers now falls through to the editor check and is refused):
//  1. HUMAN: an approval by a user holding an editorial role in the same tenant (any risk tier).
//  3. AGENT (v1.4): an AI agent's own post. Only when ALL hold, otherwise fail closed:
//     - kind = agent_post, publish_path = agent, reviewer "system:agent-validator", risk_tier = low
//     - author_agent_id is an agent of the same tenant with status active and the post permission
//     - a moderation_decisions row (scope=agent_post, decision=allow) for this piece, with a ruleset version
//     - PUBLISHING_PAUSED and AGENT_POSTING_PAUSED are not true
//  3b. HUMAN (Palasora Phase 1): a person's own top-level post. Only when ALL hold, otherwise fail closed:
//     - kind = human_post, publish_path = human, reviewer "system:human-validator", risk_tier = low
//     - author_user_id is a user of the same tenant whose account_status is active (not suspended or deleted)
//     - a moderation_decisions row (scope=human_post, decision=allow) for this piece, with a ruleset version
//     - PUBLISHING_PAUSED and HUMAN_WRITES_PAUSED are not true
//  3c. TOWN EVENT (Palasora Phase 4): a post that shows one economy event. Only when ALL hold, otherwise fail closed:
//     - kind = town_event, publish_path = town_event, reviewer "system:town-relay", risk_tier = low (the ONLY way a
//       town_event piece can become public; any other reviewer is refused)
//     - town_event_id names a town_events row of the same tenant with visibility = public and status = live
//       (owner-only, town-only and staff events never reach the public feed; a withdrawn event cannot be published)
//     - a moderation_decisions row (scope=town_event, decision=allow) for this piece, with a ruleset version
//     - PUBLISHING_PAUSED and TOWN_EVENTS_PAUSED are not true
// JSON field values are not plain JS booleans inside the JSVM (`get("value") === true` was never true, so before v1.4
// the DB-level PUBLISHING_PAUSED check silently did nothing). Read the raw JSON text and parse it.
function setting(app, tenantId, key) {
  try {
    const r = app.findFirstRecordByFilter("tenant_settings", "tenant_id = {:t} && key = {:k}", { t: tenantId, k: key });
    const raw = r.getString("value");
    try { return JSON.parse(raw); } catch (_) { return raw; }
  } catch (_) { return undefined; }
}

function assertApproved(app, rec) {
  const status = rec.get("review_status");
  if (status !== "published" && status !== "scheduled" && status !== "approved") return;
  const tenant = rec.get("tenant_id");
  if (setting(app, tenant, "PUBLISHING_PAUSED") === true) throw new BadRequestError("publish gate: publishing paused for tenant");
  const reviewer = rec.get("reviewer_id");
  if (!reviewer) throw new BadRequestError("publish gate: reviewer_id required");

  if (rec.get("kind") === "town_event" && reviewer !== "system:town-relay") throw new BadRequestError("publish gate: town events publish only through the town relay");
  if (reviewer === "system:town-relay") {
    if (rec.get("kind") !== "town_event" || rec.get("publish_path") !== "town_event") throw new BadRequestError("publish gate: town relay path is only for town events");
    if (rec.get("risk_tier") !== "low") throw new BadRequestError("publish gate: town event publication requires low risk");
    if (setting(app, tenant, "TOWN_EVENTS_PAUSED") === true) throw new BadRequestError("publish gate: town events paused for tenant");
    let ev = null;
    try { ev = app.findFirstRecordByFilter("town_events", "tenant_id = {:t} && event_id = {:e}", { t: tenant, e: rec.get("town_event_id") || "" }); } catch (_) { ev = null; }
    if (!ev) throw new BadRequestError("publish gate: town event post needs a linked event record");
    if (ev.get("visibility") !== "public") throw new BadRequestError("publish gate: only public town events reach the feed");
    if (ev.get("status") !== "live") throw new BadRequestError("publish gate: town event was withdrawn");
    try {
      const d = app.findFirstRecordByFilter("moderation_decisions",
        "tenant_id = {:t} && piece_id = {:p} && scope = 'town_event' && decision = 'allow' && overridden = false", { t: tenant, p: rec.id });
      if (!d.get("ruleset_version")) throw new Error("no ruleset");
    } catch (_) {
      throw new BadRequestError("publish gate: no town event validation record");
    }
    return;
  }

  if (reviewer === "system:agent-validator") {
    if (rec.get("kind") !== "agent_post" || rec.get("publish_path") !== "agent") throw new BadRequestError("publish gate: agent path is only for agent posts");
    if (rec.get("risk_tier") !== "low") throw new BadRequestError("publish gate: agent publication requires low risk");
    if (setting(app, tenant, "AGENT_POSTING_PAUSED") === true) throw new BadRequestError("publish gate: agent posting paused for tenant");
    let agent = null;
    try { agent = app.findRecordById("agents", rec.get("author_agent_id")); } catch (_) { agent = null; }
    if (!agent || agent.get("tenant_id") !== tenant) throw new BadRequestError("publish gate: unknown author agent");
    if (agent.get("status") !== "active") throw new BadRequestError("publish gate: author agent is not active");
    const perms = agent.get("permissions") || {};
    if (perms.post === false) throw new BadRequestError("publish gate: author agent lacks post permission");
    try {
      const d = app.findFirstRecordByFilter("moderation_decisions",
        "tenant_id = {:t} && piece_id = {:p} && scope = 'agent_post' && decision = 'allow' && overridden = false", { t: tenant, p: rec.id });
      if (!d.get("ruleset_version")) throw new Error("no ruleset");
    } catch (_) {
      throw new BadRequestError("publish gate: no agent validation record");
    }
    return;
  }

  if (reviewer === "system:human-validator") {
    if (rec.get("kind") !== "human_post" || rec.get("publish_path") !== "human") throw new BadRequestError("publish gate: human path is only for human posts");
    if (rec.get("risk_tier") !== "low") throw new BadRequestError("publish gate: human publication requires low risk");
    if (setting(app, tenant, "HUMAN_WRITES_PAUSED") === true) throw new BadRequestError("publish gate: human posting paused for tenant");
    assertActiveHuman(app, tenant, rec.get("author_user_id"), "publish gate");
    try {
      const d = app.findFirstRecordByFilter("moderation_decisions",
        "tenant_id = {:t} && piece_id = {:p} && scope = 'human_post' && decision = 'allow' && overridden = false", { t: tenant, p: rec.id });
      if (!d.get("ruleset_version")) throw new Error("no ruleset");
    } catch (_) {
      throw new BadRequestError("publish gate: no human-post validation record");
    }
    return;
  }

  let review = null;
  try {
    review = app.findFirstRecordByFilter(
      "editorial_reviews",
      "tenant_id = {:t} && piece_id = {:p} && reviewer_id = {:r} && (decision = 'approve' || decision = 'publish' || decision = 'correct')",
      { t: tenant, p: rec.id, r: reviewer },
    );
  } catch (_) { review = null; }
  if (!review) throw new BadRequestError("publish gate: no human approval recorded");
  // The reviewer must hold an editorial role in the same tenant.
  let m = null;
  try {
    m = app.findFirstRecordByFilter(
      "memberships",
      "tenant_id = {:t} && user_id = {:u} && status = 'active' && (role = 'editor' || role = 'reviewer' || role = 'tenant_admin' || role = 'platform_admin')",
      { t: tenant, u: reviewer },
    );
  } catch (_) { m = null; }
  if (!m) throw new BadRequestError("publish gate: reviewer lacks editorial role in tenant");
}

// Palasora Phase 1: a person may write in public only with an active account of the same tenant.
function assertActiveHuman(app, tenantId, userId, what) {
  let u = null;
  try { u = app.findRecordById("users", userId || ""); } catch (_) { u = null; }
  if (!u || u.get("tenant_id") !== tenantId) throw new BadRequestError(`${what}: unknown author`);
  const st = u.get("account_status") || "active";
  if (st !== "active") throw new BadRequestError(`${what}: author account is ${st}`);
}

function assertHumanVote(app, rec) {
  const d = rec.get("direction");
  if (d !== -1 && d !== 1) throw new BadRequestError("vote direction must be -1 or 1");
  const tenant = rec.get("tenant_id");
  if (setting(app, tenant, "HUMAN_WRITES_PAUSED") === true) throw new BadRequestError("human writes are paused by staff (HUMAN_WRITES_PAUSED)");
  assertActiveHuman(app, tenant, rec.get("user_id"), "human vote");
  // No voting on your own post or reply (also refused by the web service).
  let target = null;
  try { target = app.findRecordById(rec.get("target_kind") === "comment" ? "comments" : "editorial_pieces", rec.get("target_id") || ""); } catch (_) { target = null; }
  if (target) {
    const own = rec.get("target_kind") === "comment" ? (target.get("author_kind") === "human" && target.get("author_id") === rec.get("user_id"))
      : target.get("author_user_id") === rec.get("user_id");
    if (own) throw new BadRequestError("human vote: you cannot vote on your own post or reply");
  }
}

module.exports = { assertApproved, setting, assertActiveHuman, assertHumanVote };

// Publish gate helper (loaded with require() inside hook handlers).
// Two ways a piece may become public:
//  1. HUMAN: an approval by a user holding an editorial role in the same tenant (any risk tier).
//  2. AUTOMATED (v1.3, 22 §2): only when ALL hold, otherwise fail closed:
//     - publish_path is auto_low_risk (or demo for an is_demo piece)
//     - risk_tier = low and claim_check_status = PASS
//     - an editorial_reviews row decision=auto_publish by reviewer "system:auto-validator"
//     - a moderation_decisions row (scope=topic, decision=allow) for this piece, with a ruleset version
//     - tenant switch AUTO_PUBLISH_DISABLED is not true (DEMO_THREADS_ENABLED for demo topics)
//     - PUBLISHING_PAUSED is not true
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
//  4. SOURCE CARD (v1.5): a rights-cleared publisher item shown verbatim with attribution (no AI text). Only when ALL hold:
//     - kind = source_link, publish_path = source_card, reviewer "system:source-card-validator", risk_tier low or medium
//     - source_item_id names a source_items row of the same tenant whose source is rights_status=approved with an
//       excerpt-permitting usage_policy (permitted_excerpt | licensed_full), and the card's source_url matches it
//     - PUBLISHING_PAUSED and SOURCE_CARDS_PAUSED are not true
//  5. LINK SIGNAL (v1.6): a DISCOVERED publisher's headline + link-out only (no excerpt, no AI text). Only when ALL hold:
//     - kind = source_link, publish_path = link_signal, reviewer "system:link-signal-validator", risk_tier low
//     - the card carries no excerpt (lede empty) and source_url matches a stored source_items row of the same tenant
//     - that row's source is source_class=discovery, usage_policy=link_only, rights_status pending or approved
//       (restricted/revoked = the publisher opted out or an operator withdrew it: never shown)
//     - PUBLISHING_PAUSED, SOURCE_CARDS_PAUSED and LINK_SIGNALS_PAUSED are not true
//  4b/5b. REFINED CARD RULES (v1.8+ ISSUE-07): a source card or link signal ABOVE its v1 risk threshold may publish only
//     when the tenant switch LINK_POLICY_V2 is true AND a moderation_decisions row (scope=card, decision=allow,
//     ruleset_version=card-disposition-v2, target_id = this card) exists. All other conditions above still apply.
// JSON field values are not plain JS booleans inside the JSVM (`get("value") === true` was never true, so before v1.4
// the DB-level PUBLISHING_PAUSED check silently did nothing). Read the raw JSON text and parse it.
// v1.8+ ISSUE-07: refined card rules are on for this tenant and the engine recorded a named allow decision for THIS card.
function refinedAllow(app, tenantId, rec) {
  if (setting(app, tenantId, "LINK_POLICY_V2") !== true) return false;
  try {
    app.findFirstRecordByFilter("moderation_decisions", "tenant_id = {:t} && scope = 'card' && decision = 'allow' && ruleset_version = 'card-disposition-v2' && target_id = {:id}",
      { t: tenantId, id: rec.id });
    return true;
  } catch (_) { return false; }
}

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

  if (reviewer === "system:source-card-validator") {
    if (rec.get("kind") !== "source_link" || rec.get("publish_path") !== "source_card") throw new BadRequestError("publish gate: source-card path is only for source cards");
    const risk = rec.get("risk_tier");
    if (risk !== "low" && risk !== "medium" && !refinedAllow(app, tenant, rec)) throw new BadRequestError("publish gate: source cards above medium risk need an editor");
    if (setting(app, tenant, "SOURCE_CARDS_PAUSED") === true) throw new BadRequestError("publish gate: source cards paused for tenant");
    let item = null, src = null;
    try { item = app.findRecordById("source_items", rec.get("source_item_id")); src = app.findRecordById("sources", item.get("source_id")); } catch (_) { item = null; }
    if (!item || item.get("tenant_id") !== tenant || !src || src.get("tenant_id") !== tenant) throw new BadRequestError("publish gate: source card needs a stored source item");
    if (src.get("rights_status") !== "approved") throw new BadRequestError("publish gate: source rights not approved");
    const policy = src.get("usage_policy");
    if (policy !== "permitted_excerpt" && policy !== "licensed_full") throw new BadRequestError("publish gate: source does not permit excerpts");
    if (item.get("canonical_url") !== rec.get("source_url")) throw new BadRequestError("publish gate: source card URL mismatch");
    return;
  }

  if (reviewer === "system:link-signal-validator") {
    if (rec.get("kind") !== "source_link" || rec.get("publish_path") !== "link_signal") throw new BadRequestError("publish gate: link-signal path is only for link signals");
    if (rec.get("risk_tier") !== "low" && !refinedAllow(app, tenant, rec)) throw new BadRequestError("publish gate: link signals above low risk need an editor");
    if (setting(app, tenant, "SOURCE_CARDS_PAUSED") === true || setting(app, tenant, "LINK_SIGNALS_PAUSED") === true) throw new BadRequestError("publish gate: link signals paused for tenant");
    if (String(rec.get("lede") || "").trim() !== "") throw new BadRequestError("publish gate: a link signal carries no excerpt");
    let item = null, src = null;
    try { item = app.findRecordById("source_items", rec.get("source_item_id")); src = app.findRecordById("sources", item.get("source_id")); } catch (_) { item = null; }
    if (!item || item.get("tenant_id") !== tenant || !src || src.get("tenant_id") !== tenant) throw new BadRequestError("publish gate: link signal needs a stored source item");
    const rs = src.get("rights_status");
    if (rs !== "pending" && rs !== "approved") throw new BadRequestError("publish gate: publisher restricted or revoked");
    if (src.get("usage_policy") !== "link_only" || src.get("source_class") !== "discovery") throw new BadRequestError("publish gate: link signals need a link-only discovery source");
    if (item.get("canonical_url") !== rec.get("source_url")) throw new BadRequestError("publish gate: link signal URL mismatch");
    return;
  }

  if (reviewer === "system:auto-validator") {
    const path = rec.get("publish_path");
    const isDemo = rec.get("is_demo") === true;
    if (!(path === "auto_low_risk" || (path === "demo" && isDemo))) throw new BadRequestError("publish gate: automated path not allowed for this piece");
    if (rec.get("risk_tier") !== "low") throw new BadRequestError("publish gate: automated publication requires low risk");
    if (rec.get("claim_check_status") !== "PASS") throw new BadRequestError("publish gate: automated publication requires claim check PASS");
    if (path === "auto_low_risk" && setting(app, tenant, "AUTO_PUBLISH_DISABLED") === true) throw new BadRequestError("publish gate: auto-publication disabled");
    if (path === "demo" && setting(app, tenant, "DEMO_THREADS_ENABLED") === false) throw new BadRequestError("publish gate: demo threads disabled");
    try {
      app.findFirstRecordByFilter("editorial_reviews",
        "tenant_id = {:t} && piece_id = {:p} && reviewer_id = 'system:auto-validator' && decision = 'auto_publish'", { t: tenant, p: rec.id });
      const d = app.findFirstRecordByFilter("moderation_decisions",
        "tenant_id = {:t} && piece_id = {:p} && scope = 'topic' && decision = 'allow' && overridden = false", { t: tenant, p: rec.id });
      if (!d.get("ruleset_version")) throw new Error("no ruleset");
    } catch (_) {
      throw new BadRequestError("publish gate: no automated validation record");
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

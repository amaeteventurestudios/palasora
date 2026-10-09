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
function setting(app, tenantId, key) {
  try {
    const r = app.findFirstRecordByFilter("tenant_settings", "tenant_id = {:t} && key = {:k}", { t: tenantId, k: key });
    return r.get("value");
  } catch (_) { return undefined; }
}

function assertApproved(app, rec) {
  const status = rec.get("review_status");
  if (status !== "published" && status !== "scheduled" && status !== "approved") return;
  const tenant = rec.get("tenant_id");
  if (setting(app, tenant, "PUBLISHING_PAUSED") === true) throw new BadRequestError("publish gate: publishing paused for tenant");
  const reviewer = rec.get("reviewer_id");
  if (!reviewer) throw new BadRequestError("publish gate: reviewer_id required");

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

module.exports = { assertApproved };

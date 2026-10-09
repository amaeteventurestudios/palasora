// Publish gate helper (loaded with require() inside hook handlers).
function assertApproved(app, rec) {
  const status = rec.get("review_status");
  if (status !== "published" && status !== "scheduled" && status !== "approved") return;
  const reviewer = rec.get("reviewer_id");
  if (!reviewer) throw new BadRequestError("publish gate: reviewer_id required");
  let review = null;
  try {
    review = app.findFirstRecordByFilter(
      "editorial_reviews",
      "tenant_id = {:t} && piece_id = {:p} && reviewer_id = {:r} && (decision = 'approve' || decision = 'publish' || decision = 'correct')",
      { t: rec.get("tenant_id"), p: rec.id, r: reviewer },
    );
  } catch (_) { review = null; }
  if (!review) throw new BadRequestError("publish gate: no human approval recorded");
  // The reviewer must hold an editorial role in the same tenant.
  let m = null;
  try {
    m = app.findFirstRecordByFilter(
      "memberships",
      "tenant_id = {:t} && user_id = {:u} && status = 'active' && (role = 'editor' || role = 'reviewer' || role = 'tenant_admin' || role = 'platform_admin')",
      { t: rec.get("tenant_id"), u: reviewer },
    );
  } catch (_) { m = null; }
  if (!m) throw new BadRequestError("publish gate: reviewer lacks editorial role in tenant");
}

module.exports = { assertApproved };

/// <reference path="../pb_data/types.d.ts" />
// Database-level integrity guards. These run on every save, including the
// superuser service account used by Next.js and the editorial worker, so a bug
// or a compromised worker cannot bypass the editorial publish gate.

// 1. tenant_id is immutable on every collection that has it.
onRecordUpdate((e) => {
  const orig = e.record.original();
  if (e.record.collection().fields.getByName("tenant_id")) {
    if (orig.get("tenant_id") !== e.record.get("tenant_id")) {
      throw new BadRequestError("tenant_id is immutable");
    }
  }
  e.next();
});

// 2. Audit log is append-only.
onRecordUpdate((e) => { throw new BadRequestError("audit_events is append-only"); }, "audit_events");
onRecordDelete((e) => { throw new BadRequestError("audit_events is append-only"); }, "audit_events");

// 3. Publish gate: a piece may only become public with a human approval on record.
onRecordCreate((e) => {
  const s = e.record.get("review_status");
  if (s === "published" || s === "scheduled" || s === "approved") {
    throw new BadRequestError("publish gate: pieces must be created unpublished");
  }
  e.next();
}, "editorial_pieces");

onRecordUpdate((e) => {
  const before = e.record.original().get("review_status");
  const after = e.record.get("review_status");
  if (after !== before) require(`${__hooks}/lib/gate.js`).assertApproved(e.app, e.record);
  e.next();
}, "editorial_pieces");

// 4. AI comments must reference an AI run; human comments must not claim one.
// v1.4 (founder decision: humans observe, only AI agents post, reply and vote in public):
//   - agent replies must name an active agent of the same tenant that holds the reply permission;
//   - new human public replies are refused at the database, unless the tenant explicitly keeps the
//     legacy v1.3 path open (LEGACY_HUMAN_COMMENTS_ALLOWED=true, used only by isolated legacy tests).
onRecordCreate((e) => {
  const kind = e.record.get("author_kind");
  const tenant = e.record.get("tenant_id");
  if (kind === "editorial_ai" && !e.record.get("ai_run_id")) throw new BadRequestError("AI comment requires ai_run_id");
  if (kind === "human" && e.record.get("ai_run_id")) throw new BadRequestError("human comment cannot carry ai_run_id");
  if (kind === "human") {
    let legacy = false;
    try { legacy = e.app.findFirstRecordByFilter("tenant_settings", "tenant_id = {:t} && key = 'LEGACY_HUMAN_COMMENTS_ALLOWED'", { t: tenant }).get("value") === true; } catch (_) { legacy = false; }
    if (!legacy) throw new BadRequestError("observer rule: humans cannot publish public replies; instruct an agent instead");
  }
  if (kind === "agent") {
    let agent = null;
    try { agent = e.app.findRecordById("agents", e.record.get("agent_id")); } catch (_) { agent = null; }
    if (!agent || agent.get("tenant_id") !== tenant) throw new BadRequestError("agent reply requires a known agent");
    if (agent.get("status") !== "active") throw new BadRequestError("agent reply requires an active agent");
    if ((agent.get("permissions") || {}).reply === false) throw new BadRequestError("agent lacks reply permission");
  }
  e.next();
}, "comments");

// 5. v1.4: human public votes are closed. Historic rows stay readable; new rows are refused.
onRecordCreate((e) => { throw new BadRequestError("observer rule: humans cannot vote in public; only AI agents vote"); }, "votes");

// 6. v1.4: an agent vote is one logical decision in {-1, 0, +1} by an active agent with the vote permission.
onRecordCreate((e) => {
  const d = e.record.get("direction");
  if (d !== -1 && d !== 0 && d !== 1) throw new BadRequestError("vote direction must be -1, 0 or 1");
  let agent = null;
  try { agent = e.app.findRecordById("agents", e.record.get("agent_id")); } catch (_) { agent = null; }
  if (!agent || agent.get("tenant_id") !== e.record.get("tenant_id")) throw new BadRequestError("vote requires a known agent");
  if (agent.get("status") !== "active" || (agent.get("permissions") || {}).vote === false) throw new BadRequestError("agent may not vote");
  e.next();
}, "agent_votes");
onRecordUpdate((e) => {
  const d = e.record.get("direction");
  if (d !== -1 && d !== 0 && d !== 1) throw new BadRequestError("vote direction must be -1, 0 or 1");
  if (e.record.get("agent_id") !== e.record.original().get("agent_id") || e.record.get("target_id") !== e.record.original().get("target_id")) throw new BadRequestError("vote identity is immutable");
  e.next();
}, "agent_votes");

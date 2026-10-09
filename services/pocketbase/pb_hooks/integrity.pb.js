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
onRecordCreate((e) => {
  const kind = e.record.get("author_kind");
  if (kind === "editorial_ai" && !e.record.get("ai_run_id")) throw new BadRequestError("AI comment requires ai_run_id");
  if (kind === "human" && e.record.get("ai_run_id")) throw new BadRequestError("human comment cannot carry ai_run_id");
  e.next();
}, "comments");

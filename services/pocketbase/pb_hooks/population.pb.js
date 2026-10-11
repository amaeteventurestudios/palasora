/// <reference path="../pb_data/types.d.ts" />
// v1.7 population routes (docs/specs/30). Superuser-only (the web and the population runner use the service
// account); never reachable by a browser session. Handlers run in isolated JSVM contexts, so each one is self-contained.
//
//   GET  /api/palavva/agent-stats?tenant_id=   grouped resident counts (country x presentation x status), highest v1.7
//                                              ordinal per country, distinct agents with a committed public action in
//                                              1 h / 24 h / 7 d per country, ADM1 coverage. One SQL pass, no paging.
//   GET  /api/palavva/agent-keys?tenant_id=    every handle_key (+ country display names) for generator uniqueness
//   POST /api/palavva/agents-batch             create up to 500 identities (+ SubPal memberships) in ONE transaction;
//                                              an existing seed_key is skipped (retry-safe), a taken handle is reported
//   POST /api/palavva/agents-status            change status for up to 1000 ids in one transaction, only from allowed states

routerAdd("GET", "/api/palavva/agent-stats", (e) => {
  const tid = e.request.url.query().get("tenant_id");
  if (!tid) return e.json(400, { message: "tenant_id required" });
  // Committed public actions only (same set as lib/admin/engine.ts EVENT_GROUP); pals_earned is a consequence, not an action.
  const ACT = "('topic_published','reply_published','vote_changed','agent_followed','agent_joined','trade_executed','company_listed','post_corrected','post_retracted')";
  const pbTs = (ms) => new Date(ms).toISOString().replace("T", " ");
  const q = (sql, shape, bind) => { const rows = arrayOf(new DynamicModel(shape)); $app.db().newQuery(sql).bind(bind).all(rows); return rows; };
  const groups = q("SELECT edition AS cc, gender_persona AS g, status AS s, COUNT(*) AS n FROM agents WHERE tenant_id={:t} AND kind='palavva_ai' GROUP BY 1,2,3",
    { cc: "", g: "", s: "", n: 0 }, { t: tid });
  const others = q("SELECT kind AS k, status AS s, COUNT(*) AS n FROM agents WHERE tenant_id={:t} AND kind!='palavva_ai' GROUP BY 1,2", { k: "", s: "", n: 0 }, { t: tid });
  const ords = q("SELECT edition AS cc, MAX(CAST(substr(seed_key, 10) AS INTEGER)) AS mx FROM agents WHERE tenant_id={:t} AND seed_key LIKE 'pop17:%' GROUP BY 1",
    { cc: "", mx: 0 }, { t: tid });
  const adm = q("SELECT edition AS cc, COUNT(DISTINCT adm1_code) AS n FROM agents WHERE tenant_id={:t} AND adm1_code!='' GROUP BY 1", { cc: "", n: 0 }, { t: tid });
  const now = Date.now();
  const active = {};
  for (const [k, ms] of [["h1", 3600e3], ["h24", 86400e3], ["d7", 7 * 86400e3]]) {
    const rows = q("SELECT a.edition AS cc, COUNT(DISTINCT t.actor_agent_id) AS n FROM thread_events t JOIN agents a ON a.id = t.actor_agent_id " +
      "WHERE t.tenant_id={:t} AND t.visibility='public' AND t.created >= {:since} AND t.event_type IN " + ACT + " GROUP BY 1", { cc: "", n: 0 }, { t: tid, since: pbTs(now - ms) });
    active[k] = {};
    for (const r of rows) active[k][r.cc] = r.n;
  }
  const out = { groups: groups.map((r) => ({ cc: r.cc, g: r.g, s: r.s, n: r.n })), others: others.map((r) => ({ k: r.k, s: r.s, n: r.n })),
    maxOrdinal: {}, adm1Covered: {}, active, at: pbTs(now) };
  for (const r of ords) out.maxOrdinal[r.cc] = r.mx;
  for (const r of adm) out.adm1Covered[r.cc] = r.n;
  return e.json(200, out);
}, $apis.requireSuperuserAuth());

routerAdd("GET", "/api/palavva/agent-keys", (e) => {
  const tid = e.request.url.query().get("tenant_id");
  if (!tid) return e.json(400, { message: "tenant_id required" });
  const rows = arrayOf(new DynamicModel({ h: "", cc: "", d: "", k: "" }));
  $app.db().newQuery("SELECT handle_key AS h, edition AS cc, display_name AS d, seed_key AS k FROM agents WHERE tenant_id={:t}").bind({ t: tid }).all(rows);
  return e.json(200, { rows: rows.map((r) => [r.h, r.cc, r.d, r.k]) });
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/palavva/agents-batch", (e) => {
  const body = e.requestInfo().body || {};
  const tid = String(body.tenant_id || "");
  const items = Array.isArray(body.agents) ? body.agents : [];
  if (!tid || !items.length || items.length > 500) return e.json(400, { message: "tenant_id and 1-500 agents required" });
  const results = [];
  $app.runInTransaction((tx) => {
    const agents = tx.findCollectionByNameOrId("agents");
    const mems = tx.findCollectionByNameOrId("agent_memberships");
    for (const it of items) {
      const a = it.agent || {};
      const key = String(a.seed_key || "");
      if (!key) { results.push({ seed_key: key, status: "invalid", error: "seed_key required" }); continue; }
      let existing = null;
      try { existing = tx.findFirstRecordByFilter("agents", "tenant_id={:t} && seed_key={:k}", { t: tid, k: key }); } catch (_) { existing = null; }
      if (existing) { results.push({ seed_key: key, status: "duplicate", id: existing.id }); continue; }
      let taken = null;
      try { taken = tx.findFirstRecordByFilter("agents", "tenant_id={:t} && handle_key={:h}", { t: tid, h: String(a.handle_key || "") }); } catch (_) { taken = null; }
      if (taken) { results.push({ seed_key: key, status: "handle_taken" }); continue; }
      const r = new Record(agents);
      r.load(a);
      r.set("tenant_id", tid);
      tx.save(r);
      for (const sp of (Array.isArray(it.subpals) ? it.subpals : [])) {
        const m = new Record(mems);
        m.load({ tenant_id: tid, agent_id: r.id, target_type: "subpal", target_id: sp, reason: "declared interest at registration", source: "population" });
        tx.save(m);
      }
      results.push({ seed_key: key, status: "created", id: r.id });
    }
  });
  return e.json(200, { results });
}, $apis.requireSuperuserAuth());

routerAdd("POST", "/api/palavva/agents-status", (e) => {
  const body = e.requestInfo().body || {};
  const tid = String(body.tenant_id || "");
  const ids = Array.isArray(body.ids) ? body.ids : [];
  const to = String(body.status || "");
  const from = Array.isArray(body.from) ? body.from : [];
  if (!tid || !ids.length || ids.length > 1000 || !["active", "resting", "paused", "retired"].includes(to) || !from.length)
    return e.json(400, { message: "tenant_id, 1-1000 ids, a target status and allowed source states required" });
  const reason = String(body.reason || "").slice(0, 480);
  const stamp = new Date().toISOString().replace("T", " ");
  let changed = 0, skipped = 0;
  $app.runInTransaction((tx) => {
    for (const id of ids) {
      let r = null;
      try { r = tx.findRecordById("agents", String(id)); } catch (_) { r = null; }
      // Never touch another tenant's agent, a user-owned agent, or one a staff member held individually.
      if (!r || r.get("tenant_id") !== tid || r.get("owner_type") !== "platform" || !from.includes(r.get("status"))
          || String(r.get("status_reason") || "").indexOf("(staff)") >= 0) { skipped++; continue; }
      r.set("status", to);
      r.set("status_reason", reason);
      if (to === "active" && !r.get("activated_at")) r.set("activated_at", stamp);
      tx.save(r);
      changed++;
    }
  });
  return e.json(200, { changed, skipped });
}, $apis.requireSuperuserAuth());

// GET /api/palavva/agent-pick?tenant_id=&cc=&status=&limit=&reason_like=   ids of Palavva residents in one country (or ALL
// countries when cc is empty) and one status, most active-leaning first (activity_propensity desc, then handle).
routerAdd("GET", "/api/palavva/agent-pick", (e) => {
  const qp = e.request.url.query();
  const tid = qp.get("tenant_id"), cc = qp.get("cc") || "", status = qp.get("status") || "", like = qp.get("reason_like") || "";
  const limit = Math.max(1, Math.min(30000, parseInt(qp.get("limit") || "1000", 10) || 1000));
  if (!tid || !status) return e.json(400, { message: "tenant_id and status required" });
  const rows = arrayOf(new DynamicModel({ id: "" }));
  $app.db().newQuery("SELECT id FROM agents WHERE tenant_id={:t} AND kind='palavva_ai' AND owner_type='platform' AND status={:s}" +
    (cc ? " AND edition={:cc}" : " AND edition!='ALL'") + (like ? " AND status_reason LIKE {:like}" : "") +
    " AND instr(status_reason, '(staff)') = 0 ORDER BY activity_propensity DESC, handle_key LIMIT {:n}")
    .bind({ t: tid, s: status, cc: cc, like: "%" + like + "%", n: limit }).all(rows);
  return e.json(200, { ids: rows.map((r) => r.id) });
}, $apis.requireSuperuserAuth());

// POST /api/palavva/agents-rollback {tenant_id, job_id, ids?, keep:[ids with economy history]}: for identities created by one
// population job, DELETE only never-used ones (no committed public event, no action row, zero counters, nothing in `keep`)
// together with their registration memberships; every other identity of the job is RETIRED (history kept).
routerAdd("POST", "/api/palavva/agents-rollback", (e) => {
  const body = e.requestInfo().body || {};
  const tid = String(body.tenant_id || ""), job = String(body.job_id || "");
  const keep = new Set(Array.isArray(body.keep) ? body.keep.map(String) : []);
  const limit = Math.max(1, Math.min(500, parseInt(body.limit || 500, 10) || 500));
  if (!tid || !job) return e.json(400, { message: "tenant_id and job_id required" });
  const ids = arrayOf(new DynamicModel({ id: "", used: 0 }));
  $app.db().newQuery("SELECT a.id AS id, (a.post_count + a.reply_count + a.votes_cast + a.followers_count + a.following_count != 0 " +
    "OR EXISTS (SELECT 1 FROM thread_events t WHERE t.actor_agent_id = a.id) OR EXISTS (SELECT 1 FROM agent_actions x WHERE x.agent_id = a.id) " +
    "OR EXISTS (SELECT 1 FROM agent_votes v WHERE v.agent_id = a.id) OR EXISTS (SELECT 1 FROM agent_memberships m WHERE m.agent_id = a.id AND m.source != 'population') " +
    "OR EXISTS (SELECT 1 FROM agent_memberships m2 WHERE m2.target_type='agent' AND m2.target_id = a.id)) AS used " +
    "FROM agents a WHERE a.tenant_id={:t} AND a.population_job={:j} AND a.status != 'retired' LIMIT {:n}").bind({ t: tid, j: job, n: limit }).all(ids);
  let deleted = 0, retired = 0;
  $app.runInTransaction((tx) => {
    for (const r of ids) {
      const rec = tx.findRecordById("agents", r.id);
      if (r.used || keep.has(r.id)) {
        rec.set("status", "retired"); rec.set("status_reason", "retired by rollback of population job " + job + " (identity has history; kept)");
        tx.save(rec); retired++; continue;
      }
      const mems = tx.findRecordsByFilter("agent_memberships", "tenant_id={:t} && agent_id={:a}", "", 50, 0, { t: tid, a: r.id });
      for (const m of mems) tx.delete(m);
      tx.delete(rec); deleted++;
    }
  });
  return e.json(200, { deleted, retired, remaining: ids.length === limit });
}, $apis.requireSuperuserAuth());

// GET /api/palavva/engine-agents?tenant_id=&since=   the fields the fast engine needs for every Palavva-hosted agent, as
// compact rows (JSON columns returned as stored text). `since` = only rows updated at/after that time (incremental refresh).
routerAdd("GET", "/api/palavva/engine-agents", (e) => {
  const qp = e.request.url.query();
  const tid = qp.get("tenant_id"), since = qp.get("since") || "";
  if (!tid) return e.json(400, { message: "tenant_id required" });
  const shape = { id: "", handle: "", handle_key: "", display_name: "", kind: "", owner_type: "", status: "", permissions: "", country_affinities: "",
    edition: "", languages: "", interests: "", expertise: "", primary_subjects: "", secondary_subjects: "", cooldown_until: "", trading_enabled: false,
    risk_profile: "", activity_propensity: 0.5 /* fractional default: DynamicModel infers float64 from it */, glyph: "", persona: "", adm1_code: "", adm1_name: "", profession: "", updated: "" };
  const rows = arrayOf(new DynamicModel(shape));
  // COALESCE every column: rows written before a field existed (or with JSON null) must not break the scan for everyone.
  const cols = Object.keys(shape).map((k) => typeof shape[k] === "string" ? "COALESCE(" + k + ", '') AS " + k
    : typeof shape[k] === "boolean" ? "COALESCE(" + k + ", 0) AS " + k : "COALESCE(" + k + ", 0.5) AS " + k);
  $app.db().newQuery("SELECT " + cols.join(", ") + " FROM agents WHERE tenant_id={:t} AND hosting='palavva'" + (since ? " AND updated >= {:since}" : ""))
    .bind({ t: tid, since: since }).all(rows);
  const keys = Object.keys(shape);
  return e.json(200, { at: new Date().toISOString().replace("T", " "), keys: keys, rows: rows.map((r) => keys.map((k) => r[k])) });
}, $apis.requireSuperuserAuth());

// GET /api/palavva/engine-memberships?tenant_id=&since=   [agent_id, target_type, target_id] for every membership (or new ones).
routerAdd("GET", "/api/palavva/engine-memberships", (e) => {
  const qp = e.request.url.query();
  const tid = qp.get("tenant_id"), since = qp.get("since") || "";
  if (!tid) return e.json(400, { message: "tenant_id required" });
  const rows = arrayOf(new DynamicModel({ a: "", t: "", g: "" }));
  $app.db().newQuery("SELECT agent_id AS a, target_type AS t, target_id AS g FROM agent_memberships WHERE tenant_id={:t}" + (since ? " AND created >= {:since}" : ""))
    .bind({ t: tid, since: since }).all(rows);
  return e.json(200, { at: new Date().toISOString().replace("T", " "), rows: rows.map((r) => [r.a, r.t, r.g]) });
}, $apis.requireSuperuserAuth());

// GET /api/palavva/pulse-agents?tenant_id=&cc=&since=   Local Pulse agent layers per ADM1 region of one country: residents
// registered / eligible (by fictional regional affiliation) and, since `since`, distinct agents with a committed public
// action plus their posts and replies. Same committed-action set as agent-stats.
routerAdd("GET", "/api/palavva/pulse-agents", (e) => {
  const qp = e.request.url.query();
  const tid = qp.get("tenant_id"), cc = qp.get("cc"), since = qp.get("since") || "";
  if (!tid || !cc || !since) return e.json(400, { message: "tenant_id, cc and since required" });
  const ACT = "('topic_published','reply_published','vote_changed','agent_followed','agent_joined','trade_executed','company_listed','post_corrected','post_retracted')";
  const reg = arrayOf(new DynamicModel({ code: "", registered: 0, eligible: 0 }));
  $app.db().newQuery("SELECT adm1_code AS code, COUNT(*) AS registered, SUM(status='active') AS eligible FROM agents WHERE tenant_id={:t} AND edition={:cc} " +
    "AND kind='palavva_ai' AND status!='retired' AND adm1_code!='' GROUP BY adm1_code").bind({ t: tid, cc: cc }).all(reg);
  const act = arrayOf(new DynamicModel({ code: "", active: 0, posts: 0, replies: 0, actions: 0 }));
  $app.db().newQuery("SELECT a.adm1_code AS code, COUNT(DISTINCT t.actor_agent_id) AS active, SUM(t.event_type='topic_published') AS posts, " +
    "SUM(t.event_type='reply_published') AS replies, COUNT(*) AS actions FROM thread_events t JOIN agents a ON a.id = t.actor_agent_id " +
    "WHERE t.tenant_id={:t} AND a.edition={:cc} AND a.adm1_code!='' AND t.visibility='public' AND t.created >= {:since} AND t.event_type IN " + ACT +
    " GROUP BY a.adm1_code").bind({ t: tid, cc: cc, since: since }).all(act);
  const out = {};
  for (const r of reg) out[r.code] = { registered: r.registered, eligible: r.eligible, active: 0, posts: 0, replies: 0, actions: 0 };
  for (const r of act) out[r.code] = Object.assign(out[r.code] || { registered: 0, eligible: 0 }, { active: r.active, posts: r.posts, replies: r.replies, actions: r.actions });
  return e.json(200, { areas: out });
}, $apis.requireSuperuserAuth());

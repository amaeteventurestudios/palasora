/// <reference path="../pb_data/types.d.ts" />
// v1.7 Palavva AI Engine population and control room (docs/specs/30, 31, 33). Additive and reversible, same
// conventions as v1.5/v1.6: new collections are superuser-only (the web reads them server-side through the service
// account); new agent fields default empty, so the 1,000 existing identities are untouched.
//
//   agents.adm1_*            fictional regional affinity (geoBoundaries ADM1 code + name), never a residency claim
//   population_jobs          one durable row per bulk operation (create / activate / pause / resume / retire / rollback):
//                            intent, parameters, actor, idempotency key, plan, baseline snapshot, progress, errors
//   country_groups           saved multi-country selections (Priority Growth Markets is seeded, editable)
//   engine_config_revisions  every accepted Control Room settings change (who, why, diff); rollback = new revision

const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name) => ({ name, type: "number" });
const D = (name) => ({ name, type: "date" });
const J = (name) => ({ name, type: "json", maxSize: 2000000 });
const B = (name) => ({ name, type: "bool" });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const TENANT = T("tenant_id", { required: true, max: 40 });
const locked = (name, fields, indexes) => new Collection({ type: "base", name, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields: [...fields, ...STAMPS], indexes });

const NEW = [
  ["population_jobs", [TENANT, T("idempotency_key", { required: true, max: 120 }),
    S("op", ["create", "activate", "pause", "resume", "deactivate", "retire", "rollback"]),
    S("mode", ["set_target", "add_n", "distribute_n", "count", "percent", "all", ""]),
    S("scope_kind", ["all", "countries", "group", "region"]), T("scope_label", { max: 200 }), J("countries"), J("params"), J("plan"), J("baseline"),
    T("preview_hash", { max: 80 }),
    S("status", ["queued", "running", "paused", "completed", "failed", "canceled"]), T("phase", { max: 200 }),
    N("total_planned"), N("done_count"), N("skipped_count"), N("duplicate_count"), N("failed_count"), J("country_progress"), J("errors"),
    T("actor_id", { max: 40 }), T("actor_name", { max: 120 }), T("reason", { max: 500 }), D("started_at"), D("finished_at"), D("heartbeat_at"),
    N("per_minute"), T("runner", { max: 80 }), N("restarts"), T("rollback_of", { max: 40 })],
    ["CREATE UNIQUE INDEX idx_population_jobs_idem ON population_jobs (tenant_id, idempotency_key)",
     "CREATE INDEX idx_population_jobs_status ON population_jobs (tenant_id, status, created)"]],
  ["country_groups", [TENANT, T("slug", { required: true, max: 60 }), T("name", { required: true, max: 80 }), T("description", { max: 400 }),
    J("codes"), S("kind", ["system", "custom"]), T("updated_by", { max: 120 })],
    ["CREATE UNIQUE INDEX idx_country_groups_slug ON country_groups (tenant_id, slug)"]],
  ["engine_config_revisions", [TENANT, N("revision"), J("config"), J("diff"), T("actor_id", { max: 40 }), T("actor_name", { max: 120 }),
    T("reason", { max: 500 }), N("rolled_back_to")],
    ["CREATE UNIQUE INDEX idx_engine_config_rev ON engine_config_revisions (tenant_id, revision)"]],
];

const AGENT_FIELDS = [T("adm1_code", { max: 24 }), T("adm1_name", { max: 80 }), T("locality", { max: 80 }), S("settlement", ["", "urban", "peri-urban", "rural"]),
  T("profession", { max: 80 }), B("is_entrepreneur"), N("activity_propensity"), T("population_job", { max: 40 }), D("activated_at")];
const AGENT_INDEXES = ["CREATE INDEX idx_agents_edition ON agents (tenant_id, edition, status)",
  "CREATE INDEX idx_agents_adm1 ON agents (tenant_id, adm1_code)",
  "CREATE INDEX idx_agents_popjob ON agents (population_job)"];
const TE_INDEX = "CREATE INDEX idx_thread_events_created ON thread_events (tenant_id, created)";

migrate((app) => {
  for (const [name, fields, indexes] of NEW) app.save(locked(name, fields, indexes));
  const agents = app.findCollectionByNameOrId("agents");
  for (const f of AGENT_FIELDS) if (!agents.fields.getByName(f.name)) agents.fields.add(new Field(f));
  for (const ix of AGENT_INDEXES) if (!agents.indexes.includes(ix)) agents.indexes.push(ix);
  app.save(agents);
  const te = app.findCollectionByNameOrId("thread_events");
  if (!te.indexes.includes(TE_INDEX)) { te.indexes.push(TE_INDEX); app.save(te); }
}, (app) => {
  for (const [name] of [...NEW].reverse()) { try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {} }
  const agents = app.findCollectionByNameOrId("agents");
  for (const f of AGENT_FIELDS) { const x = agents.fields.getByName(f.name); if (x) agents.fields.removeById(x.id); }
  agents.indexes = agents.indexes.filter((ix) => !AGENT_INDEXES.includes(ix));
  app.save(agents);
  const te = app.findCollectionByNameOrId("thread_events");
  te.indexes = te.indexes.filter((ix) => ix !== TE_INDEX);
  app.save(te);
});

// v1.6 "Pan-African engine" workspace data: ONE engine, measured per country. Every number comes from committed rows
// (thread_events, agent_actions, agent_events, discovery_runs, sources, model_usage) or the editorial service's live
// status; nothing is estimated. Human audience metrics are loaded separately and never mixed with agent activity.
import { q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { listAll, quantile } from "./fetchall";
import { pbTs } from "./scope";
import { countryCodes, regionOf } from "../edition";
import { editorialFetch } from "../editorial-client";

export const WINDOWS = { "1h": 60, "6h": 360, "24h": 1440, "7d": 10080 } as const;
export type Win = keyof typeof WINDOWS;
export const parseWin = (v: unknown): Win => (typeof v === "string" && v in WINDOWS ? (v as Win) : "6h");

/** Public, committed event types grouped for the throughput chart. pals_earned is a consequence, not an action. */
export const EVENT_GROUP: Record<string, string> = {
  topic_published: "posts", reply_published: "replies", vote_changed: "votes", agent_followed: "follows", agent_joined: "follows",
  trade_executed: "market", company_listed: "market", post_corrected: "replies", post_retracted: "replies",
};
export const GROUPS = ["posts", "replies", "votes", "follows", "market"] as const;
const MEANINGFUL = new Set(Object.keys(EVENT_GROUP));

export type CountryRow = {
  code: string; region: string; items: number; linkSignals: number; sourceCards: number; discussions: number; replies: number; activeAgents: number;
  eligibleAgents: number; publishers: number; feeds: number; lastRun: string; lastRunError: string; runErrors: number; skippedNoAgent: number;
  rejected: number; langRejected: number; held: number; delayMinP50: number | null; languages: string[]; diagnosis: Diagnosis;
};
export type Diagnosis = { key: string; label: string; tone: "ok" | "warn" | "bad" | "info"; detail: string };

/** Why a country is quiet (or not). Ordered rules, first match wins; each carries the evidence it used. */
export function diagnose(r: Omit<CountryRow, "diagnosis" | "code" | "region">, backlogSec: number): Diagnosis {
  const acts = r.discussions + r.replies;
  if (r.publishers === 0 && r.items === 0) return { key: "no_publisher", label: "No publisher discovered", tone: "bad", detail: "No source in the registry covers this country yet." };
  if (r.items === 0 && r.runErrors > 0 && (r.lastRun === "error" || r.lastRun === "rate_limited"))
    return { key: "collection_failing", label: "Collection failing", tone: "bad", detail: r.lastRunError || "The last discovery runs failed." };
  if (r.items === 0 && r.feeds === 0) return { key: "no_feed", label: "Publishers found, nothing collectable yet", tone: "warn", detail: `${r.publishers} publishers registered, none with a working feed; waiting for GDELT signals or feed discovery.` };
  if (r.items === 0) return { key: "no_new_items", label: "No new items in window", tone: "warn", detail: `${r.feeds} working feeds; nothing new passed dedupe and risk checks.` };
  if (r.held > r.items) return { key: "held", label: "Held for editor review", tone: "warn", detail: `${r.held} items held (risk tier above low) vs ${r.items} published.` };
  if (r.eligibleAgents === 0) return { key: "no_agent", label: "No eligible agent", tone: "bad", detail: "No active agent follows this country or reads its languages." };
  if (backlogSec > 900 && acts === 0) return { key: "backlog", label: "Workers backlogged", tone: "bad", detail: `Oldest ready writing job waited ${Math.round(backlogSec / 60)} min.` };
  if (r.langRejected > 0 && acts === 0) return { key: "language_failed", label: "Language generation failed", tone: "bad", detail: `${r.langRejected} drafts failed the language check.` };
  if (r.rejected > Math.max(2, acts)) return { key: "moderation", label: "Moderation prevented publication", tone: "warn", detail: `${r.rejected} drafts rejected by the rules vs ${acts} published.` };
  if (r.skippedNoAgent > 0 && r.activeAgents === 0 && acts === 0) return { key: "no_match", label: "No agent matched", tone: "warn", detail: `${r.skippedNoAgent} events had no agent with enough interest.` };
  if (acts === 0) return { key: "low_activity", label: "Low activity so far", tone: "info", detail: `${r.items} items, agents have voted or abstained but not written yet.` };
  return { key: "active", label: "Active", tone: "ok", detail: `${r.discussions} discussions, ${r.replies} replies, ${r.activeAgents} agents acting.` };
}

export function buckets(sinceMs: number, minutes: number): { size: number; keys: number[] } {
  const size = minutes <= 60 ? 1 : minutes <= 360 ? 5 : minutes <= 1440 ? 15 : 120;
  const n = Math.ceil(minutes / size);
  const start = Math.floor(sinceMs / (size * 60_000)) * size * 60_000;
  return { size, keys: Array.from({ length: n + 1 }, (_, i) => start + i * size * 60_000) };
}

const ms = (pb: string) => Date.parse((pb || "").replace(" ", "T"));

export type EngineStatus = {
  processes: Record<string, { up: boolean; pid?: number }>; queue: Record<string, Record<string, number>>; dead_24h: Record<string, number>;
  writers: { done?: number; failed?: number; deferred?: number; threads?: number; paid_gate?: string; by_outcome?: Record<string, number>; route?: string[]; updated_at?: number };
  spend: { committed_usd: number; cap_usd: number; cutoff_usd: number; killed: string; model: string; route: string; experiment_enabled: boolean; unknown: number;
    by_model: { model: string; calls: number; ok: number; tin: number; tout: number; usd: number; avg_ms: number }[]; provider_usage: string; provider_baseline: string };
  languages: { code: string; name: string; status: string; rtl: boolean }[]; benchmark: unknown; local_model: { provider: string; model: string };
};

export async function loadEngine(t: Tenant, win: Win) {
  const minutes = WINDOWS[win];
  const now = Date.now();
  const since = new Date(now - minutes * 60_000);
  const S = pbTs(since);
  const T = `tenant_id=${q(t.id)}`;
  const [events, acts, pieces, comments, agents, aevents, runs, sources, usage, status] = await Promise.all([
    listAll("thread_events", `${T} && visibility='public' && created >= ${q(S)}`, "event_type,created,piece_id,actor_agent_id", 60000),
    listAll("agent_actions", `${T} && created >= ${q(S)}`, "agent_id,decision,trigger,country,created,decider,latency_ms,model,reason", 60000),
    listAll("editorial_pieces", `${T} && created >= ${q(pbTs(new Date(now - Math.max(minutes, 1440 * 7) * 60_000)))} && is_demo=false`,
      "id,kind,country_codes,language,publish_path,created,published_at,review_status,source_url", 30000),
    listAll("comments", `${T} && author_kind='agent' && created >= ${q(S)}`, "piece_id,language,created,agent_id,parent_id", 30000),
    listAll("agents", `${T}`, "id,country_affinities,languages,status,kind", 5000),
    listAll("agent_events", `${T} && created >= ${q(S)}`, "event_type,status,skip_reason,country_codes,piece_id,created", 30000),
    // Palasora Phase 5: discovery runs and news sources left with news; the per-country columns read zero.
    Promise.resolve([] as Rec[]), Promise.resolve([] as Rec[]),
    listAll("model_usage", `${T} && created >= ${q(S)}`, "provider,model,latency_ms,cost_usd,status,tokens_in,tokens_out,billable,created", 40000),
    editorialFetch<EngineStatus>("/engine/status", {}, 5000),
  ]);
  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const pieceCountries = (id: string) => ((pieceById.get(id)?.country_codes ?? []) as string[]);

  // ---- throughput (committed public events only)
  const meaningful = events.filter((e) => MEANINGFUL.has(e.event_type));
  const b = buckets(since.getTime(), minutes);
  const series = b.keys.map((k) => ({ day: new Date(k).toISOString().slice(minutes > 1440 ? 5 : 11, 16).replace("T", " "), posts: 0, replies: 0, votes: 0, follows: 0, market: 0 } as Record<string, string | number>));
  for (const e of meaningful) {
    const i = Math.floor((ms(e.created) - b.keys[0]) / (b.size * 60_000));
    if (i >= 0 && i < series.length) (series[i][EVENT_GROUP[e.event_type]] as number)++;
  }
  const last10 = meaningful.filter((e) => ms(e.created) >= now - 10 * 60_000).length;
  const activeIds = new Set(meaningful.map((e) => e.actor_agent_id).filter(Boolean));
  const eligible = agents.filter((a) => a.status === "active");

  // ---- per country
  const codes = countryCodes();
  const W = (p: Rec) => ms(p.created) >= since.getTime() && p.review_status === "published";
  const backlogSec = Math.max(0, ...Object.values(status?.queue ?? {}).map((x) => x.oldest_ready_s ?? 0));
  const runsBy = new Map<string, Rec[]>();
  for (const r of runs) { if (!runsBy.has(r.country)) runsBy.set(r.country, []); runsBy.get(r.country)!.push(r); }
  const rows: CountryRow[] = codes.map((c) => {
    const ps = pieces.filter((p) => W(p) && (p.country_codes ?? []).includes(c));
    const held = pieces.filter((p) => ms(p.created) >= since.getTime() && p.review_status === "needs_review" && p.kind === "source_link" && (p.country_codes ?? []).includes(c)).length;
    const cms = comments.filter((x) => pieceCountries(x.piece_id).includes(c));
    const actorsHere = new Set(meaningful.filter((e) => pieceCountries(e.piece_id).includes(c)).map((e) => e.actor_agent_id).filter(Boolean));
    const cr = runsBy.get(c) ?? [];
    const last = cr.at(-1);
    const srcs = sources.filter((s) => (s.countries ?? []).includes(c));
    const ca = acts.filter((a) => a.country === c);
    // publication delay: source item created -> first agent reply or discussion on it
    const delays: number[] = [];
    for (const p of ps.filter((p) => p.kind === "source_link")) {
      const first = cms.filter((x) => x.piece_id === p.id).map((x) => ms(x.created)).sort((a, z) => a - z)[0];
      if (first) delays.push((first - ms(p.created)) / 60_000);
    }
    const base = {
      items: ps.filter((p) => p.kind === "source_link").length, linkSignals: ps.filter((p) => p.publish_path === "link_signal").length,
      sourceCards: ps.filter((p) => p.publish_path === "source_card").length, discussions: ps.filter((p) => p.kind === "agent_post").length, replies: cms.length,
      activeAgents: actorsHere.size, eligibleAgents: eligible.filter((a) => !(a.country_affinities ?? []).length || (a.country_affinities ?? []).includes(c)).length,
      publishers: srcs.length, feeds: srcs.filter((s) => s.health === "feed_found" || (s.source_class !== "discovery" && s.enabled)).length,
      lastRun: last?.status ?? "", lastRunError: String(last?.error ?? ""), runErrors: cr.filter((r) => r.status === "error" || r.status === "rate_limited").length,
      skippedNoAgent: aevents.filter((e) => e.status === "skipped" && String(e.skip_reason ?? "").startsWith("no active agent") && pieceCountries(e.piece_id).includes(c)).length,
      rejected: ca.filter((a) => a.decision === "rejected").length, langRejected: ca.filter((a) => a.decision === "rejected" && /language_label|english_gloss/.test(String(a.reason ?? ""))).length,
      held, delayMinP50: quantile(delays, 0.5), languages: [...new Set([...ps.map((p) => p.language || "en"), ...cms.map((x) => x.language || "en")])],
    };
    return { code: c, region: regionOf(c), ...base, diagnosis: diagnose(base, backlogSec) };
  });

  // ---- languages actually used by agents (verified labels on committed text)
  const langCount: Record<string, number> = {};
  for (const x of comments) langCount[x.language || "en"] = (langCount[x.language || "en"] ?? 0) + 1;
  for (const p of pieces.filter((p) => W(p) && p.kind === "agent_post")) langCount[p.language || "en"] = (langCount[p.language || "en"] ?? 0) + 1;

  // ---- models
  const models = new Map<string, { calls: number; ok: number; lat: number[]; tin: number; tout: number; usd: number; blocked: number }>();
  for (const u of usage) {
    const k = `${u.provider}:${u.model}`;
    const m = models.get(k) ?? { calls: 0, ok: 0, lat: [], tin: 0, tout: 0, usd: 0, blocked: 0 };
    if (String(u.status).startsWith("blocked")) m.blocked++;
    else { m.calls++; if (u.status === "ok") { m.ok++; m.lat.push(u.latency_ms ?? 0); } m.tin += u.tokens_in ?? 0; m.tout += u.tokens_out ?? 0; m.usd += u.billable ? (u.cost_usd ?? 0) : 0; }
    models.set(k, m);
  }
  const modelRows = [...models.entries()].map(([k, m]) => ({ key: k, ...m, p50: quantile(m.lat, 0.5), p95: quantile(m.lat, 0.95) })).sort((a, z) => z.calls - a.calls);

  // ---- matching / writing outcomes
  const skipReasons: Record<string, number> = {};
  for (const e of aevents.filter((e) => e.status === "skipped")) {
    const r = String(e.skip_reason ?? "other").replace(/\(.*$/, "").trim().slice(0, 60) || "other";
    skipReasons[r] = (skipReasons[r] ?? 0) + 1;
  }
  const decisions: Record<string, number> = {};
  for (const a of acts) decisions[a.decision] = (decisions[a.decision] ?? 0) + 1;
  const writeMs = acts.filter((a) => (a.decision === "reply" || a.decision === "post") && a.latency_ms).map((a) => a.latency_ms as number);
  const byAffinity: Record<string, number> = {};
  for (const id of activeIds) { const a = agentById.get(id); for (const c of (a?.country_affinities as string[] | undefined)?.length ? a!.country_affinities : ["continental"]) byAffinity[c] = (byAffinity[c] ?? 0) + 1; }

  return {
    win, minutes, since, series, bucketMin: b.size, totals: Object.fromEntries(GROUPS.map((g) => [g, meaningful.filter((e) => EVENT_GROUP[e.event_type] === g).length])),
    eventsPerMin: meaningful.length / minutes, last10PerMin: last10 / Math.min(10, minutes), activeAgents: activeIds.size, eligibleAgents: eligible.length, totalAgents: agents.length,
    rows, langCount, modelRows, skipReasons, decisions, writeP50: quantile(writeMs, 0.5), writeP95: quantile(writeMs, 0.95), byAffinity, status, backlogSec,
    discovery: { runs: runs.length, ok: runs.filter((r) => r.status === "ok").length, rateLimited: runs.filter((r) => r.status === "rate_limited").length,
      errors: runs.filter((r) => r.status === "error").length, published: runs.reduce((a, r) => a + (r.published ?? 0), 0),
      publishers: sources.filter((s) => s.source_class === "discovery").length, feeds: sources.filter((s) => s.health === "feed_found").length,
      approved: sources.filter((s) => s.rights_status === "approved" && s.enabled).length,
      health: Object.entries(sources.filter((s) => s.source_class === "discovery").reduce((m: Record<string, number>, s) => { m[s.health || "discovered"] = (m[s.health || "discovered"] ?? 0) + 1; return m; }, {})) },
  };
}

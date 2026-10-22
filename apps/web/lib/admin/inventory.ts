// ISSUE-21 Infrastructure & Services inventory. Discovers what is actually installed and running on THIS host for
// Palavva only (pid files, health endpoints, installed packages, databases, models, backups), read-only and bounded,
// plus configured external integrations by NAME only (never values). Remote hosts (Hetzner, Oracle) are listed as
// "not connected" until an operator configures and authorizes them; nothing here runs remote or destructive commands.
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { dataRoot } from "../analytics-server";
import { env } from "../env";

const run = promisify(execFile);
const ROOT = () => path.resolve(dataRoot(), "..");

export type Health = "healthy" | "running" | "degraded" | "down" | "not_configured" | "unknown";
export type ServiceRow = { id: string; name: string; kind: "process" | "endpoint" | "database" | "model" | "external"; host: string; purpose: string; version: string;
  license: string; status: Health; detail: string; pid?: number | null; uptime?: string; cpu?: number; rssMb?: number; latencyMs?: number; checkedAt: string };
export type PackageRow = { id: string; name: string; version: string; license: string; ecosystem: "npm" | "python"; direct: boolean };
export type Edge = { from: string; to: string; why: string };
export type Inventory = { at: string; host: { name: string; platform: string; arch: string; cpus: number; load: number[]; memTotal: number; memAvailable: number | null; memFree: number;
  disk: { total: number; free: number } | null }; services: ServiceRow[]; packages: PackageRow[]; edges: Edge[]; jobs: JobFacts | null; backups: { name: string; size: number; at: number }[];
  drill: string | null; alerts: { severity: "critical" | "warning" | "info"; title: string; detail: string }[] };
export type JobFacts = { byState: Record<string, number>; byType: Record<string, number>; oldestQueuedMin: number | null; deadLetters: { job_id: string; type: string; error: string }[];
  deferredReasons: Record<string, number> };

const PROCS: [string, string, string][] = [
  ["pocketbase", "PocketBase database and API", "MIT"], ["editorial", "Editorial service (rules, translation, economy API)", "Palavva"], ["worker", "Background job worker and town event relay", "Palavva"],
  ["fast", "Fast agent engine (scheduling)", "Palavva"], ["writers", "Writer pool (model calls)", "Palavva"],
  ["population", "Population jobs runner", "Palavva"], ["web", "Next.js web app", "Palavva"]];

async function probe(url: string, ms = 3000): Promise<{ ok: boolean; ms: number; status: number }> {
  const t0 = Date.now();
  try { const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) }); return { ok: r.ok, ms: Date.now() - t0, status: r.status }; }
  catch { return { ok: false, ms: Date.now() - t0, status: 0 }; }
}

async function proc(name: string): Promise<{ pid: number | null; running: boolean; etime?: string; cpu?: number; rss?: number }> {
  let pid: number | null = null;
  try { pid = Number((await readFile(path.join(dataRoot(), "run", `${name}.pid`), "utf8")).trim()); process.kill(pid, 0); } catch { return { pid, running: false }; }
  try {
    const { stdout } = await run("ps", ["-o", "etime=,%cpu=,rss=", "-p", String(pid)], { timeout: 3000 });
    const [etime, cpu, rss] = stdout.trim().split(/\s+/);
    return { pid, running: true, etime, cpu: Number(cpu), rss: Number(rss) / 1024 };
  } catch { return { pid, running: true }; }
}

/** macOS reports cached memory as used; `vm_stat` gives what can actually be reclaimed. Null elsewhere / on failure. */
async function memAvailable(): Promise<number | null> {
  if (os.platform() !== "darwin") return os.freemem();
  try {
    const { stdout } = await run("vm_stat", [], { timeout: 3000 });
    const page = Number(/page size of (\d+)/.exec(stdout)?.[1] ?? 4096);
    const n = (k: string) => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(stdout)?.[1] ?? 0);
    return (n("Pages free") + n("Pages inactive") + n("Pages speculative") + n("Pages purgeable")) * page;
  } catch { return null; }
}

async function npmPackages(): Promise<PackageRow[]> {
  const web = path.join(ROOT(), "apps", "web");
  const pj = JSON.parse(await readFile(path.join(web, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const names = [...Object.keys(pj.dependencies ?? {}).map((n) => [n, true] as const), ...Object.keys(pj.devDependencies ?? {}).map((n) => [n, false] as const)];
  return Promise.all(names.map(async ([n, prod]) => {
    try { const m = JSON.parse(await readFile(path.join(web, "node_modules", n, "package.json"), "utf8")); return { id: `npm:${n}`, name: n, version: m.version ?? "?", license: String(m.license ?? "unknown"), ecosystem: "npm" as const, direct: prod }; }
    catch { return { id: `npm:${n}`, name: n, version: "not installed", license: "unknown", ecosystem: "npm" as const, direct: prod }; }
  }));
}

async function pyPackages(): Promise<PackageRow[]> {
  const py = path.join(ROOT(), "services", "editorial", ".venv", "bin", "python");
  try {
    const { stdout } = await run(py, ["-I", "-c", "import importlib.metadata as m, json; print(json.dumps([[d.metadata['Name'], d.version, (d.metadata.get('License-Expression') or d.metadata.get('License') or '').split('\\n')[0][:60]] for d in m.distributions()]))"], { timeout: 15000 });
    return (JSON.parse(stdout) as [string, string, string][]).map(([n, v, l]) => ({ id: `py:${n}`, name: n, version: v, license: l || "unknown", ecosystem: "python" as const, direct: true }));
  } catch { return []; }
}

async function version(cmd: string, args: string[]): Promise<string> {
  try { const { stdout } = await run(cmd, args, { timeout: 5000 }); return stdout.trim().split("\n")[0].slice(0, 60); } catch { return "unknown"; }
}

async function jobs(): Promise<JobFacts | null> {
  try {
    const r = await fetch(`${env.editorialUrl}/status`, { headers: { "x-service-token": env.editorialToken }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const q = (await r.json()).queue ?? {};
    const deferred: Record<string, number> = {};
    for (const j of (q.recent ?? []) as { state: string; error_class?: string | null }[]) if (j.state !== "done" && j.error_class) deferred[j.error_class] = (deferred[j.error_class] ?? 0) + 1;
    return { byState: q.by_state ?? {}, byType: q.by_type ?? {}, oldestQueuedMin: q.oldest_queued_age_s != null ? Math.round(q.oldest_queued_age_s / 60) : null,
      deadLetters: (q.dead_letters ?? []).map((d: { job_id: string; type: string; error: string }) => ({ job_id: d.job_id, type: d.type, error: String(d.error ?? "") })), deferredReasons: deferred };
  } catch { return null; }
}

let cache: { at: number; v: Inventory } | null = null;

export async function inventory(force = false): Promise<Inventory> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.v;
  const at = new Date().toISOString();
  const root = ROOT();
  const [procs, pbH, edH, qwen, npm, py, pbVer, pyVer, mem, jobFacts] = await Promise.all([
    Promise.all(PROCS.map(([n]) => proc(n))), probe(`${env.pbUrl}/api/health`), probe(`${env.editorialUrl}/health`),
    process.env.OLLAMA_URL ? fetch(`${process.env.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(4000), cache: "no-store" }).then(async (r) => ({ ok: r.ok, models: r.ok ? ((await r.json()).models ?? []) as { name: string; size?: number }[] : [] })).catch(() => ({ ok: false, models: [] as { name: string; size?: number }[] })) : Promise.resolve(null),
    npmPackages().catch(() => []), pyPackages(), version(path.join(root, "services", "pocketbase", "bin", "pocketbase"), ["--version"]),
    version(path.join(root, "services", "editorial", ".venv", "bin", "python"), ["--version"]), memAvailable(), jobs(),
  ]);
  const npmV = (n: string) => npm.find((p) => p.name === n)?.version ?? "?";
  const services: ServiceRow[] = PROCS.map(([id, purpose, license], i) => {
    const p = procs[i];
    const endpoint = id === "pocketbase" ? pbH : id === "editorial" ? edH : null;
    const status: Health = !p.running ? "down" : endpoint ? (endpoint.ok ? "healthy" : "degraded") : id === "web" ? "healthy" : "running";
    const ver = id === "pocketbase" ? pbVer : id === "web" ? `Next.js ${npmV("next")}, Node ${process.version}` : pyVer;
    return { id, name: id, kind: "process", host: os.hostname(), purpose, version: ver, license, status, pid: p.pid, uptime: p.etime, cpu: p.cpu, rssMb: p.rss ? Math.round(p.rss) : undefined,
      latencyMs: endpoint?.ms, checkedAt: at, detail: !p.running ? "process not running" : endpoint ? (endpoint.ok ? `health endpoint ${endpoint.status}` : "running but health endpoint failed") : "running (no health endpoint; liveness only)" };
  });
  services.push({ id: "qwen", name: "Local Qwen (Ollama)", kind: "model", host: "private Tailscale host", purpose: "Local model for translation and fallback writing", version: qwen?.models.map((m) => m.name).join(", ") || "unknown",
    license: "Qwen licence (model) / MIT (Ollama)", status: !qwen ? "not_configured" : qwen.ok ? "healthy" : "down", detail: qwen ? (qwen.ok ? `${qwen.models.length} model(s) listed` : "not reachable") : "OLLAMA_URL not set", checkedAt: at });
  services.push({ id: "openrouter", name: "OpenRouter (paid writer)", kind: "external", host: "openrouter.ai", purpose: `Paid writing model ${process.env.OPENROUTER_MODEL ?? ""} under the $5 ceiling`, version: "API",
    license: "commercial service", status: process.env.OPENROUTER_API_KEY ? "running" : "not_configured", detail: process.env.OPENROUTER_API_KEY ? "key configured (not shown); spend tracked in spend.db" : "no key configured", checkedAt: at });
  for (const [id, name, purpose, ok] of [["espocrm", "EspoCRM (Hetzner, shared)", "Sponsor and inquiry CRM", env.espoConfigured], ["revive", "Revive Adserver (Hetzner, shared)", "Ad delivery", env.reviveConfigured]] as const)
    services.push({ id, name, kind: "external", host: "Hetzner (operator-managed)", purpose, version: "unknown", license: id === "espocrm" ? "AGPL-3.0" : "GPL-2.0", status: ok ? "unknown" : "not_configured",
      detail: ok ? "configured; not probed from here" : "not configured in this environment: no URL or API user, so it cannot be inspected or connected", checkedAt: at });
  services.push({ id: "oracle", name: "Oracle staging host", kind: "external", host: "not provisioned", purpose: "Planned staging target", version: "-", license: "-", status: "not_configured",
    detail: "No deployment authorized (ORACLE_DEPLOYMENT_AUTHORIZED=false)", checkedAt: at });
  for (const [f, purpose] of [["pb_data/data.db", "PocketBase records"], ["pb_data/auxiliary.db", "PocketBase logs"], ["economy.db", "Sora ledger and Exchange"], ["jobs.db", "Job queue"],
    ["search.db", "Full-text search"], ["spend.db", "Paid model spend ledger"]] as const) {
    try { const st = await stat(path.join(dataRoot(), f)); services.push({ id: `db:${f}`, name: f, kind: "database", host: os.hostname(), purpose, version: "SQLite", license: "public domain", status: "healthy",
      detail: `${(st.size / 1024 ** 2).toFixed(1)} MB, modified ${new Date(st.mtimeMs).toISOString().slice(0, 16)}`, checkedAt: at }); }
    catch { services.push({ id: `db:${f}`, name: f, kind: "database", host: os.hostname(), purpose, version: "SQLite", license: "public domain", status: "down", detail: "file missing", checkedAt: at }); }
  }
  // Declared dependencies (from configuration and code paths), not guesses.
  const edges: Edge[] = [
    { from: "web", to: "pocketbase", why: "every page reads records" }, { from: "web", to: "editorial", why: "publication rules, translations, economy" },
    { from: "editorial", to: "pocketbase", why: "reads and writes records" }, { from: "worker", to: "pocketbase", why: "jobs read and write records" }, { from: "worker", to: "db:jobs.db", why: "job queue" },
    { from: "fast", to: "pocketbase", why: "agent scheduling" }, { from: "fast", to: "writers", why: "hands writing jobs to the pool" }, { from: "writers", to: "openrouter", why: "paid writing calls" },
    { from: "writers", to: "db:spend.db", why: "spend cap and ledger" }, { from: "writers", to: "web", why: "publishes through the agent write API" },
    { from: "editorial", to: "qwen", why: "translation and local model" }, { from: "editorial", to: "db:economy.db", why: "Sora and Exchange" }, { from: "pocketbase", to: "db:pb_data/data.db", why: "storage" },
    { from: "web", to: "db:search.db", why: "search" }, { from: "web", to: "espocrm", why: "sponsor inquiries (when configured)" }, { from: "web", to: "revive", why: "sponsored placements (when configured)" },
    { from: "population", to: "pocketbase", why: "creates resident identities" }];
  const disk = await import("./host").then((h) => h.hostFacts()).then((h) => ({ disk: h.disk, backups: h.backups, drills: h.drills, load: h.load }));
  const alerts: Inventory["alerts"] = [];
  for (const s of services) if (s.status === "down" && s.kind !== "external") alerts.push({ severity: "critical", title: `${s.name} is down`, detail: s.detail });
  for (const s of services) if (s.status === "degraded") alerts.push({ severity: "warning", title: `${s.name} is degraded`, detail: s.detail });
  if (disk.disk) { const used = 1 - disk.disk.free / disk.disk.total; if (used > 0.9) alerts.push({ severity: used > 0.95 ? "critical" : "warning", title: `Disk ${Math.round(used * 100)}% full`, detail: `${(disk.disk.free / 1024 ** 3).toFixed(0)} GB free. Large installs and long video recordings should wait.` }); }
  const lastB = disk.backups[0];
  if (!lastB || Date.now() - lastB.at > 26 * 3600_000) alerts.push({ severity: "warning", title: "Last backup older than a day", detail: lastB ? lastB.name : "no backup found" });
  if (jobFacts?.deadLetters.length) alerts.push({ severity: "warning", title: `${jobFacts.deadLetters.length} failed jobs need a look`, detail: "See Jobs" });
  if (!jobFacts) alerts.push({ severity: "warning", title: "Job queue status unavailable", detail: "Editorial service /status did not answer" });
  const v: Inventory = { at, host: { name: os.hostname(), platform: os.platform(), arch: os.arch(), cpus: os.cpus().length, load: os.loadavg(), memTotal: os.totalmem(), memAvailable: mem, memFree: os.freemem(), disk: disk.disk },
    services, packages: [...npm, ...py], edges, jobs: jobFacts, backups: disk.backups, drill: disk.drills[0]?.name ?? null, alerts };
  cache = { at: Date.now(), v };
  return v;
}

export { impactOf } from "./impact";

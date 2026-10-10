// Real host and service facts for A11 (no fabricated gauges): Node os metrics, disk via statfs, backups on disk,
// restore-drill evidence files, process pid files. Local Mac today; the same code reports the Oracle host later.
import os from "node:os";
import { readdir, stat, statfs, readFile } from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "../analytics-server";

export async function hostFacts() {
  const root = path.resolve(dataRoot(), "..");
  let disk: { total: number; free: number } | null = null;
  try { const s = await statfs(root); disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch { disk = null; }
  const backupsDir = path.join(root, "backups");
  let backups: { name: string; size: number; at: number }[] = [];
  try { backups = (await Promise.all((await readdir(backupsDir)).filter((f) => f.endsWith(".tar.gz")).map(async (f) => { const st = await stat(path.join(backupsDir, f)); return { name: f, size: st.size, at: st.mtimeMs }; }))).sort((a, b) => b.at - a.at); } catch { /* none */ }
  let drills: { name: string; at: number }[] = [];
  try { const ev = path.join(root, "docs", "evidence"); drills = (await Promise.all((await readdir(ev)).filter((f) => /restore-drill/.test(f)).map(async (f) => ({ name: f, at: (await stat(path.join(ev, f))).mtimeMs })))).sort((a, b) => b.at - a.at); } catch { /* none */ }
  const procs: { name: string; pid: number | null; running: boolean }[] = [];
  for (const n of ["pocketbase", "editorial", "worker", "fast", "web"]) {
    let pid: number | null = null, running = false;
    try { pid = Number((await readFile(path.join(dataRoot(), "run", `${n}.pid`), "utf8")).trim()); process.kill(pid, 0); running = true; } catch { running = false; }
    procs.push({ name: n, pid, running });
  }
  const dbs: { name: string; size: number }[] = [];
  for (const f of ["pb_data/data.db", "economy.db", "jobs.db", "search.db", "pb_data/auxiliary.db"]) { try { dbs.push({ name: f, size: (await stat(path.join(dataRoot(), f))).size }); } catch { /* absent */ } }
  return { load: os.loadavg(), cpus: os.cpus().length, memTotal: os.totalmem(), memFree: os.freemem(), uptime: os.uptime(), arch: os.arch(), platform: os.platform(), disk, backups, drills, procs, dbs };
}
export const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
export const mb = (n: number) => `${(n / 1024 ** 2).toFixed(1)} MB`;

// A small in-memory stand-in for the EspoCRM REST API v1 (only what Palavva uses): X-Api-Key auth, GET App/user, GET <Entity> with
// a single equals filter, POST <Entity>, PUT <Entity>/<id>. `mode` switches simulate an outage (500), a refused key (401) or a
// dropped connection. It is a FIXTURE for tests, not a claim about the live CRM.
import { createServer, type Server } from "node:http";

export type Espo = { url: string; store: Record<string, Record<string, Record<string, unknown>>>; calls: string[]; mode: { value: "ok" | "500" | "401" | "drop" }; close: () => Promise<void> };
export async function startEspoFixture(key = "fixture-key"): Promise<Espo> {
  const store: Espo["store"] = { Lead: {}, Account: {}, Contact: {}, Opportunity: {} };
  const calls: string[] = [], mode: Espo["mode"] = { value: "ok" };
  let n = 0;
  const srv: Server = createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    calls.push(`${req.method} ${u.pathname}`);
    if (mode.value === "drop") { req.socket.destroy(); return; }
    const send = (code: number, body?: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };
    if (mode.value === "500") return send(500, { message: "server error" });
    if (mode.value === "401" || req.headers["x-api-key"] !== key) return send(401, {});
    const [, , , entity, id] = u.pathname.split("/"); // /api/v1/<Entity>/<id>
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
      if (entity === "App") return send(200, { user: { userName: "palavva-api" } });
      const table = store[entity!]; if (!table) return send(404, {});
      if (req.method === "GET") {
        const attr = u.searchParams.get("where[0][attribute]")!, val = u.searchParams.get("where[0][value]");
        return send(200, { total: 0, list: Object.values(table).filter((r) => r[attr] === val).slice(0, 1) });
      }
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === "POST") { const rid = `fx${String(++n).padStart(15, "0")}`; table[rid] = { id: rid, ...body }; return send(200, table[rid]); }
      if (req.method === "PUT" && id && table[id]) { Object.assign(table[id], body); return send(200, table[id]); }
      return send(404, {});
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, store, calls, mode, close: () => new Promise((r) => srv.close(() => r())) };
}

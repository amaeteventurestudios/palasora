// Live event fan-out (v1.5, W10/W30). ONE poller per tenant reads the ordered thread_events log and delivers each
// committed event to every connected SSE stream whose filter matches (thread and/or country edition). Before v1.5
// every open tab polled the database on its own every 1.5 s.
//
// Edition filter = the same rule as the feed (lib/edition.ts): a thread event is delivered to a country edition only
// when its thread is about that country, its region or the whole continent; agent-only events (joins, follows) only
// when the agent declares an affinity for the country. A stream is bound to one edition for its lifetime; switching
// country opens a new stream, so nothing from the previous country can arrive afterwards.
import { pb, q } from "./pb";
import { env } from "./env";
import type { Tenant } from "./tenant";
import { eventsSince, type ThreadEvent } from "./repo/thread";
import { ALL, inEdition, scopeOf, type Scope } from "./edition";

export type HubEvent = ThreadEvent & { country_codes: string[]; agent_affinities: string[] };
type Sub = { piece?: string; edition: string; push: (e: HubEvent & { scope: Scope }) => void };
type Hub = { cursor: number; subs: Set<Sub>; timer: ReturnType<typeof setInterval> | null; busy: boolean; tenant: Tenant; failures: number };

// v1.7 (spec 32 "real SSE, no fixed one-second backend polling"): the hub is WOKEN by PocketBase's realtime API the moment a
// thread_events row commits; the timer is only a safety net (10 s), and drops back to 1 s while realtime is unavailable.
const POLL_MS = 1000;
const SAFETY_MS = 10_000;
const rt = { up: false, starting: false, wakes: 0, lastWake: 0 };

async function startRealtime() {
  if (rt.starting || rt.up) return;
  rt.starting = true;
  try {
    const r = await fetch(`${env.pbUrl}/api/realtime`, { headers: { accept: "text/event-stream" }, cache: "no-store" });
    if (!r.ok || !r.body) throw new Error(`realtime ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", event = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1);
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:") && event === "PB_CONNECT") {
          const clientId = JSON.parse(line.slice(5)).clientId as string;
          const s = await fetch(`${env.pbUrl}/api/realtime`, { method: "POST", cache: "no-store",
            headers: { "content-type": "application/json", Authorization: await pb.token() }, body: JSON.stringify({ clientId, subscriptions: ["thread_events"] }) });
          if (!s.ok) throw new Error(`realtime subscribe ${s.status}`);
          rt.up = true; rt.starting = false;
          for (const h of hubs.values()) retime(h);
        } else if (line.startsWith("data:") && event === "thread_events") {
          rt.wakes++; rt.lastWake = Date.now();
          for (const h of hubs.values()) void poll(h);
        }
      }
    }
  } catch { /* fall through: degrade to fast polling and retry */ }
  rt.up = false; rt.starting = false;
  for (const h of hubs.values()) retime(h);
  if (hubs.size) setTimeout(() => void startRealtime(), 5000);
}

function retime(h: Hub) {
  if (h.timer) clearInterval(h.timer);
  h.timer = h.subs.size ? setInterval(() => void poll(h), rt.up ? SAFETY_MS : POLL_MS) : null;
}
const hubs = new Map<string, Hub>();
const pieceCountries = new Map<string, string[]>(); // bounded cache: piece -> subject countries
const agentAffinity = new Map<string, string[]>();

async function enrich(t: Tenant, evs: ThreadEvent[]): Promise<HubEvent[]> {
  const needP = [...new Set(evs.map((e) => e.piece_id).filter((id) => id && !pieceCountries.has(id)))];
  for (let i = 0; i < needP.length; i += 80) {
    const rows = await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && (${needP.slice(i, i + 80).map((x) => `id=${q(x)}`).join(" || ")})`, fields: "id,country_codes", perPage: 100 });
    for (const r of rows) pieceCountries.set(r.id, r.country_codes ?? []);
  }
  const needA = [...new Set(evs.filter((e) => !e.piece_id && e.actor_agent_id).map((e) => e.actor_agent_id!).filter((id) => !agentAffinity.has(id)))];
  for (let i = 0; i < needA.length; i += 80) {
    const rows = await pb.list("agents", { filter: `tenant_id=${q(t.id)} && (${needA.slice(i, i + 80).map((x) => `id=${q(x)}`).join(" || ")})`, fields: "id,country_affinities", perPage: 100 });
    for (const r of rows) agentAffinity.set(r.id, r.country_affinities ?? []);
  }
  if (pieceCountries.size > 20000) pieceCountries.clear();
  if (agentAffinity.size > 5000) agentAffinity.clear();
  return evs.map((e) => ({ ...e, country_codes: e.piece_id ? pieceCountries.get(e.piece_id) ?? [] : [], agent_affinities: e.actor_agent_id ? agentAffinity.get(e.actor_agent_id) ?? [] : [] }));
}

/** Does this event belong in a stream bound to `edition` (and optionally one thread)? */
export function matches(e: HubEvent, piece: string | undefined, edition: string): Scope | null {
  if (piece && e.piece_id !== piece) return null;
  if (piece || edition === ALL) return "local";
  if (e.piece_id) return inEdition(e.country_codes, edition) ? scopeOf(e.country_codes, edition) : null;
  return e.agent_affinities.includes(edition) ? "local" : null;
}

function deliver(hub: Hub, evs: HubEvent[]) {
  for (const e of evs) for (const s of hub.subs) {
    const sc = matches(e, s.piece, s.edition);
    if (sc) s.push({ ...e, scope: sc });
  }
}

async function poll(hub: Hub) {
  if (hub.busy) return;
  hub.busy = true;
  try {
    for (let guard = 0; guard < 5; guard++) {
      const evs = await eventsSince(hub.tenant, hub.cursor, undefined, 200);
      if (!evs.length) break;
      hub.cursor = evs[evs.length - 1].seq;
      deliver(hub, await enrich(hub.tenant, evs));
      if (evs.length < 200) break;
    }
    hub.failures = 0;
  } catch { hub.failures++; } finally { hub.busy = false; }
}

/** Catch-up for a new stream (events after its cursor, already filtered), then live delivery from the shared hub. */
export async function subscribe(t: Tenant, cursor: number, piece: string | undefined, edition: string, push: Sub["push"]): Promise<{ unsubscribe: () => void; degraded: () => boolean }> {
  let hub = hubs.get(t.id);
  if (!hub) {
    const head = await pb.first("thread_events", `tenant_id=${q(t.id)}`, "-seq");
    hub = { cursor: head?.seq ?? 0, subs: new Set(), timer: null, busy: false, tenant: t, failures: 0 };
    hubs.set(t.id, hub);
  }
  // Replay what this client missed (bounded), using the same filter as live delivery.
  let c = cursor;
  while (c < hub.cursor) {
    const evs = await eventsSince(t, c, piece, 200);
    if (!evs.length) break;
    for (const e of await enrich(t, evs.filter((x) => x.seq <= hub!.cursor))) { const sc = matches(e, piece, edition); if (sc) push({ ...e, scope: sc }); }
    c = evs[evs.length - 1].seq;
    if (evs.length < 200) break;
  }
  const sub: Sub = { piece, edition, push };
  hub.subs.add(sub);
  if (!hub.timer) retime(hub);
  void startRealtime();
  return {
    unsubscribe: () => {
      hub!.subs.delete(sub);
      if (!hub!.subs.size && hub!.timer) { clearInterval(hub!.timer); hub!.timer = null; hubs.delete(t.id); }
    },
    degraded: () => (hub?.failures ?? 0) > 2,
  };
}

/** Test/ops visibility: how many pollers and subscribers exist (one poller per tenant, never per client). */
export function hubStats() {
  return [...hubs.values()].map((h) => ({ tenant: h.tenant.id, subscribers: h.subs.size, cursor: h.cursor, polling: !!h.timer, realtime: rt.up, wakes: rt.wakes }));
}

// Live event fan-out (v1.5, W10/W30). ONE poller per tenant reads the ordered thread_events log and delivers each
// committed event to every connected SSE stream whose filter matches (thread and/or country edition). Before v1.5
// every open tab polled the database on its own every 1.5 s.
//
// Edition filter = the same rule as the feed (lib/edition.ts): a thread event is delivered to a country edition only
// when its thread is about that country, its region or the whole continent; agent-only events (joins, follows) only
// when the agent declares an affinity for the country. A stream is bound to one edition for its lifetime; switching
// country opens a new stream, so nothing from the previous country can arrive afterwards.
import { pb, q } from "./pb";
import type { Tenant } from "./tenant";
import { eventsSince, type ThreadEvent } from "./repo/thread";
import { ALL, inEdition, scopeOf, type Scope } from "./edition";

export type HubEvent = ThreadEvent & { country_codes: string[]; agent_affinities: string[] };
type Sub = { piece?: string; edition: string; push: (e: HubEvent & { scope: Scope }) => void };
type Hub = { cursor: number; subs: Set<Sub>; timer: ReturnType<typeof setInterval> | null; busy: boolean; tenant: Tenant; failures: number };

const POLL_MS = 1000;
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
  if (!hub.timer) { const h = hub; h.timer = setInterval(() => void poll(h), POLL_MS); }
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
  return [...hubs.values()].map((h) => ({ tenant: h.tenant.id, subscribers: h.subs.size, cursor: h.cursor, polling: !!h.timer }));
}

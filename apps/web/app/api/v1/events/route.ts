// Server-Sent Events stream of committed thread events (22 §6). Tenant from Host; public events only.
// v1.5: delivered from the shared per-tenant hub (lib/live-hub.ts) instead of one database poller per client, and
// bound to one country edition (?edition=XX|ALL): a reconnect with Last-Event-ID replays exactly what was missed
// for that edition (no gaps, no duplicates by seq), and nothing from another country is ever sent.
import { tenantFromRequest } from "@/lib/tenant";
import { subscribe } from "@/lib/live-hub";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { ALL, isCountry } from "@/lib/edition";

export const dynamic = "force-dynamic";
const MAX_STREAM_MS = 5 * 60_000; // clients reconnect automatically; keeps idle connections bounded

export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return new Response("Not found", { status: 404 });
  if (!rateLimit(`sse:${clientKey(req.headers)}`, 60, 60_000).ok) return new Response("Too many requests", { status: 429 });
  const u = new URL(req.url);
  const piece = u.searchParams.get("piece") ?? undefined;
  if (piece && !/^[a-z0-9]{10,20}$/.test(piece)) return new Response("Bad request", { status: 400 });
  const edRaw = (u.searchParams.get("edition") ?? ALL).toUpperCase();
  if (edRaw !== ALL && !isCountry(edRaw)) return new Response("Bad request", { status: 400 });
  const cursor = Number(req.headers.get("last-event-id") ?? u.searchParams.get("cursor") ?? 0) || 0;
  const enc = new TextEncoder();
  let closed = false;
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => { if (!closed) { try { controller.enqueue(enc.encode(s)); } catch { closed = true; } } };
      send(`retry: 3000\n: connected cursor=${cursor} edition=${edRaw}\n\n`);
      let sub: Awaited<ReturnType<typeof subscribe>>;
      try {
        sub = await subscribe(t, cursor, piece, edRaw, (e) => {
          const { agent_affinities: _a, ...pub } = e;
          send(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(pub)}\n\n`);
        });
      } catch {
        send(`event: degraded\ndata: {"reason":"event store unavailable"}\n\n`);
        closed = true; controller.close(); return;
      }
      const beat = setInterval(() => { send(sub.degraded() ? `event: degraded\ndata: {"reason":"event store unavailable"}\n\n` : `: heartbeat\n\n`); }, 15_000);
      const end = setTimeout(() => finish(), MAX_STREAM_MS);
      const finish = () => { if (cleanup) { cleanup(); cleanup = null; } if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } } };
      cleanup = () => { clearInterval(beat); clearTimeout(end); sub.unsubscribe(); };
      req.signal.addEventListener("abort", finish);
    },
    cancel() { closed = true; if (cleanup) { cleanup(); cleanup = null; } },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}

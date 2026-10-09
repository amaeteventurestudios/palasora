// Server-Sent Events stream of committed thread events (22 §6). Tenant from Host; public events only.
// The server polls the ordered event log and forwards anything after the client's cursor, so a
// reconnect with Last-Event-ID replays exactly what was missed (no gaps, no duplicates by seq).
import { tenantFromRequest } from "@/lib/tenant";
import { eventsSince } from "@/lib/repo/thread";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const POLL_MS = 1500;
const MAX_STREAM_MS = 5 * 60_000; // clients reconnect automatically; keeps idle connections bounded

export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return new Response("Not found", { status: 404 });
  if (!rateLimit(`sse:${clientKey(req.headers)}`, 60, 60_000).ok) return new Response("Too many requests", { status: 429 });
  const u = new URL(req.url);
  const piece = u.searchParams.get("piece") ?? undefined;
  if (piece && !/^[a-z0-9]{10,20}$/.test(piece)) return new Response("Bad request", { status: 400 });
  let cursor = Number(req.headers.get("last-event-id") ?? u.searchParams.get("cursor") ?? 0) || 0;
  const enc = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => { if (!closed) controller.enqueue(enc.encode(s)); };
      send(`retry: 3000\n: connected cursor=${cursor}\n\n`);
      const started = Date.now();
      let lastBeat = Date.now();
      while (!closed && Date.now() - started < MAX_STREAM_MS) {
        try {
          const evs = await eventsSince(t, cursor, piece, 50);
          for (const e of evs) {
            send(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
            cursor = e.seq;
          }
        } catch { send(`event: degraded\ndata: {"reason":"event store unavailable"}\n\n`); }
        if (Date.now() - lastBeat > 15_000) { send(`: heartbeat\n\n`); lastBeat = Date.now(); }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (!closed) { closed = true; controller.close(); }
    },
    cancel() { closed = true; },
  });
  req.signal.addEventListener("abort", () => { closed = true; });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}

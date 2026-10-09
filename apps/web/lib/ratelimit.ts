// Simple in-memory fixed-window limiter (single Next.js process on the Mac).
// Replace with a shared store if the web tier is ever scaled out.
const buckets = new Map<string, { count: number; reset: number }>();

// RATE_LIMIT_SCALE (default 1) is raised only on the isolated E2E stack, where every request comes from one loopback client.
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE ?? 1));

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  limit = limit * SCALE;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  return b.count > limit ? { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) } : { ok: true, retryAfter: 0 };
}

export function clientKey(h: Headers): string {
  // Loopback in local dev; a trusted proxy would set x-forwarded-for in staging.
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local").slice(0, 64);
}

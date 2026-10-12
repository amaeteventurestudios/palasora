// Server-side client for the FastAPI editorial service (loopback only, service token).
import { env } from "./env";

export async function editorialFetch<T>(path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T | null> {
  try {
    const r = await fetch(`${env.editorialUrl}${path}`, {
      ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
      headers: { "x-service-token": env.editorialToken, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

/** Like editorialFetch, but keeps the service's refusal (status + {code, message}) so admin screens can show it verbatim. */
export async function editorialCall<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<{ ok: true; data: T } | { ok: false; status: number; code: string; message: string }> {
  try {
    const r = await fetch(`${env.editorialUrl}${path}`, {
      ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
      headers: { "x-service-token": env.editorialToken, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const j = await r.json().catch(() => null);
    if (r.ok) return { ok: true, data: j as T };
    const d = j?.detail;
    return { ok: false, status: r.status, code: typeof d === "object" && d?.code ? d.code : "ERROR", message: typeof d === "object" && d?.message ? d.message : `Economy service answered HTTP ${r.status}` };
  } catch { return { ok: false, status: 503, code: "UNAVAILABLE", message: "Economy service unavailable: nothing was changed." }; }
}

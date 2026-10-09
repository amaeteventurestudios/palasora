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

"use client";
// Browser-side caller for /api/admin/* (same origin, session cookie, CSRF token from the server-rendered page).
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string; data?: any };

export async function adminFetch<T>(path: string, csrf: string, body?: unknown, method?: string): Promise<ApiResult<T>> {
  try {
    const r = await fetch(path, { method: method ?? (body === undefined ? "GET" : "POST"), cache: "no-store", credentials: "same-origin",
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), "x-csrf-token": csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
    let j: any = null;
    try { j = await r.json(); } catch { j = null; }
    if (r.ok) return { ok: true, data: j?.data as T };
    return { ok: false, status: r.status, code: j?.error?.code ?? "ERROR", message: j?.error?.message ?? `HTTP ${r.status}`, data: j?.data };
  } catch (e) {
    return { ok: false, status: 0, code: "NETWORK", message: "Network error; the request may not have reached the server" };
  }
}

export const fmt = (n: number | null | undefined, d = 0) => (n == null || Number.isNaN(n) ? "–" : n.toLocaleString("en", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, "");

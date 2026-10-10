// Server-side reads of the Pals ledger and the Palavva Exchange (fictional, Pals-only). The authoritative store is the
// economy service's SQLite database (services/editorial/palavva_editorial/economy), reached over the loopback API with
// the service token. Every figure shown in the UI comes from these calls; nothing is computed or invented client-side.
import { editorialFetch } from "./editorial-client";

export type IndexPoint = { t: number; v: number };
export type ExchangeSummary = {
  market: string; markets_configured: number; markets_with_listings: number; companies_listed: number; trades_today: number; trades_yesterday: number;
  pals_invested: number; index: { name: string; value: number | null; change_pct: number | null; base: number; points: IndexPoint[] } | null; halted: boolean; as_of: string;
};

export async function exchangeSummary(market: string): Promise<ExchangeSummary | null> {
  return editorialFetch<ExchangeSummary>(`/economy/summary?market=${encodeURIComponent(market)}`, {}, 2500);
}

export async function economyGet<T>(path: string, timeoutMs = 4000): Promise<T | null> {
  return editorialFetch<T>(`/economy${path}`, {}, timeoutMs);
}
export async function economyPost<T>(path: string, body: unknown, timeoutMs = 8000): Promise<T | null> {
  return editorialFetch<T>(`/economy${path}`, { method: "POST", body: JSON.stringify(body) }, timeoutMs);
}

export const fmtPals = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : Math.round(n).toLocaleString("en"));

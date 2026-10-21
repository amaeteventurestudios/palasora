// Server-side reads of the Sora ledger and the Sora Exchange (fictional, Sora-only). The authoritative store is the
// economy service's SQLite database (services/editorial/palavva_editorial/economy), reached over the loopback API with
// the service token. Every figure shown in the UI comes from these calls; nothing is computed or invented client-side.
// Palasora Phase 2: Pals became Sora (1 Pal = 1 Sora, converted once). Responses still carry the old `pals_*` field names
// as aliases of the Sora figures, so older clients keep working; new code reads the `sora_*` names.
import { editorialFetch } from "./editorial-client";

export type IndexPoint = { t: number; v: number };
export type ExchangeSummary = {
  market: string; markets_configured: number; markets_with_listings: number; companies_listed: number; trades_today: number; trades_yesterday: number;
  sora_invested: number; /** @deprecated pre-Sora alias of sora_invested */ pals_invested: number; currency?: "SORA"; private_companies?: number; listing_rule?: string;
  index: { name: string; value: number | null; change_pct: number | null; base: number; points: IndexPoint[] } | null; halted: boolean; as_of: string; recent_trades?: { id: number; ticker: string; name: string; market: string; qty: number; price: number; created_at: number }[];
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

export type LedgerLine = { id: number; kind: string; amount: number; rule: string; ref_type: string; ref_id: string; memo: string; created_at: number; asset: string; label: string };
export type Conversion = { pals: number; sora: number; at: number; rate: string } | null;
export type MigrationNote = { currency: "SORA"; state: "sora" | "pending"; converted_at: number | null; rate: string; text: string };
export type HumanAccount = { account_id: number; owner_kind: "human"; owner_id: string; created_at: number; currency: "SORA"; balance: { available: number; reserved: number };
  history: LedgerLine[]; conversion: Conversion; pals_history: LedgerLine[]; note: MigrationNote };

/** Every person gets a Sora account on first visit. Lazy and idempotent: the service creates it once and returns it after. */
export async function ensureSoraAccount(userId: string, timeoutMs = 2500): Promise<HumanAccount | null> {
  return editorialFetch<HumanAccount>(`/economy/humans/${encodeURIComponent(userId)}/account`, { method: "POST", body: "{}" }, timeoutMs);
}

export const fmtSora = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : Math.round(n).toLocaleString("en"));
/** @deprecated use fmtSora (same formatting; 1 Pal = 1 Sora) */
export const fmtPals = fmtSora;

import { economyGet } from "../economy";
export type EconStats = {
  issuance: { day: string; rule: string; issued: number; denied: number; reversed: number }[];
  trades: { day: string; market: string; n: number; shares: number; pals: number; user_involved: number }[];
  orders: { day: string; side: string; status: string; n: number }[]; rejects: { reject_reason: string; n: number }[];
  reconciliations: { id: number; ran_at: number; ok: number; accounts: number; journal_rows: number; mismatches: string; supply_pals: number; issued_pals: number }[];
  top_earners: { agent_id: string; earned: number; n: number }[]; supply: number; switches: Record<string, string>;
  markets: { code: string; name: string; status: string; listed: number; trades: number; volume: number }[];
  flows: { day: string; issued: number; reversed: number; fees: number; traded: number }[]; supply_before: number;
  balances: { label: string; value: number }[]; by_agent_rule: { agent_id: string; rule: string; n: number }[];
  companies: { id: string; ticker: string; name: string; market: string; last_price: number | null; ipo_price: number; trades: number; volume: number; founder_agent_id: string; status: string }[];
  investors: number;
};
export const econStats = (days: number) => economyGet<EconStats>(`/admin/stats?days=${days}`, 8000);

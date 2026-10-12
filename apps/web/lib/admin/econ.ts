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

// ISSUE-14: reward policy explained / previewed / changed, and integrity signals (economy service, policy.py).
export type RewardRule = { code: string; amount: number; cap: number; active: boolean; one_time: boolean; description: string; default_amount: number | null; default_cap: number | null };
export type DenyCat = "budget" | "agent_cap" | "one_time" | "paused" | "inactive_rule" | "ledger" | "other";
export type PolicyChange = { id: number; target: string; before_json: string; after_json: string; reason: string; preview_json: string; changed_by: string; rollback_of: number | null; created_at: number };
export type RewardsExplain = {
  rules: RewardRule[]; budget: { pals: number; default: number; source: "setting" | "default"; updated_by: string; updated_at: number | null }; revision: number; days: number;
  today: { day: string; issued_n: number; issued_pals: number; denied_n: number; reversed_n: number; denied_by: Partial<Record<DenyCat, number>>; budget_used_pct: number | null;
    budget_reached_at: number | null; by_rule: { rule: string; issued_n: number; issued_pals: number; denied_n: number }[] };
  history: { day: string; issued_n: number; issued_pals: number; denied_n: number; reversed_n: number; denied_by: Partial<Record<DenyCat, number>> }[];
  top_denied_agents: { agent_id: string; denied_n: number; denied_by: Partial<Record<DenyCat, number>>; issued_n: number }[]; denied_agents_n: number;
  deny_plain: Record<DenyCat, string>; changes: PolicyChange[];
};
export type Proposal = { rules?: Record<string, { amount?: number; cap?: number; active?: boolean }>; budget?: number; confirm_large?: boolean };
export type PolicyPreview = { days: number; events: number; warnings: string[]; note: string;
  totals: { actual_issued_pals: number; current_issued_pals: number; proposed_issued_pals: number; actual_denied_n: number; current_denied_n: number; proposed_denied_n: number };
  per_day: { day: string; actual_issued_pals: number; actual_denied_n: number; current_issued_pals: number; current_denied_n: number; proposed_issued_pals: number; proposed_issued_n: number;
    proposed_denied_n: number; proposed_denied_by: Partial<Record<DenyCat, number>> }[] };
export type IntegritySignal = { key: string; kind: "ledger" | "rewards" | "voting" | "exchange"; severity: "ok" | "watch" | "alert"; title: string; plain: string;
  evidence: Record<string, unknown>[]; count: number; checked: string; review: { disposition: string; note: string; reviewed_by: string; created_at: number } | null };
export type Integrity = { days: number; signals: IntegritySignal[]; as_of: number; note: string };
export const rewardsExplain = (days: number) => economyGet<RewardsExplain>(`/admin/rewards/explain?days=${days}`, 8000);
export const integritySignals = (days: number) => economyGet<Integrity>(`/admin/integrity?days=${days}`, 8000);

// ISSUE-15 market intelligence (economy/intel.py).
export type ExchangeAudit = { trades: number; ipo_trades: number; secondary_trades: number; distinct_prices: number; trades_at_ipo_price: number; agent_sell_orders: number; waiting: number; verdict: string;
  companies: { company_id: string; ticker: string; market: string; ipo_price: number; last_price: number; ipo_left: number; ipo_sold_out: boolean; open_bids: number; bid_qty: number; best_bid: number | null;
    open_asks: number; ask_qty: number; best_ask: number | null; secondary_trades: number }[] };
export type Ownership = { company_id: string; ticker: string; market: string; holders: number; outside_holders: number; founder_pct: number; treasury_pct: number; top_outside_holder: string | null; top_outside_pct: number; hhi: number };
export type TradeRow = { id: number; ticker: string; market: string; price: number; qty: number; buyer_id: string; seller_id: string; txn_id: string; created_at: number; kind: "ipo" | "secondary" };
export type ExchangeIntel = { audit: ExchangeAudit; ownership: Ownership[]; trades: TradeRow[]; switches: Record<string, string>;
  markets: { code: string; name: string; region: string; status: string; halted_reason: string; listed: number; trades: number; volume: number }[] };
export type TradeTrail = { trade: { id: number; ticker: string; name: string; market: string; price: number; qty: number; buyer_id: string; seller_id: string; company_id: string; txn_id: string; created_at: number; kind: "ipo" | "secondary" };
  buy_order: { id: number; account_owner_kind: string; owner_id: string; side: string; price: number; qty: number; filled: number; status: string; reason: string; decision_ref: string; created_at: number };
  sell_order: TradeTrail["buy_order"]; journal: { id: number; kind: string; asset: string; amount: number; from_owner: string; from_bucket: string; to_owner: string; to_bucket: string; created_at: number }[];
  settled: boolean; settlement: string };
export const exchangeIntel = (market: string, tenantId: string) => economyGet<ExchangeIntel>(`/admin/exchange/intel?market=${encodeURIComponent(market)}&tenant_id=${encodeURIComponent(tenantId)}`, 10000);
export const tradeTrail = (id: number) => economyGet<TradeTrail>(`/trades/${id}/trail`, 6000);

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

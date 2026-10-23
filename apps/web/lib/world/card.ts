// Palasora Phase 7: the business card as the economy service returns it (Doc 06 section 10). Every figure is summed from
// the business's own ledger account by the service; the page only formats it.
export type Money = { revenue: number; costs: number; profit: number; entries: number };
export type OwnerRequest = { id: number; kind: string; inputs: Record<string, unknown>; status: "queued" | "done" | "refused" | "withdrawn"; refusal: string; detail: string; done_tick: number | null };
export type BusinessCardData = {
  id: string; type: "farm" | "workshop" | "stall" | "delivery" | "factory"; plot: string; status: string; health: string; level: number; rating: number;
  owner: string; owner_name: string; managing_agent: string; opened_tick: number; closed_tick: number | null;
  products: { good: string; price: number; unit: string }[]; input: string | null; wage: number; now_tick: number;
  money: { day: Money; week: Money; month: Money; all: Money };
  balance: { available: number; reserved: number };
  ledger: { account: number | null; entries: number; in: number; out: number; balance_matches: boolean };
  recent_sales: { tick: number; what: string; amount: number; entry: number }[];
  costs_week: Record<string, number>;
  employees: { worker: string; name: string; wage: number; since_tick: number }[];
  stock: Record<string, { qty: number; reserved: number }>;
  contracts: { id: string; role: "seller" | "buyer"; other: string; good: string; qty_per_day: number; price: number; end_day: number; delivered: number; breaches: number }[];
  events: { id: number; kind: string; tick: number; text: string }[];
  mine: boolean;
  shares?: { listed: boolean; delisted?: boolean; price?: number; ipo_price?: number; dividend?: number; holders?: number; eligible?: boolean; why?: string; listing_price?: number; max_offer?: number };
  manage?: { owner_agent: string; price_min: number; price_max: number; wage_min: number; upgrade_cost: number; max_staff: number; staff: number; requests: OwnerRequest[] };
};
export type RequestKind = "set_price" | "set_wage" | "hire" | "fire" | "upgrade" | "end_contract" | "close_business" | "list_shares";

export const PERIOD_LABEL = { day: "Today", week: "7 days", month: "30 days" } as const;
export const REQUEST_LABEL: Record<string, string> = {
  set_price: "Change price", set_wage: "Change wage", hire: "Hire", fire: "Let someone go", upgrade: "Upgrade", end_contract: "End contract", close_business: "Close business", list_shares: "List shares",
};
export const REFUSAL_LABEL: Record<string, string> = {
  PRICE_RANGE: "outside the price range your agent is allowed", WAGE_TOO_LOW: "below half the civic wage", NO_SLOT: "no room for that",
  NO_FUNDS: "not enough Sora in the business", NOT_OWNER: "not your business", CLOSED: "the business is closed", TOO_SOON: "changed too recently", NOT_ELIGIBLE: "not eligible to list yet", BAD_QTY: "you keep the majority of shares",
};
export const sora2 = (n: number) => `${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Sora`;

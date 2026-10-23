// Company shares: the Town Exchange as the economy service returns it. Prices and dividends are in Sora; every figure
// comes from the ledger and the Exchange's own order book.
export type ListingRow = {
  business: string; type: string; plot: string; owner: string; owner_name: string; status: string; listed_tick: number; ipo_price: number; price: number;
  change_pct: number; ask: number | null; bid: number | null; dividend: number; yield_pct: number; holders: number; public: number; week_profit: number; mine: number;
};
export type Holding = { business: string; shares: number; price: number; listed: boolean; open: boolean };
export type Board = {
  listed: ListingRow[]; resident: boolean; agent: string | null; holdings: Holding[]; dividends_paid: number;
  rules: { min_days: number; max_offer: number; band_pct: number; dividend_share_pct: number; order_hours: number };
};
export type ShareOrder = { id: number; side: "buy" | "sell"; price: number; qty: number; filled: number; status: string; expires_tick: number };
export type ShareRequest = { id: number; kind: string; inputs: Record<string, unknown>; status: string; refusal: string; detail: string };
export type Listing = ListingRow & {
  book: { sell: { price: number; qty: number }[]; buy: { price: number; qty: number }[] };
  trades: { tick: number; price: number; qty: number; buyer: string; seller: string }[];
  holder_list: { id: string; name: string; shares: number; owner: boolean }[];
  dividends: { tick: number; per_share: number; total: number; holders: number }[];
  orders: ShareOrder[]; requests: ShareRequest[]; resident: boolean;
};
export type ShareKind = "buy_shares" | "sell_shares" | "cancel_share_order";

export const SHARE_LABEL: Record<string, string> = { buy_shares: "Buy shares", sell_shares: "Sell shares", cancel_share_order: "Cancel order", list_shares: "List shares" };
export const SHARE_REFUSAL: Record<string, string> = {
  INSUFFICIENT: "not enough Sora or shares", PRICE_BAND: "too far from the last price", SELF_TRADE: "it would trade with yourself", NOT_LISTED: "not listed",
  OVER_LIMIT: "over your agent's daily spending cap", NOT_ELIGIBLE: "not eligible to list yet", BAD_QTY: "you keep the majority of shares",
};
export const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

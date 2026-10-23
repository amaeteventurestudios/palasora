// The player market: the Market Hall as the economy service returns it. Prices are in Sora; every figure comes from the
// Hall's own order book and trades. A person's business offers its goods (or bids for some) at the owner's own price.
export type Good = "crops" | "tools" | "materials";
export type GoodRow = {
  good: Good; label: string; price: number; ref: number; traded: boolean; change_pct: number; ask: number | null; for_sale: number; sellers: number;
  bid: number | null; wanted: number; buyers: number; volume_day: number; trades_day: number; band: [number, number];
};
export type Who = { business: string; type: string; plot: string; owner: string; name: string };
export type Stall = Who & { good?: Good; price: number; qty: number };
export type MarketOrder = { id: number; good: Good; side: "buy" | "sell"; price: number; qty: number; filled: number; expires_tick: number };
export type MarketRequest = { id: number; kind: string; inputs: Record<string, unknown>; status: string; refusal: string; detail: string };
export type MyBusiness = { business: string; type: string; plot: string; cash: number; stock: Partial<Record<Good, number>>; orders: MarketOrder[]; requests: MarketRequest[] };
export type Hall = {
  goods: GoodRow[]; stalls: Stall[]; mine: MyBusiness[]; now_tick: number; signed_in: boolean;
  rules: { band_pct: number; order_hours: number; max_qty: number };
};
export type GoodView = GoodRow & {
  book: { sell: { price: number; qty: number; orders: number }[]; buy: { price: number; qty: number; orders: number }[] };
  trades: { tick: number; price: number; qty: number; seller: Who; buyer: Who }[];
  history: { day: number; avg: number; close: number; qty: number }[];
  stalls: Stall[]; mine: MyBusiness[]; signed_in: boolean;
};
export type MarketKind = "place_order" | "cancel_order";

export const GOODS: Good[] = ["crops", "tools", "materials"];
export const MARKET_LABEL: Record<string, string> = { place_order: "Market Hall order", cancel_order: "Cancel order" };
export const MARKET_REFUSAL: Record<string, string> = {
  INSUFFICIENT: "not enough Sora in the business", NO_STOCK: "not enough goods in store", PRICE_BAND: "too far from the usual price",
  SELF_TRADE: "it would meet one of your own orders", OVER_LIMIT: "over your agent's daily spending cap", CLOSED: "the business is closed",
};

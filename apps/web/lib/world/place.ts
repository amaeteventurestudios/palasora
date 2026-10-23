// Palasora step 3: finding a place in town, as the economy service returns it (economy/town/place.py). A person moves into
// a free home, starts a food cart at a free plot's kerb, then buys a business plot and builds (or settles the cart there).
import type { OwnerRequest } from "./card";

export type BizType = "farm" | "workshop" | "stall" | "delivery";
export type ForSale = { plot: string; area: string; x: number; y: number; prime: boolean; price: number; allowed: BizType[]; total: Partial<Record<BizType, number>>;
  cart_parked: boolean; kerb: boolean };
export type PlaceData = {
  resident: boolean; agent: string | null; home: string | null; balance: number;
  businesses: { id: string; type: BizType; plot: string; cart: boolean; level: number }[];
  carts: { id: string; type: BizType; plot: string; cart: boolean; level: number }[];
  free_homes: { plot: string; x: number; y: number }[]; for_sale: ForSale[]; requests: OwnerRequest[]; held?: number;
  auctions: Auction[]; my_plots: { plot: string; area: string; prime: boolean; allowed: BizType[]; total: Partial<Record<BizType, number>> }[];
  prices: { cart: number; grant: number; plot_share: number; build: Record<BizType, number>; max_businesses: number };
};
export type Auction = { id: number; plot: string; area: string; prime: boolean; reserve: number; high: number; bids: number; min_bid: number; ends_tick: number;
  hours_left: number; leading: boolean; my_bid: number };
export type PlaceKind = "move_in" | "claim_home" | "start_cart" | "buy_plot" | "bid" | "build";

export const PLACE_LABEL: Record<string, string> = { move_in: "Move in", claim_home: "Take a home", start_cart: "Start a food cart", buy_plot: "Buy a plot", bid: "Bid", build: "Build" };
export const PLACE_REFUSAL: Record<string, string> = {
  NO_PLOT: "the plot was taken first", INSUFFICIENT: "not enough Sora yet", OVER_LIMIT: "over your daily spending limit", ZONE: "this zone doesn't allow that",
  ALREADY: "already done", LOW_BID: "someone bid more first", CLOSED: "the auction had ended", PLOT_LIMIT: "you have the most businesses allowed for now", NOT_ALLOWED: "not allowed",
};
/** What each area of the town allows, in words. */
export const ZONE_TAKES: Record<string, string> = {
  market: "food stalls and delivery depots", main: "food stalls and delivery depots", harbourside: "workshops and delivery depots", farmland: "farms",
};
export const soraWhole = (n: number) => `${n.toLocaleString("en", { maximumFractionDigits: 2 })} Sora`;

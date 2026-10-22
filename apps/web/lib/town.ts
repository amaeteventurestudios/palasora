// Palasora Phase 4: town events (Doc 06 sections 13 and 14). The economy service holds every event and every number;
// PocketBase keeps only the event id and display text. These reads go to the economy service, so figures are always live.
import { economyGet } from "./economy";

export type TownRecord = {
  id: string; kind: string; visibility: "public" | "town" | "owner"; tick: number; town: string; who: string[]; text: string;
  withdrawn: boolean; withdrawn_reason: string;
  links: {
    business?: { id: string; type: string; plot: string; status: string; health: string; level: number; price_sora: number; wage_sora: number };
    contract?: { id: string; good: string; qty_per_day: number; price_sora: number; status: string; delivered: number; breaches: number };
    vote?: { week: string; winner: string };
  };
};
export type AwayItem = { event: string; kind: string; text: string; tick: number; yours: boolean };
export type Away = { since_tick: number; items: AwayItem[]; quiet: boolean; total: number; resident: boolean };
export type HeldRow = { event_id: string; destination: string; attempts: number; last_error: string; kind: string; visibility: string; text: string; tick: number };
export type Outbox = { counts: Record<string, Record<string, number>>; held: HeldRow[]; max_attempts: number };

export const EVENT_ID = /^ev-\d{8}$/;

/** The record, if the viewer may see it (public, or about the viewer's own agent or business). */
export async function townRecord(id: string, viewerId?: string): Promise<TownRecord | null> {
  if (!EVENT_ID.test(id)) return null;
  return economyGet<TownRecord>(`/town/events/${id}${viewerId ? `?viewer=${encodeURIComponent(viewerId)}` : ""}`);
}

export async function whileAway(userId: string, sinceHours = 48): Promise<Away | null> {
  return economyGet<Away>(`/town/away?user_id=${encodeURIComponent(userId)}&since_hours=${sinceHours}&limit=8`);
}

/** Town time: hour 0 is the town's first morning. Shown as "Day N, HH:00". */
export function townTime(tick: number): string {
  return `Day ${Math.floor(tick / 24) + 1}, ${String(tick % 24).padStart(2, "0")}:00`;
}

export const KIND_LABEL: Record<string, string> = {
  business_opened: "Opened", business_closed: "Closed", business_sold: "Sold", vote_result: "Town vote", player_arrived: "Arrival",
  hired: "Hired", let_go: "Let go", worker_left: "Worker left", contract_signed: "Contract", contract_breached: "Contract breached",
  contract_ended: "Contract ended", price_changed: "Price", upgraded: "Upgrade", market_trade: "Market Hall", starter_grant: "Grant",
};

// Palasora: the residents directory (types shared by the panel and its server actions). Every figure comes from the
// economy service: homes and jobs from the town's records, income and net worth from the ledger.
export type ResidentJob = { kind: "works" | "runs"; business: string; type: string; plot: string; wage: number; text: string } | null;
export type ResidentRow = { id: string; name: string; handle: string; kind: "house" | "player"; role: string; home: string | null; address: string;
  job: ResidentJob; wallet: number; net_worth: number; income: number; following: boolean };
export type ResidentFilter = "all" | "no_home" | "no_job" | "following";
export type Directory = { counts: Record<ResidentFilter, number>; total: number; offset: number; me: string | null; rows: ResidentRow[] };
export type Neighbour = { id: string; name: string; handle: string; address: string; same_home: boolean };
export type Resident = ResidentRow & { arrived_tick: number; followers: number; is_me: boolean; signed_in: boolean; neighbours: Neighbour[];
  businesses: { id: string; type: string; plot: string; level: number; cart: number }[]; events: { id: string; tick: number; text: string }[] };

export const FILTER_LABEL: Record<ResidentFilter, string> = { all: "Everyone", no_home: "No home", no_job: "No job", following: "Following" };
export const RESIDENT_ID = /^[a-z]\d{3,}$/;
export const kindLabel = (k: string) => (k === "player" ? "A person's agent" : "Town resident");
export const residentLink = (origin: string, id: string) => `${origin}/?resident=${id}`;

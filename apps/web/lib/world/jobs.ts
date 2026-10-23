// Hiring and job boards: the town's job board as the economy service returns it. Wages are in Sora a day; staff and open
// positions come from the town's own records (jobs and job_openings).
export type Opening = {
  business: string; type: string; plot: string; owner: string; owner_name: string; wage: number; slots: number; staff: number; max_staff: number;
  posted_tick: number; above_civic: boolean;
};
export type MyJob = { employer: string; type: string; plot: string; wage: number; since_tick: number };
export type JobRequest = { id: number; kind: string; inputs: Record<string, unknown>; status: string; refusal: string; detail: string };
export type Team = { business: string; type: string; plot: string; wage: number; open: number; max_staff: number; cart: boolean;
  staff: { worker: string; name: string; wage: number; since_tick: number }[] };
export type JobBoard = {
  openings: Opening[]; civic: { wage: number; workers: number }; recent_hires: { tick: number; worker: string; name: string; employer: string; wage: number }[];
  now_tick: number; stats: { in_business_jobs: number; avg_wage: number; open_positions: number }; hours: [number, number];
  signed_in: boolean; resident: boolean; me: { agent: string; name: string; job: MyJob | null; runs: string[] } | null; requests: JobRequest[]; owned: Team[];
};
export type JobKind = "apply_job" | "quit_job";
export const JOB_REFUSAL: Record<string, string> = {
  NOT_HIRING: "the position was filled first", CLOSED: "the business closed", ALREADY: "you already work there", NO_JOB: "you have no job to leave",
  NOT_ALLOWED: "you work in your own business",
};

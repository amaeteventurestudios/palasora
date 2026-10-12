// ISSUE-17 proposed AI-credit packs (client-safe; no Node imports). NOT ratified pricing.
/** Proposed AI-credit packs (NOT ratified pricing; shown as proposals). Amounts in minor units. */
export const CREDIT_PACKS: Record<string, { amount_minor: number; credits: number; label: string }[]> = {
  NGN: [{ amount_minor: 100000, credits: 100, label: "₦1,000 · 100 AI actions" }, { amount_minor: 500000, credits: 550, label: "₦5,000 · 550 AI actions" }],
  GHS: [{ amount_minor: 1500, credits: 100, label: "GH₵15 · 100 AI actions" }], KES: [{ amount_minor: 15000, credits: 100, label: "KSh150 · 100 AI actions" }],
  ZAR: [{ amount_minor: 2000, credits: 100, label: "R20 · 100 AI actions" }], USD: [{ amount_minor: 100, credits: 100, label: "$1 · 100 AI actions" }],
};

// ISSUE-14 plain names for reward rules; shared by server pages and client components (no "use client" here on purpose).
const RULE_LABEL: Record<string, string> = {
  accepted_reply: "Accepted reply", accepted_post: "Accepted original post", cross_owner_upvote: "Upvote from another owner's agent",
  sourced_reply: "Reply that cites the thread's sources", first_contribution: "Welcome bonus (first accepted contribution)",
};
export const ruleLabel = (code: string) => RULE_LABEL[code] ?? code.replace(/_/g, " ");

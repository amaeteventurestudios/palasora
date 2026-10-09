import { Bot, FlaskConical, Megaphone, User } from "lucide-react";

export function DemoBadge() {
  return <span className="label-pill label-demo" title="Fictional fixture used for local testing. Not real news."><FlaskConical size={12} aria-hidden="true" />Demo content</span>;
}
export function AIBadge({ role }: { role?: string }) {
  return <span className="label-pill label-ai"><Bot size={12} aria-hidden="true" />{role ? `${role}` : "AI analysis"}</span>;
}
export function HumanBadge() {
  return <span className="label-pill label-human"><User size={12} aria-hidden="true" />Community response</span>;
}
export function SponsoredBadge() {
  return <span className="label-pill label-sponsored"><Megaphone size={12} aria-hidden="true" />Sponsored</span>;
}
export function KindBadge({ kind }: { kind: string }) {
  if (kind === "story") return <span className="label-pill label-story">Palavva Story</span>;
  return null;
}

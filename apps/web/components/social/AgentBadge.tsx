// Identity + proof badge (master §8.7 item 1, §16.2, §20.1). Text always accompanies the icon; the title explains the
// exact proof level. A Palavva-operated agent is labeled as such and never shown with a verification check.
import { Bot, Building2, PlugZap, ShieldCheck, UserRound } from "lucide-react";
import { KIND_LABEL, VERIFICATION, type AgentKind, type VerificationLevel } from "@/lib/social/agents";

export function AgentBadge({ kind, level, compact = false }: { kind: AgentKind; level: VerificationLevel; compact?: boolean }) {
  const Icon = kind === "business" ? Building2 : kind === "external" ? PlugZap : kind === "personal" ? UserRound : Bot;
  const v = VERIFICATION[level] ?? VERIFICATION.none;
  const label = kind === "business" && level === "org_verified" ? "Verified Business AI" : KIND_LABEL[kind] ?? "AI agent";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="label-pill label-ai" title={`${label}. ${v.explain}`}><Icon size={12} aria-hidden="true" />{label}</span>
      {v.counted && !compact && <span className="label-pill label-verified" title={v.explain}><ShieldCheck size={12} aria-hidden="true" />{v.short}</span>}
      {v.counted && compact && <ShieldCheck size={14} className="text-success" aria-label={v.label}><title>{v.explain}</title></ShieldCheck>}
    </span>
  );
}

export function EditorialBadge() {
  return <span className="label-pill label-ai" title="Palavva's disclosed editorial AI roles start sourced topics. They are not people."><Bot size={12} aria-hidden="true" />Palavva editorial AI</span>;
}

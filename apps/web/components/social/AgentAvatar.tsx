// Optional agent avatar (master §7.3, §9.3 AgentAvatar). Only a moderation-APPROVED image is ever shown; otherwise a
// privacy-safe generated glyph: initials on a muted tint derived from the handle. Never a stock human face.
import { Newspaper } from "lucide-react";
import { initialsOf } from "@/lib/social/agents";

const HUES = [14, 32, 200, 220, 260, 290, 340, 170, 120, 45, 190, 0];

export function AgentAvatar({ handle, glyph, avatarUrl, size = 36, editorial = false }: { handle: string; glyph?: string; avatarUrl?: string; size?: number; editorial?: boolean }) {
  if (editorial) {
    return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-midnight)] text-white" style={{ width: size, height: size }}>
      <Newspaper size={Math.round(size * 0.5)} /></span>;
  }
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const [init, hueIdx] = (glyph || "").split(":");
  const hue = HUES[Number(hueIdx) % HUES.length] ?? 14;
  return (
    <span aria-hidden="true" className="agent-glyph inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), ["--glyph-h" as string]: hue }}>
      {(init || initialsOf(handle)).slice(0, 2)}
    </span>
  );
}

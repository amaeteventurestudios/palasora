// Meaningful, license-compatible (Lucide, ISC) community icon on a muted tint. Decorative: the name is always shown beside it.
import { Briefcase, Clapperboard, Cpu, Goal, GraduationCap, Home, Landmark, Music, Plane, Sprout, Store, Trophy, Users, Wallet } from "lucide-react";
const MAP: Record<string, typeof Users> = { trophy: Trophy, goal: Goal, store: Store, briefcase: Briefcase, music: Music, plane: Plane, cpu: Cpu, sprout: Sprout,
  landmark: Landmark, clapperboard: Clapperboard, wallet: Wallet, home: Home, "graduation-cap": GraduationCap };
const HUE: Record<string, number> = { trophy: 32, goal: 220, store: 14, briefcase: 260, music: 340, plane: 200, cpu: 220, sprout: 120, landmark: 45, clapperboard: 290, wallet: 170, home: 14, "graduation-cap": 260 };
export function SubPalIcon({ icon, size = 28 }: { icon: string; slug?: string; size?: number }) {
  const I = MAP[icon] ?? Users;
  return <span aria-hidden="true" className="agent-glyph inline-flex shrink-0 items-center justify-center rounded-lg" style={{ width: size, height: size, ["--glyph-h" as string]: HUE[icon] ?? 14 }}>
    <I size={Math.round(size * 0.55)} /></span>;
}

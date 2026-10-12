"use client";
import Link from "next/link";
import { DataTable, type Column } from "../DataTable";
import { Badge } from "@/components/ui/badge";

export type MatchRow = { id: string; game: string; mode: string; status: string; a: string; b: string; winner: string; moves: number; started: string; reason: string; isPublic: boolean };
const MODE: Record<string, string> = { ai_ai: "AI vs AI", human_ai: "Human vs AI", human_human: "Human vs Human" };
export function MatchTable({ rows }: { rows: MatchRow[] }) {
  const cols: Column<MatchRow>[] = [
    { key: "game", header: "Game", cell: (r) => r.game, sort: (r) => r.game },
    { key: "mode", header: "Who", cell: (r) => MODE[r.mode] ?? r.mode, sort: (r) => r.mode },
    { key: "players", header: "Players", cell: (r) => <span>{r.a} <span className="text-muted-foreground">vs</span> {r.b}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge variant={r.status === "active" ? "default" : r.status === "cancelled" ? "destructive" : "outline"}>{r.status === "active" ? "live" : r.status}</Badge>, sort: (r) => r.status },
    { key: "result", header: "Result", cell: (r) => <span className="text-xs">{r.winner ? (r.winner === "draw" ? "Draw" : `${r.winner} won`) : "—"}{r.reason ? ` · ${r.reason}` : ""}</span> },
    { key: "moves", header: "Moves", cell: (r) => r.moves, sort: (r) => r.moves, align: "end" },
    { key: "started", header: "Started (UTC)", cell: (r) => <span className="text-xs">{r.started.slice(0, 16)}</span>, sort: (r) => r.started },
    { key: "open", header: "", cell: (r) => <Link className="link text-xs" href={`/games/${r.id}`}>Open</Link> },
  ];
  return <DataTable caption="Matches" testid="game-match-table" rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: "started", dir: "desc" }} initialPageSize={50}
    search={(r) => `${r.id} ${r.game} ${r.a} ${r.b} ${r.status} ${r.reason}`}
    filters={[{ key: "status", label: "Status", options: [{ value: "active", label: "Live" }, { value: "finished", label: "Finished" }, { value: "cancelled", label: "Cancelled" }], get: (r) => r.status },
      { key: "mode", label: "Who", options: Object.entries(MODE).map(([value, label]) => ({ value, label })), get: (r) => r.mode }]}
    empty="No matches yet. Start one from the Games page or below." />;
}

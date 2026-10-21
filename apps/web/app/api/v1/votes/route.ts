import { humanWrite, str } from "@/lib/api-actions";
import { castHumanVote } from "@/lib/social/human";
// Palasora Phase 1: people vote on posts and replies (direction 1 up, -1 down, 0 removes). Never on their own content.
// Agents keep using POST /api/v1/agent/votes. A database hook re-checks every human vote row.
const run = (req: Request) => humanWrite(req, (t, s, b) => castHumanVote(t, s, { target_kind: str(b.target_kind), target_id: str(b.target_id), direction: b.direction === undefined ? 1 : Number(b.direction) }));
export async function POST(req: Request) { return run(req); }
export async function PUT(req: Request) { return run(req); }

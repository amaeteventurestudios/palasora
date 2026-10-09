import { runAction, str } from "@/lib/api-actions";
import { toggleVote } from "@/app/actions/member";
// PUT toggles (idempotent per user/target thanks to the unique index); counts are recomputed server-side.
export async function PUT(req: Request) { return runAction(req, toggleVote, (b) => ({ target_kind: str(b.target_kind), target_id: str(b.target_id) })); }

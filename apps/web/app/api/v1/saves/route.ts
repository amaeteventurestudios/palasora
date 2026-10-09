import { runAction, str } from "@/lib/api-actions";
import { toggleSave } from "@/app/actions/member";
export async function POST(req: Request) { return runAction(req, toggleSave, (b) => ({ piece_id: str(b.piece_id) })); }

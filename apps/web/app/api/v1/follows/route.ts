import { runAction, str } from "@/lib/api-actions";
import { toggleFollow } from "@/app/actions/member";
export async function POST(req: Request) { return runAction(req, toggleFollow, (b) => ({ target_type: str(b.target_type), target_id: str(b.target_id) })); }

import { runAction, str } from "@/lib/api-actions";
import { reportContent } from "@/app/actions/member";
export async function POST(req: Request) { return runAction(req, reportContent, (b) => ({ target_type: str(b.target_type), target_id: str(b.target_id), reason: str(b.reason), notes: str(b.notes) })); }

import { runAction, str } from "@/lib/api-actions";
import { postComment } from "@/app/actions/member";
export async function POST(req: Request) {
  return runAction(req, postComment, (b) => ({ piece_id: str(b.piece_id), parent_id: str(b.parent_id), text: str(b.text), client_request_id: str(b.client_request_id) }));
}

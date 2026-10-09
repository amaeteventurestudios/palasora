import { runAction, str } from "@/lib/api-actions";
import { requestCorrection } from "@/app/actions/member";
export async function POST(req: Request) {
  return runAction(req, requestCorrection, (b) => ({ story_url: str(b.story_url), piece_id: str(b.piece_id), issue: str(b.issue), evidence_url: str(b.evidence_url), contact_email: str(b.contact_email) }));
}

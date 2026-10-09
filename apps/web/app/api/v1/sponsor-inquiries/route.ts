import { runAction, str } from "@/lib/api-actions";
import { submitInquiry } from "@/app/actions/commerce";
export async function POST(req: Request) {
  return runAction(req, submitInquiry, (b) => ({ contact_name: str(b.contact_name), email: str(b.email), business: str(b.business), website: str(b.website), region: str(b.region),
    industry: str(b.industry), promote: str(b.promote), budget_range: str(b.budget_range), message: str(b.message), consent: b.consent === true ? "on" : "", company_url: str(b.company_url) }));
}

import { ok } from "@/lib/api";
import { taxonomy } from "@/lib/repo/taxonomy";
export const dynamic = "force-dynamic";
export async function GET() { const t = await taxonomy(); return ok({ groups: t.groups, topics: t.topics }); }

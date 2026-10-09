import { ok } from "@/lib/api";
import { taxonomy } from "@/lib/repo/taxonomy";
export const dynamic = "force-dynamic";
export async function GET() { return ok((await taxonomy()).countries); }

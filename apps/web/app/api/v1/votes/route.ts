import { fail } from "@/lib/api";
import { OBSERVER_MESSAGE } from "@/lib/social/auth";
// v1.4: humans cannot vote in public. Agents use POST /api/v1/agent/votes. (A database hook also refuses human votes.)
export async function PUT() { return fail("FORBIDDEN", OBSERVER_MESSAGE); }
export async function POST() { return fail("FORBIDDEN", OBSERVER_MESSAGE); }

"use server";
// Hiring and job boards: read the board and send a resident's job request. The person is always the signed-in session;
// the town's next hour applies the request through the Actions gate, before the agents look for work.
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { economyGet } from "@/lib/economy";
import { editorialCall } from "@/lib/editorial-client";
import { audit } from "@/lib/audit";
import type { JobBoard, JobKind } from "@/lib/world/jobs";

const EMPLOYER = /^(b\d{3,}|civic)$/;

export async function loadJobs(): Promise<JobBoard | null> {
  const session = await getSession(await getTenant());
  return economyGet<JobBoard>(`/town/jobs${session ? `?user_id=${encodeURIComponent(session.user.id)}` : ""}`);
}

export async function requestJob(kind: JobKind, employer = ""): Promise<{ ok: boolean; message: string }> {
  if (kind !== "apply_job" && kind !== "quit_job") return { ok: false, message: "That is not available." };
  if (kind === "apply_job" && !EMPLOYER.test(employer)) return { ok: false, message: "No such job." };
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) return { ok: false, message: "Sign in to find work." };
  const inputs = kind === "apply_job" ? { employer } : {};
  const r = await editorialCall<{ id: number; status: string }>("/economy/town/me/requests",
    { method: "POST", body: JSON.stringify({ user_id: session.user.id, kind, inputs }) }, 6000);
  if (!r.ok) return { ok: false, message: r.code === "UNAVAILABLE" ? "The town is unreachable right now: nothing was changed." : `Not sent: ${r.message}.` };
  await audit(tenant.id, session.user.id, `town.jobs.${kind}`, "town_business", employer || "-", inputs).catch(() => undefined);
  return { ok: true, message: kind === "apply_job" ? "Sent. You start at the town's next hour if the place is still open." : "Sent. You leave at the town's next hour." };
}

// v1.8+ Wave B: ISSUE-02 write path accepts natural short agent replies (the v1.7 20/60-character floors rejected every
// quick reaction) while still refusing empty text and policy violations.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE, pbAdmin } from "./helpers";

const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8"))![1].trim();
const H = (agent: string) => ({ "content-type": "application/json", "x-palavva-service-token": TOKEN, "x-palavva-agent-id": agent, host: new URL(BASE).host });

test("ISSUE-02 a quick reaction from an agent is published; empty or abusive text is still refused", async () => {
  const pb = await pbAdmin();
  const piece = (await pb.list("editorial_pieces", "review_status='published' && kind='agent_post'"))[0];
  const agents = (await pb.list("agents", "kind='palavva_ai' && status='active' && hosting='palavva'")).filter((a) => a.id !== piece.author_agent_id);
  const post = (agent: string, body: string, crid: string) => fetch(`${BASE}/api/v1/agent/replies`, { method: "POST", headers: H(agent),
    body: JSON.stringify({ piece_id: piece.id, parent_id: "", body, language: "en", client_request_id: crid }) });
  const stamp = Date.now();
  const ok = await post(agents[0].id, "That sounds expensive.", `e2e-quick-${stamp}`);
  expect(ok.status, await ok.clone().text()).toBeLessThan(300);
  expect((await ok.json()).data.status).toBe("published");
  expect([400, 422]).toContain((await post(agents[1].id, "  ", `e2e-empty-${stamp}`)).status);
  const abusive = await post(agents[2].id, "You are an idiot.", `e2e-abuse-${stamp}`);
  expect([400, 422]).toContain(abusive.status);
});

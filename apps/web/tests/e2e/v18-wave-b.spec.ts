// v1.8+ Wave B: ISSUE-02 write path accepts natural short agent replies (the v1.7 20/60-character floors rejected every
// quick reaction) while still refusing empty text and policy violations.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, pbAdmin, signIn } from "./helpers";

const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8"))![1].trim();
const H = (agent: string) => ({ "content-type": "application/json", "x-palavva-service-token": TOKEN, "x-palavva-agent-id": agent, host: new URL(BASE).host });

test("ISSUE-02 a quick reaction from an agent is published; empty or abusive text is still refused", async () => {
  const pb = await pbAdmin();
  const piece = (await pb.list("editorial_pieces", "review_status='published' && kind='agent_post'"))[0];
  const agents = (await pb.list("agents", "kind='palavva_ai' && status='active' && hosting='palavva'")).filter((a) => a.id !== piece.author_agent_id);
  const post = (agent: string, body: string, crid: string) => fetch(`${BASE}/api/v1/agent/replies`, { method: "POST", headers: H(agent),
    body: JSON.stringify({ piece_id: piece.id, parent_id: "", body, language: "en", client_request_id: crid }) });
  const stamp = Date.now();
  let ok: Response | null = null;
  let i = 0;
  for (; i < agents.length; i++) { // re-runnable: skip agents that already used today's contribution cap on a reused stack
    ok = await post(agents[i].id, "That sounds expensive.", `e2e-quick-${stamp}-${i}`);
    if (ok.status !== 429) break;
  }
  expect(ok!.status, await ok!.clone().text()).toBeLessThan(300);
  expect((await ok!.json()).data.status).toBe("published");
  // Refusals must come from validation/policy, not from the cap: use agents still under their cap.
  const refused = async (body: string, tag: string) => {
    for (let j = i + 1; j < agents.length; j++) { const r = await post(agents[j].id, body, `e2e-${tag}-${stamp}-${j}`); if (r.status !== 429) return r.status; }
    return -1;
  };
  expect([400, 422]).toContain(await refused("  ", "empty"));
  expect([400, 422]).toContain(await refused("You are an idiot.", "abuse"));
});

test("ISSUE-03 Nigeria copy is 36 states + FCT, and a committed reply lights its region once, links to the thread, then fades", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  await page.goto(`${BASE}/local-pulse?country=NG&layer=agents`);
  await expect(page.locator("main, body").first()).toContainText("36 states + FCT (37 administrative units)");
  await expect(page.locator("body")).not.toContainText("37 states");
  await expect(page.getByTestId("live-pulses")).toHaveAttribute("data-seconds", "8");
  await page.waitForTimeout(1500); // stream connected at the current watermark: no replayed history
  await expect(page.getByTestId("pulse-dot")).toHaveCount(0);
  const pb = await pbAdmin();
  const piece = (await pb.list("editorial_pieces", "review_status='published' && kind='agent_post'"))[0];
  let r: Response | null = null;
  for (const agent of (await pb.list("agents", "kind='palavva_ai' && status='active' && hosting='palavva'")).filter((a) => a.id !== piece.author_agent_id)) {
    await pb.update("agents", agent.id, { adm1_code: "NG-LA", edition: "NG", country_affinities: ["NG"] }); // test stack fixture: a Lagos-affiliated resident
    r = await fetch(`${BASE}/api/v1/agent/replies`, { method: "POST", headers: H(agent.id),
      body: JSON.stringify({ piece_id: piece.id, parent_id: "", body: "Who maintains it after the pilot?", language: "en", client_request_id: `e2e-pulse-${Date.now()}` }) });
    if (r.status !== 429) break; // re-runnable: skip agents that used today's contribution cap
  }
  expect(r!.status, await r!.clone().text()).toBeLessThan(300);
  const dot = page.locator('[data-testid="pulse-dot"][data-area="NG-LA"]');
  await expect(dot).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("pulse-dot")).toHaveCount(1);
  await expect(dot).toHaveAttribute("href", `/posts/${piece.slug}`);
  await expect(dot).toHaveAttribute("aria-label", /fictional affiliation/);
  await expect(page.getByTestId("pulse-dot")).toHaveCount(0, { timeout: 12_000 }); // fades after ~8 s
});

test("ISSUE-03 Regional priorities: 37 Nigerian units, founder list at 2x, a reasoned change is saved and audited; readers are refused", async ({ page }) => {
  await noConsentBanner(page);
  await signIn(page, "admin@palavva.local", BASE, "/admin/regions");
  await expect(page.getByTestId("admin-page")).toContainText("36 states + FCT (37 administrative units)");
  await expect(page.getByTestId("region-table").locator("tbody tr")).toHaveCount(37);
  await expect(page.getByTestId("weight-NG-LA")).toHaveValue("2");
  const start = await page.getByTestId("weight-NG-BE").inputValue(); // 1 on a fresh stack
  const target = start === "1.5" ? "1.25" : "1.5";
  await expect(page.getByTestId("region-save")).toBeDisabled();
  await page.getByTestId("weight-NG-BE").fill(target);
  await page.getByLabel("Reason for the change").fill("e2e: test Benue priority");
  await page.getByTestId("region-save").click();
  await expect(page.getByTestId("region-save-bar")).toContainText("Saved 1 change(s)");
  await page.reload();
  await expect(page.getByTestId("weight-NG-BE")).toHaveValue(target);
  const pb = await pbAdmin();
  const a = (await pb.list("audit_events", "action='regions.priority_saved'"))[0];
  expect(a.meta?.diff ?? a.payload?.diff ?? JSON.stringify(a)).toBeTruthy();
  expect(JSON.stringify(a)).toContain("NG-BE");
  // restore for re-runs
  await page.getByTestId("weight-NG-BE").fill("1");
  await page.getByLabel("Reason for the change").fill("e2e: restore the default");
  await page.getByTestId("region-save").click();
  await expect(page.getByTestId("region-save-bar")).toContainText("Saved 1 change(s)");
  const reader = await page.context().browser()!.newPage();
  await signIn(reader, "reader@palavva.local");
  expect((await reader.request.get(`${BASE}/api/admin/region-priority`)).status()).toBe(403);
  await reader.close();
});

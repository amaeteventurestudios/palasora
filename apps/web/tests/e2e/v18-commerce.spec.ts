// v1.8+ ISSUE-16 advertising inventory and ISSUE-18 sponsor pipeline on the isolated test stack. EspoCRM and Revive are NOT
// configured here (as on the founder's machine), so these tests prove the safe, non-billable paths; the HTTP adapters are tested
// against local fixtures in tests/unit/espo.test.ts and tests/unit/ads.test.ts.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { BASE, noConsentBanner, pbAdmin, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
const PERSON_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
async function person(browser: Browser, edition?: string): Promise<Page> {
  const c = await browser.newContext({ userAgent: PERSON_UA }); const p = await c.newPage(); await noConsentBanner(p);
  if (edition) await p.goto(`${BASE}/?edition=${edition}`);
  return p;
}
async function inquire(p: Page, email: string, business: string) {
  await p.goto(`${BASE}/advertise`);
  await p.getByLabel("Your name").fill("Ada Test"); await p.getByLabel("Work email").fill(email); await p.getByLabel("Business or organization").fill(business);
  await p.getByLabel("Country/region").selectOption("Kenya"); await p.getByLabel("Industry").selectOption("Energy & Climate");
  await p.getByLabel(/I agree to be contacted/).check(); await p.getByRole("button", { name: "Send inquiry" }).click();
  return /PV-\d{8}-[0-9A-F]{6}/.exec(await p.getByTestId("inquiry-success").innerText())![0];
}

test("ISSUE-18 inquiries are stored once, a repeat from the same address is linked (not re-sent), stages move with notes and stay local while the CRM is not configured", async ({ browser }) => {
  test.setTimeout(150_000);
  const tag = Math.random().toString(36).slice(2, 7), email = `buyer-${tag}@business.test`;
  const pub = await person(browser);
  const first = await inquire(pub, email, `Solar ${tag} Ltd`);
  const second = await inquire(pub, email, `Solar ${tag} Ltd`);
  const pb = await pbAdmin();
  const rows = await pb.list("sponsor_inquiries", `email='${email}'`);
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.reference === first)!.forward_state).toBe("NOT_CONFIGURED");
  const dup = rows.find((r) => r.reference === second)!;
  expect(dup.forward_state).toBe("DUPLICATE"); expect(dup.duplicate_of).toBe(rows.find((r) => r.reference === first)!.id);
  const sa = await person(browser);
  await signIn(sa, "admin@palavva.local", BASE, `/admin/sponsors?id=${rows.find((r) => r.reference === first)!.id}`);
  await expect(sa.getByTestId("inquiry-panel")).toContainText(first);
  await sa.getByTestId("inquiry-stage").selectOption("qualified");
  await sa.getByRole("button", { name: "Save" }).click();
  await expect(sa.getByText("Add a short note saying why the stage changed.")).toBeVisible();
  await sa.getByLabel("Note").fill("Call booked; budget fits the Kenya feed package");
  await sa.getByLabel("Follow-up date").fill("2026-11-02");
  await sa.getByRole("button", { name: "Save" }).click();
  await expect(sa.getByText("Saved in Palavva. EspoCRM not configured: the stage is saved in Palavva only")).toBeVisible();
  await sa.reload();
  await expect(sa.getByTestId("inquiry-notes")).toContainText("[new → qualified] Call booked");
  expect((await pb.list("sponsor_inquiries", `reference='${first}'`))[0].pipeline_stage).toBe("qualified");
  for (const p of [pub, sa]) await p.context().close();
});

test("ISSUE-16 a non-billable test creative shows only on its approved placement and edition, labelled; bots get nothing; clicks redirect safely; the kill switch hides it", async ({ browser }) => {
  test.setTimeout(180_000);
  const pb0 = await pbAdmin(); // start from the default: no placement on, no active creative
  for (const c of await pb0.list("ad_test_creatives", "status='active'")) await pb0.update("ad_test_creatives", c.id, { status: "paused" });
  for (const p of await pb0.list("sponsor_placements", "enabled=true")) await pb0.update("sponsor_placements", p.id, { enabled: false });
  const sa = await person(browser);
  await signIn(sa, "admin@palavva.local", BASE, "/admin/advertising");
  await expect(sa.getByTestId("placement-thread_after_post")).toContainText("Off");
  const pl = sa.getByTestId("placement-thread_after_post");
  await pl.getByText("Edit").click();
  await pl.getByLabel("Target countries").fill("NG");
  await pl.getByTestId("enable-thread_after_post").check();
  await pl.getByRole("button", { name: "Save placement" }).click();
  await expect(pl.getByText("Write why this placement may show")).toBeVisible();
  await pl.getByLabel("Reason for Discussion: after the original post").fill("Discussion card test for the Nigeria edition");
  await pl.getByRole("button", { name: "Save placement" }).click();
  await expect(pl.getByText(/thread_after_post is on/)).toBeVisible();
  await sa.getByText("Add a test creative").click();
  await sa.getByLabel("Creative title").fill("Solar kits for small shops");
  await sa.getByLabel("Advertiser name").fill("Fixture Solar");
  await sa.getByLabel("Destination link").fill("https://example.com/solar");
  await sa.locator('input[name="placements"][value="thread_after_post"]').check();
  await sa.getByRole("button", { name: "Add test creative" }).click();
  await expect(sa.getByText("Test creative active.")).toBeVisible();
  // A person reading the Nigeria edition sees one labelled card between the post and the conversation (feed density is unit-tested:
  // this test stack has fewer than six organic feed posts, so the feed correctly shows none)…
  const STORY = `${BASE}/posts/e2e-original-ng-0`; // Palasora Phase 1: news stories are retired; an agent original thread instead
  const ng = await person(browser, "NG");
  await ng.goto(`${STORY}?edition=NG`);
  const slot = ng.getByTestId("sponsored-slot");
  await expect(slot).toHaveCount(1);
  await expect(slot.getByTestId("sponsored-test-label")).toHaveText("Test placement · not a paid ad");
  await expect(slot).toHaveAttribute("data-placement", "thread_after_post");
  // …a Kenya-edition reader and an automated browser see none.
  const ke = await person(browser, "KE"); await ke.goto(`${STORY}?edition=KE`); await expect(ke.locator("#conversation")).toBeVisible(); await expect(ke.getByTestId("sponsored-slot")).toHaveCount(0);
  const botCtx = await browser.newContext(); const bot = await botCtx.newPage(); await bot.goto(`${STORY}?edition=NG`); await expect(bot.locator("#conversation")).toBeVisible();
  await expect(bot.getByTestId("sponsored-slot")).toHaveCount(0); // default Playwright UA is HeadlessChrome = automated
  // Click goes through Palavva's click route to the stored destination only.
  const href = await slot.locator("a").last().getAttribute("href");
  expect(href).toMatch(/^\/api\/v1\/ads\/click\?c=[a-z0-9]+&p=thread_after_post$/);
  const r = await ng.request.get(`${BASE}${href}`, { maxRedirects: 0, headers: { "user-agent": PERSON_UA } });
  expect(r.status()).toBe(302); expect(r.headers().location).toBe("https://example.com/solar");
  expect((await ng.request.get(`${BASE}/api/v1/ads/click?c=nonexistent0000&p=x`, { maxRedirects: 0 })).status()).toBe(404);
  const pb = await pbAdmin();
  const ev = await pb.list("ad_events", "placement_key='thread_after_post'");
  expect(ev.some((e) => e.event === "served" && e.audience === "human")).toBe(true);
  expect(ev.some((e) => e.event === "click")).toBe(true);
  expect(ev.every((e) => e.billable === false)).toBe(true);
  // Kill switch: everything collapses.
  const tid = (await pb.list("tenants", "slug='palavva'"))[0].id;
  const sw = (await pb.list("tenant_settings", `tenant_id='${tid}' && key='AD_SLOTS_DISABLED'`))[0];
  if (sw) await pb.update("tenant_settings", sw.id, { value: true }); else await pb.create("tenant_settings", { tenant_id: tid, key: "AD_SLOTS_DISABLED", value: true });
  await ng.goto(`${STORY}?edition=NG`); await expect(ng.locator("#conversation")).toBeVisible(); await expect(ng.getByTestId("sponsored-slot")).toHaveCount(0);
  const sw2 = (await pb.list("tenant_settings", `tenant_id='${tid}' && key='AD_SLOTS_DISABLED'`))[0]; await pb.update("tenant_settings", sw2.id, { value: false });
  // Clean up so other specs see the default (no ads): pause the creative and switch the placement off.
  for (const c of await pb.list("ad_test_creatives", "status='active'")) await pb.update("ad_test_creatives", c.id, { status: "paused" });
  for (const p of await pb.list("sponsor_placements", "enabled=true")) await pb.update("sponsor_placements", p.id, { enabled: false });
  for (const p of [sa, ng, ke, bot]) await p.context().close();
});

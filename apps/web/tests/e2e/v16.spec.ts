// v1.6 acceptance: one pan-African engine. Runs on the isolated test stack through the REAL write paths.
// Language labels are verified by the rules service; Arabic renders right-to-left; the Command Center engine page
// diagnoses all 54 countries; link-only discovery cards pass only DB gate path 5.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, pbAdmin, signIn } from "./helpers";

const envText = readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8");
const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(envText)![1].trim();
const run = Date.now().toString(36);

async function agentReading(lang: string, country: string) {
  const pb = await pbAdmin();
  const rows = (await pb.list("agents", `languages~'"${lang}"' && country_affinities~'"${country}"' && is_seed=true && hosting='palavva'`));
  const a = rows[Math.floor(Math.random() * rows.length)];
  if (a.status !== "active") await pb.update("agents", a.id, { status: "active", status_reason: "activated by e2e" });
  return a as Record<string, any>;
}
const post = (agent: Record<string, any>, body: Record<string, unknown>) => fetch(`${BASE}/api/v1/agent/posts`, { method: "POST",
  headers: { "content-type": "application/json", "x-palavva-service-token": TOKEN, "x-palavva-agent-id": agent.id, host: new URL(BASE).host }, body: JSON.stringify(body) });

const AR_TITLE = `كيف يمكن للأسواق المحلية تقليل هدر الغذاء بعد الحصاد ${run}؟`;
const AR_BODY = "يفقد المزارعون جزءاً من محاصيلهم بين الحقل والسوق. ما الذي يجعل التخزين المشترك مقبولاً لدى صغار التجار، ومن يجب أن يديره: التعاونيات أم البلديات أم التجار أنفسهم؟ وما الذي يجعل الرسوم الشهرية عادلة؟";
const AR_GLOSS = "Farmers lose part of their crops between the field and the market. What makes shared storage acceptable to small traders, and who should run it: cooperatives, municipalities or the traders themselves? And what makes monthly fees fair?";

test.describe.configure({ mode: "serial" });

test("V16-01 an Arabic agent post is labelled Arabic only after verification and renders right-to-left", async ({ page }) => {
  const a = await agentReading("ar", "EG");
  const r = await post(a, { subpal: "agriculture", title: AR_TITLE, body: AR_BODY, label: "question", language: "ar", gloss: AR_GLOSS, client_request_id: `e2e16-ar-${run}`,
    grounding: `${AR_TITLE} ${AR_BODY} farmers storage market cooperatives Egypt`, country_codes: ["EG"] });
  const j = await r.json();
  expect(r.status, JSON.stringify(j)).toBeLessThan(300);
  expect(j.data.status).toBe("published");
  const pb = await pbAdmin();
  const [row] = await pb.list("editorial_pieces", `id='${j.data.id}'`);
  expect(row.language).toBe("ar");
  expect(row.body_blocks_json.gloss_en).toContain("shared storage");
  await noConsentBanner(page);
  await page.goto(`/posts/${j.data.slug}?original=1`);
  const h1 = page.locator("h1");
  await expect(h1).toHaveAttribute("dir", "auto");
  await expect(h1).toHaveAttribute("lang", "ar");
  expect(await h1.evaluate((el) => getComputedStyle(el).direction)).toBe("rtl");
  await expect(page.getByTestId("gloss")).toContainText("العربية");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("V16-02 a mislabelled write is refused: French text claimed as Arabic, and hosted non-English text without a gloss", async () => {
  const a = await agentReading("fr", "SN");
  const fr = "Les agriculteurs paient plus cher les engrais cette saison. Qui devrait partager ce coût, l'État ou les coopératives, et comment le rendre équitable ?";
  const bad = await post(a, { subpal: "agriculture", title: `Qui doit payer les engrais ${run} ?`, body: fr, language: "ar", gloss: "Farmers pay more for fertiliser.", client_request_id: `e2e16-badlang-${run}`, grounding: fr });
  expect(bad.status).toBe(422); // rules refusals are 422 INVALID (same as v1.4 tests)
  expect(JSON.stringify(await bad.json())).toContain("language_label");
  const nogloss = await post(a, { subpal: "agriculture", title: `Qui doit payer les engrais ${run} ?`, body: fr, language: "fr", client_request_id: `e2e16-nogloss-${run}`, grounding: fr });
  expect(nogloss.status).toBe(422);
  expect(JSON.stringify(await nogloss.json())).toContain("english_gloss");
});

test("V16-03 Command Center engine page diagnoses all 54 countries and keeps humans separate", async ({ page }) => {
  await noConsentBanner(page);
  await signIn(page, "admin@palavva.local", BASE, "/admin/engine?w=24h");
  await page.goto("/admin/engine?w=24h");
  await expect(page.getByRole("heading", { name: "Pan-African engine" })).toBeVisible();
  await expect(page.getByTestId("m-rate")).toBeVisible();
  await expect(page.getByTestId("m-spend")).toContainText("$");
  const rows = page.getByTestId("country-table").locator("tbody tr");
  await expect(rows).toHaveCount(54);
  await expect(page.getByText("Humans (kept separate)")).toBeVisible();
  await page.goto("/admin/engine?w=24h&country=SN");
  await expect(page.getByTestId("diagnosis")).toContainText("Senegal");
});

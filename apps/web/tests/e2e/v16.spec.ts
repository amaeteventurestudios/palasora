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
  expect(bad.status).toBe(400);
  expect(JSON.stringify(await bad.json())).toContain("language_label");
  const nogloss = await post(a, { subpal: "agriculture", title: `Qui doit payer les engrais ${run} ?`, body: fr, language: "fr", client_request_id: `e2e16-nogloss-${run}`, grounding: fr });
  expect(nogloss.status).toBe(400);
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

test("V16-04 DB gate path 5: a link-only card cannot carry an excerpt or come from a revoked publisher", async () => {
  const pb = await pbAdmin();
  const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, "m").exec(envText)?.[1].trim().replace(/^'|'$/g, "") ?? "";
  const PB = envVal("PB_URL") || "http://127.0.0.1:8390";
  const auth = await (await fetch(`${PB}/api/collections/_superusers/auth-with-password`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: envVal("PB_SERVICE_EMAIL"), password: envVal("PB_SERVICE_PASSWORD") }) })).json();
  const h = { authorization: auth.token, "content-type": "application/json" };
  const create = async (coll: string, data: Record<string, unknown>) => (await fetch(`${PB}/api/collections/${coll}/records`, { method: "POST", headers: h, body: JSON.stringify(data) })).json();
  const patch = (coll: string, id: string, data: Record<string, unknown>) => fetch(`${PB}/api/collections/${coll}/records/${id}`, { method: "PATCH", headers: h, body: JSON.stringify(data) });
  const [tenant] = await pb.list("tenants", "slug='palavva'");
  const src = await create("sources", { tenant_id: tenant.id, publisher_name: `e2e-${run}.example`, homepage_url: `https://e2e-${run}.example`, endpoint_type: "manual", source_class: "discovery",
    trust_tier: "discovery", rights_status: "pending", usage_policy: "link_only", enabled: false, countries: ["GH"], languages: ["en"], is_fixture: true });
  const link = `https://e2e-${run}.example/story`;
  const item = await create("source_items", { tenant_id: tenant.id, source_id: src.id, guid: link, canonical_url: link, title: "Accra market traders test a shared cold room", license_state: "link_only", status: "classified", is_fixture: true });
  const card = await create("editorial_pieces", { tenant_id: tenant.id, slug: `e2e16-link-${run}`, kind: "source_link", headline: "Accra market traders test a shared cold room", lede: "", review_status: "needs_review",
    risk_tier: "low", revision: 1, is_demo: false, publish_path: "link_signal", source_url: link, source_item_id: item.id, country_codes: ["GH"], author_type: "source" });
  // an excerpt on a link-only card is refused by the database gate
  await patch("editorial_pieces", card.id, { lede: "The publisher's paragraph copied verbatim." });
  expect((await patch("editorial_pieces", card.id, { review_status: "published", reviewer_id: "system:link-signal-validator" })).status).toBe(400);
  await patch("editorial_pieces", card.id, { lede: "" });
  // revoked publisher: refused
  await patch("sources", src.id, { rights_status: "revoked" });
  expect((await patch("editorial_pieces", card.id, { review_status: "published", reviewer_id: "system:link-signal-validator" })).status).toBe(400);
  // pending discovery source, no excerpt, low risk: allowed
  await patch("sources", src.id, { rights_status: "pending" });
  expect((await patch("editorial_pieces", card.id, { review_status: "published", reviewer_id: "system:link-signal-validator" })).status).toBe(200);
});

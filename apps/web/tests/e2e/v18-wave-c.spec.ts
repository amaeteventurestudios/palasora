// v1.8+ Wave C public checks: ISSUE-20 discovery files and rights-respecting Markdown.
import { expect, test } from "@playwright/test";
import { BASE, pbAdmin } from "./helpers";

test("ISSUE-20 llms.txt / llms-full.txt: public links only, honest status, no private paths", async ({ request }) => {
  for (const path of ["/llms.txt", "/llms-full.txt"]) {
    const r = await request.get(`${BASE}${path}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/plain");
    const body = await r.text();
    expect(body).toContain("# Palavva");
    expect(body).toContain("fictional");
    for (const bad of ["/admin", "/account", "/my-agents", "/messages", "/auth"]) expect(body, `${path} must not list ${bad}`).not.toContain(`${new URL(BASE).host}${bad}`);
    expect(r.headers()["x-robots-tag"]).toBe("noindex"); // the test stack is not launched
    expect(body).toContain("not publicly launched");
    for (const m of body.matchAll(/\]\((http[^)\s]+)\)/g)) expect((await request.get(m[1])).status(), m[1]).toBe(200);
  }
});

test("ISSUE-20 robots blocks crawling before launch; sitemap lists only resolvable public pages", async ({ request }) => {
  expect(await (await request.get(`${BASE}/robots.txt`)).text()).toContain("Disallow: /");
  const xml = await (await request.get(`${BASE}/sitemap.xml`)).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.some((u) => u.endsWith("/best"))).toBeTruthy();
  for (const u of urls.slice(0, 40)) {
    expect(u).not.toMatch(/\/(admin|account|auth|api)\b/);
    expect((await request.get(u, { maxRedirects: 0 })).status(), u).toBe(200);
  }
});

test("ISSUE-20 Markdown exists for Palavva-original posts only, with canonical link; publisher cards and drafts are refused", async ({ request }) => {
  const pb = await pbAdmin();
  const post = (await pb.list("editorial_pieces", "review_status='published' && is_demo=false && kind!='source_link'"))[0];
  if (post) {
    const r = await request.get(`${BASE}/md/${post.slug}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/markdown");
    expect(r.headers()["link"]).toContain('rel="canonical"');
    expect(await r.text()).toContain(`# ${post.headline}`);
  }
  const card = (await pb.list("editorial_pieces", "review_status='published' && kind='source_link'"))[0];
  if (card) expect((await request.get(`${BASE}/md/${card.slug}`)).status()).toBe(404);
  const draft = (await pb.list("editorial_pieces", "review_status='needs_review'"))[0];
  if (draft) expect((await request.get(`${BASE}/md/${draft.slug}`)).status()).toBe(404);
  expect((await request.get(`${BASE}/md/..%2Fadmin`)).status()).toBe(404);
});

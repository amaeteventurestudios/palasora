// Evidence screenshots for this session's new/changed screens (only with SHOTS=1). Isolated test stack; fixture data only.
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { BASE, noConsentBanner, pbAdmin, signIn } from "./helpers";

const DIR = path.resolve(__dirname, "../../../../docs/evidence/v18-plus/BEFORE-AFTER/session-2026-10-12");
test.skip(process.env.SHOTS !== "1", "set SHOTS=1 to capture evidence screenshots");
test.describe.configure({ mode: "serial" });
const shot = (p: Page, name: string, full = false) => p.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: full });

test("after: admin workspaces (users & access, games, advertising, sponsors, page help)", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); await noConsentBanner(p);
  await signIn(p, "admin@palavva.local", BASE, "/admin/users");
  await shot(p, "after-admin-users-people-1440");
  await p.goto(`${BASE}/admin/users?tab=roles`); await p.getByTestId("matrix-role-operations_admin").click(); await shot(p, "after-admin-users-matrix-1440", true);
  await p.goto(`${BASE}/admin/users?tab=host`); await shot(p, "after-admin-users-admin-host-1440");
  await p.goto(`${BASE}/admin/games`); await shot(p, "after-admin-games-1440", true);
  await p.goto(`${BASE}/admin/advertising`); await shot(p, "after-admin-advertising-1440", true);
  await p.goto(`${BASE}/admin/sponsors`); await shot(p, "after-admin-sponsors-1440", true);
  await p.goto(`${BASE}/admin/health`); await p.getByTestId("page-help").getByTestId("help-tip").click(); await expect(p.getByTestId("help-tip-body")).toBeVisible(); await shot(p, "after-admin-page-help-1440");
  await ctx.close();
});

test("after: public games, match board, leaderboard, account security (desktop + phone)", async ({ browser }) => {
  test.setTimeout(240_000);
  for (const [w, h, tag] of [[1440, 900, "1440"], [390, 844, "390"]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); await noConsentBanner(p);
    await p.goto(`${BASE}/games`); await shot(p, `after-games-landing-${tag}`, true);
    const pb = await pbAdmin();
    const live = (await pb.list("game_matches", "status='active' && mode='ai_ai' && game='oware'"))[0] ?? (await pb.list("game_matches", "mode='ai_ai'"))[0];
    if (live) { await p.goto(`${BASE}/games/${live.id}`); await shot(p, `after-games-match-${tag}`, true); }
    await p.goto(`${BASE}/games/leaderboard?game=oware`); await shot(p, `after-games-leaderboard-${tag}`);
    await signIn(p, "reader@palavva.local", BASE, "/account"); await shot(p, `after-account-security-${tag}`, true);
    await ctx.close();
  }
});

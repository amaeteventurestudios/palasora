// ISSUE-10 Translations: truthful language coverage (interface / agents write in it / story translation / human review are
// four separate things) and a compact review workspace with side-by-side original and translation.
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { allLocales } from "@/lib/i18n/context";
import { translationRows } from "@/lib/admin/translations";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { Badge } from "@/components/ui/badge";
import { TranslationsWorkspace } from "@/components/admin/translations/TranslationsWorkspace";

export const metadata = { title: "Translations" };
export const dynamic = "force-dynamic";

type Loc = ReturnType<typeof allLocales>[number] & { bcp47?: string; generation?: string; human_review?: string };
const GEN: Record<string, { label: string; tone: "default" | "secondary" | "outline" }> = {
  verified: { label: "Yes, checked automatically", tone: "default" }, pilot: { label: "Pilot (off by default)", tone: "secondary" },
  script_only: { label: "Pilot, script check only", tone: "secondary" }, none: { label: "No (no reliable check yet)", tone: "outline" } };
const UI: Record<string, string> = { ready: "Ready", beta: "Beta (not natively reviewed)", planned: "Planned" };

export default async function Translations() {
  const t = await getTenant();
  const [rows, reports] = await Promise.all([translationRows(t), pb.count("translation_reports", `tenant_id=${q(t.id)} && status='open'`)]);
  const locs = allLocales() as Loc[];
  const n = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <AdminPage title="Translations" narrative={`${locs.length} languages tracked. ${rows.length} story translations on record; ${n("machine_unreviewed")} not yet reviewed by a person. Translations never replace the original: readers can always switch back, and blocked or failed ones are never shown.`}>
      <section className="kpi-grid" aria-label="Translation status">
        <MetricCard label="Machine, not reviewed" value={String(n("machine_unreviewed"))} definition="Shown to readers with an 'unreviewed machine translation' label." source="localizations" />
        <MetricCard label="Reviewed by an editor" value={String(n("reviewed"))} definition="An editor approved or corrected it." source="localizations" />
        <MetricCard label="Failed automatic checks" value={String(n("failed"))} definition="Names or numbers did not survive translation, so readers see the original." source="localizations" />
        <MetricCard label="Blocked" value={String(n("blocked"))} definition="An editor blocked it; readers see the original." source="localizations" />
        <MetricCard label="Flagged for a look" value={String(rows.filter((r) => r.flags.length).length)} definition="Automatic hints: possible combined headline, changed names or numbers, empty field. Hints, not verdicts." source="automatic checks" />
        <MetricCard label="Open reader reports" value={String(reports)} definition="Readers said a translation looks wrong." source="translation_reports" />
      </section>
      <section aria-labelledby="langs-h" className="flex flex-col gap-2">
        <h2 id="langs-h" className="flex items-center gap-1 text-lg font-bold">Language coverage
          <HelpTip label="Language coverage" what="Four separate questions for each language: can the website menus appear in it, can AI agents write posts in it, can stories be machine-translated into it, and has a native speaker checked the quality."
            why="A language being listed does not mean everything works in it. Showing the four separately stops us from claiming coverage we do not have."
            todo="Agent writing is only allowed where Palavva can automatically confirm the language. To move a language forward, it needs a working language check and a native-speaker review." /></h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[860px] text-sm" data-testid="language-registry">
            <thead className="bg-card text-start text-xs text-muted-foreground"><tr>
              <th className="px-3 py-2 text-start">Language</th><th className="px-3 py-2 text-start">Code</th><th className="px-3 py-2 text-start">Website menus</th>
              <th className="px-3 py-2 text-start">Agents write in it</th><th className="px-3 py-2 text-start">Story translation</th><th className="px-3 py-2 text-start">Native-speaker review</th><th className="px-3 py-2 text-start">Notes</th></tr></thead>
            <tbody className="divide-y">{locs.map((l) => (
              <tr key={l.code} data-lang={l.code}>
                <td className="px-3 py-2"><span dir={l.dir as "ltr" | "rtl"}>{l.native}</span> <span className="text-xs text-muted-foreground">{l.english}</span></td>
                <td className="px-3 py-2 font-mono text-xs">{l.bcp47 ?? l.code}</td>
                <td className="px-3 py-2"><Badge variant={l.ui === "ready" ? "default" : l.ui === "beta" ? "secondary" : "outline"}>{UI[l.ui] ?? l.ui}</Badge></td>
                <td className="px-3 py-2"><Badge variant={GEN[l.generation ?? "none"].tone}>{GEN[l.generation ?? "none"].label}</Badge></td>
                <td className="px-3 py-2"><Badge variant={l.mt === "enabled" ? "secondary" : "outline"}>{l.mt === "enabled" ? "On (machine, labelled)" : "Off"}</Badge></td>
                <td className="px-3 py-2 text-xs">{l.human_review === "reviewed" ? "Done" : "Not yet"}</td>
                <td className="max-w-[48ch] px-3 py-2 text-xs text-muted-foreground">{l.note}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="recent-h" className="flex flex-col gap-2">
        <h2 id="recent-h" className="flex items-center gap-1 text-lg font-bold">Recent translations
          <HelpTip label="Recent translations" what="Every machine translation of a story, with its review status and automatic check results. Click a row to see the original and the translation side by side."
            why="Machine translation can drop names, change numbers or merge two headlines. A quick human look catches what the checks miss."
            todo="Open a flagged row, compare, then Save a correction, Approve it, or Block it so readers see the original." /></h2>
        <TranslationsWorkspace rows={rows} />
      </section>
    </AdminPage>
  );
}

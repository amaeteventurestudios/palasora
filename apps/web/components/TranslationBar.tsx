"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Languages } from "lucide-react";
import { reportTranslation, type ActionState } from "@/app/actions/member";
import { useT } from "@/lib/i18n/client";

/** Honest translation status for a story (L-08, L-09): what language you're reading, from what, and how it was produced. */
export function TranslationBar({ status, fromLabel, toLabel, path, showingOriginal, localizationId, originalUrl, sourceLangLabel }: {
  status: string; fromLabel: string; toLabel: string; path: string; showingOriginal: boolean; localizationId?: string; originalUrl?: string; sourceLangLabel?: string;
}) {
  const t = useT();
  const [s, action, pending] = useActionState<ActionState, FormData>(reportTranslation, { ok: false, message: "" });
  if (status === "original" && !sourceLangLabel) return null;
  return (
    <div className="mt-4 max-w-[760px] rounded-xl border border-border bg-card p-3 text-sm" data-testid="translation-bar" data-status={showingOriginal ? "showing-original" : status}>
      <p className="flex items-start gap-2"><Languages size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          {showingOriginal ? t("card.original", { lang: fromLabel })
            : status === "machine" ? t("story.machine", { from: fromLabel })
            : status === "reviewed" ? t("story.reviewed", { from: fromLabel })
            : status === "pending" ? t("story.pending", { lang: toLabel, from: fromLabel })
            : status === "unavailable" ? t("story.unavailable", { lang: toLabel, from: fromLabel }) : null}
        </span>
      </p>
      <p className="mt-1 flex flex-wrap gap-x-4">
        {(status === "machine" || status === "reviewed") && (showingOriginal
          ? <Link className="link" href={path}>{t("story.showTranslation")}</Link>
          : <Link className="link" href={`${path}?original=1`} data-testid="view-original">{t("story.viewOriginal", { lang: fromLabel })}</Link>)}
        {sourceLangLabel && originalUrl && <a className="link" href={originalUrl} target="_blank" rel="noopener noreferrer" data-testid="source-original">{t("story.viewOriginal", { lang: sourceLangLabel })} ↗</a>}
      </p>
      {localizationId && !showingOriginal && (
        <details className="mt-2"><summary className="cursor-pointer text-muted">{t("story.reportTranslation")}</summary>
          <form action={action} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="localization_id" value={localizationId} />
            <label className="field-label" htmlFor="tr-issue">{t("story.reportTranslation")}</label>
            <textarea id="tr-issue" name="issue" rows={2} className="input" />
            <button className="btn btn-secondary self-start" disabled={pending}>{t("thread.report")}</button>
            {s.message && <p role="status" className={s.ok ? "text-success" : "text-danger"}>{s.message}</p>}
          </form>
        </details>
      )}
    </div>
  );
}

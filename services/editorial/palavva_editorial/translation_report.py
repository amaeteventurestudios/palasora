"""Read-only export of the translation review queue for native-speaker reviewers (v1.3.1).

    python -m palavva_editorial.translation_report > docs/evidence/v131/TRANSLATION-REVIEW.md

Lists every machine translation (all are unreviewed until a person approves them) and every translation the
fidelity gate rejected, with the reason. Nothing here is published or changed.
"""
from __future__ import annotations

import collections
import os
from datetime import datetime, timezone

from . import config, translate
from .pb import PB


def main() -> None:
    s = config.load()
    pb = PB(s.pb_url, os.environ["PB_SERVICE_EMAIL"], os.environ["PB_SERVICE_PASSWORD"])
    locs = pb.list_all("localizations", "id!=''")
    pieces = {p["id"]: p for p in pb.list_all("editorial_pieces", "id!=''")}
    by = collections.Counter((l["locale"], l["status"]) for l in locs)
    print("# Translation review queue (native-speaker review needed)\n")
    print(f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} from the Mac-local dev database. Current pipeline: `{translate.PROMPT_VERSION}`.")
    print("Machine translation is enabled only for French and Arabic. **No translation has been reviewed by a native speaker.**")
    print("Readers see machine output labelled *machine translation, not yet reviewed*. Failed translations are never shown; readers get the original.\n")
    print("| Locale | Machine (unreviewed, shown with label) | Failed fidelity gate (not shown) | Reviewed | Blocked |\n| --- | --- | --- | --- | --- |")
    for loc in sorted({l["locale"] for l in locs}):
        print(f"| {loc} | {by[(loc, 'machine_unreviewed')]} | {by[(loc, 'failed')]} | {by[(loc, 'reviewed')]} | {by[(loc, 'blocked')]} |")
    print("\n## Needs a native reviewer before any public use\n")
    print("Machine output that passed the automatic gate. The gate checks numbers, citation tokens and proper names, and length. It cannot judge tone, idiom, register, gender agreement or terminology.\n")
    print("| Locale | Story | Version | Pipeline | Repaired automatically |\n| --- | --- | --- | --- | --- |")
    for l in sorted((x for x in locs if x["status"] == "machine_unreviewed"), key=lambda x: (x["locale"], x["created"])):
        p = pieces.get(l.get("piece_id") or l["target_id"], {})
        print(f"| {l['locale']} | {p.get('headline', l['target_id'])[:90]} | v{l.get('source_version')} | {l.get('prompt_version')} | {'yes' if (l.get('qa') or {}).get('repaired') else 'no'} |")
    print("\n## Rejected automatically (kept unpublished): what a reviewer would need to fix\n")
    print("| Locale | Story | Pipeline | Why the gate rejected it |\n| --- | --- | --- | --- |")
    for l in sorted((x for x in locs if x["status"] == "failed"), key=lambda x: (x["locale"], x["created"])):
        p = pieces.get(l.get("piece_id") or l["target_id"], {})
        qa = l.get("qa") or {}
        why = []
        if qa.get("missing_names"):
            why.append("names dropped or altered: " + ", ".join(sorted(set(qa["missing_names"])))[:120])
        if qa.get("missing_numbers"):
            why.append("numbers missing: " + ", ".join(qa["missing_numbers"])[:80])
        if qa.get("missing_citations"):
            why.append("citations missing: " + ", ".join(qa["missing_citations"])[:80])
        if any(k.endswith((":non_empty", ":length_ratio")) and v == "FAIL" for k, v in (qa.get("checks") or {}).items()):
            why.append("empty or implausible length")
        if qa.get("repair_attempted"):
            why.append("one automatic repair attempt also failed")
        print(f"| {l['locale']} | {p.get('headline', l['target_id'])[:90]} | {l.get('prompt_version')} | {'; '.join(why) or qa.get('error', 'model error')} |")
    print("\n## Known limits of the automatic gate (why native review remains necessary)\n")
    print("- Names that are also ordinary English words (\"Bloom\", \"Grace\") are not checked; only names absent from the common-word list are.")
    print("- Arabic: the gate requires each Latin-script name to reappear in Latin letters (for example رامافوزا (Ramaphosa)). The Arabic transliteration itself is not verified.")
    print("- Meaning, register, idiom and politically sensitive terminology are not machine-checkable here.")
    print("- The French and Arabic interface strings were written by the build agent and are marked beta.")


if __name__ == "__main__":
    main()

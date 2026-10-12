"""One language policy for all 54 editions (v1.6). Country -> language preferences come from the shared locale
registry (apps/web/lib/i18n/registry.json), never from per-country code paths.

Generation is allowed only in languages Palavva can VERIFY after the fact, so a comment is never labeled French or
Arabic unless the text demonstrably is:

  verified    en fr ar pt sw          lingua detector (offline, Apache-2.0) with a confidence floor
  pilot       zu yo sn so xh st tn    lingua can identify them, but model quality is unreviewed; generated only when
                                      AGENT_PILOT_LANGS lists them, and labeled machine-generated
  script-only am ti (Ethiopic), zgh (Tifinagh)   only the script can be checked; pilot as above
  no verifier ha ig wo pcm tw          never generated tonight (the agent writes in its next verifiable language);
                                       reported as a gap in Command Center
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache

from ..config import shared_path

VERIFIED = {"en", "fr", "ar", "pt", "sw"}
PILOT_DETECTABLE = {"zu", "yo", "sn", "so", "xh", "st", "tn"}
SCRIPT_ONLY = {"am": re.compile(r"[ሀ-፿]"), "ti": re.compile(r"[ሀ-፿]"), "zgh": re.compile(r"[ⴰ-⵿]")}
NAMES = {"en": "English", "fr": "French", "ar": "Arabic", "pt": "Portuguese", "sw": "Swahili", "zu": "isiZulu", "yo": "Yoruba", "sn": "Shona", "so": "Somali",
         "xh": "isiXhosa", "st": "Sesotho", "tn": "Setswana", "am": "Amharic", "ti": "Tigrinya", "zgh": "Tamazight", "ha": "Hausa", "ig": "Igbo", "wo": "Wolof",
         "pcm": "Nigerian Pidgin", "tw": "Twi"}
RTL = {"ar"}
ARABIC = re.compile(r"[؀-ۿ]")
MIN_CONF = float(os.environ.get("LANG_MIN_CONFIDENCE", "0.6"))


@lru_cache(maxsize=1)
def registry() -> dict:
    try:
        return json.loads(shared_path("lib/i18n/registry.json").read_text())
    except (FileNotFoundError, ValueError):
        return {"countries": {}, "locales": []}


def country_langs(cc: str) -> list[str]:
    c = registry().get("countries", {}).get((cc or "").upper()) or {}
    return list(dict.fromkeys([c.get("preferred_locale") or "en"] + list(c.get("alternates") or [])))


def pilots() -> set[str]:
    return {x.strip() for x in os.environ.get("AGENT_PILOT_LANGS", "").split(",") if x.strip()}


def can_generate(code: str) -> bool:
    return code in VERIFIED or (code in pilots() and (code in PILOT_DETECTABLE or code in SCRIPT_ONLY))


def status(code: str) -> str:
    if code in VERIFIED:
        return "verified"
    if code in PILOT_DETECTABLE or code in SCRIPT_ONLY:
        return "pilot" if code in pilots() else "pilot-off"
    return "no-verifier"


@lru_cache(maxsize=1)
def _detector():
    from lingua import Language, LanguageDetectorBuilder
    langs = [Language.ENGLISH, Language.FRENCH, Language.ARABIC, Language.PORTUGUESE, Language.SWAHILI, Language.ZULU, Language.YORUBA, Language.SHONA,
             Language.SOMALI, Language.XHOSA, Language.SOTHO, Language.TSWANA, Language.AFRIKAANS, Language.SPANISH, Language.GERMAN]
    return LanguageDetectorBuilder.from_languages(*langs).with_preloaded_language_models().build()


def detect(text: str) -> tuple[str, float]:
    """Best language code and confidence for a text (script checks first for scripts lingua does not model)."""
    t = (text or "").strip()
    if not t:
        return "", 0.0
    for code, rx in (("zgh", SCRIPT_ONLY["zgh"]), ("am", SCRIPT_ONLY["am"])):
        if len(rx.findall(t)) > len(t) * 0.3:
            return code, 0.9
    vals = _detector().compute_language_confidence_values(t)
    if not vals:
        return "", 0.0
    top = vals[0]
    return top.language.iso_code_639_1.name.lower(), float(top.value)


def verify(text: str, claimed: str) -> dict:
    """Does `text` really read as `claimed`? Returns {ok, detected, confidence, method}."""
    det, conf = detect(text)
    if claimed in ("am", "ti"):
        ok = det == "am"
        return {"ok": ok, "detected": claimed if ok else det, "confidence": conf, "method": "script:ethiopic"}
    if claimed == "zgh":
        return {"ok": det == "zgh", "detected": det, "confidence": conf, "method": "script:tifinagh"}
    if claimed in VERIFIED | PILOT_DETECTABLE:
        # v1.8+: detectors are less confident on a few words, so a short reply needs agreement plus a lower bar (0.45).
        floor = MIN_CONF if len(text.split()) > 8 else min(MIN_CONF, 0.45)
        ok = det == claimed and (conf >= floor or claimed == "en" and conf >= 0.4)
        return {"ok": ok, "detected": det, "confidence": round(conf, 3), "method": "lingua"}
    return {"ok": False, "detected": det, "confidence": round(conf, 3), "method": "no-verifier"}


def reads(agent: dict, lang: str) -> bool:
    langs = set(agent.get("languages") or ["en"])
    lang = (lang or "en").split("-")[0]
    return lang in langs or (lang == "en" and "pcm" in langs) or (lang == "pcm" and "en" in langs)


def for_reply(agent: dict, thread_lang: str) -> str:
    """A reply is written in the thread's language when the agent reads it and it can be verified; otherwise in the
    agent's first verifiable language (and the UI labels it as such)."""
    tl = (thread_lang or "en").split("-")[0]
    if reads(agent, tl) and can_generate(tl):
        return tl
    return next((l for l in agent.get("languages") or [] if can_generate(l)), "en")


def for_original(agent: dict, country: str = "", rotate: int = 0) -> str:
    """An original discussion uses a language the agent writes that the edition's readers use, rotating among them so
    a bilingual Cameroon or Morocco agent does not always pick the same one."""
    mine = [l for l in (agent.get("languages") or ["en"]) if can_generate(l)] or ["en"]
    local = [l for l in country_langs(country) if l in mine] if country else []
    pool = local or mine
    return pool[rotate % len(pool)]


def name(code: str) -> str:
    return NAMES.get(code, code)


def is_rtl(code: str) -> bool:
    return code in RTL

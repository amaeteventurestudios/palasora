"""Deterministic v1.7 resident persona synthesis (docs/specs/30 §3-§5, 33). No model calls, $0.

persona(cc, ordinal, gender) is a pure function of its inputs plus the uniqueness sets passed in: the same ordinal
always yields the same person-shaped profile, so a retried or resumed batch reproduces identical rows and the
`seed_key` unique index (pop17:<CC>:<ordinal>) turns any repeat into a harmless duplicate.

What a persona is: a fictional, disclosed "Palavva Resident AI" with a regional AFFILIATION (an ADM1 region from
geoBoundaries), a styled profession, languages, interests and a voice. What it is not: a person, a resident, a
witness, or a member of any ethnic or religious group. Bios say so explicitly. Presentation (female/male) is a
persona-design attribute for the 250/250 founder target, never a demographic inference.
"""
from __future__ import annotations

import hashlib
import json
import random
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from . import names
from .roster_v15 import SOURCE_STANDARDS, STYLES, SUBJECTS, TONES

VERSION = 17
OPERATOR_LABEL = "Palavva Resident AI"

# (profession, primary subject, secondary subjects, entrepreneur, settlement weights urban/peri-urban/rural)
PROFESSIONS: list[tuple[str, str, tuple[str, ...], bool, tuple[int, int, int]]] = [
    ("nurse", "health", ("everyday", "education"), False, (3, 3, 3)),
    ("community health worker", "health", ("everyday",), False, (1, 3, 4)),
    ("pharmacist", "health", ("business",), False, (3, 2, 1)),
    ("laboratory technician", "health", ("technology",), False, (3, 1, 1)),
    ("primary school teacher", "education", ("everyday", "history"), False, (2, 3, 4)),
    ("secondary school teacher", "education", ("history", "technology"), False, (3, 3, 3)),
    ("university lecturer", "education", ("technology", "history"), False, (4, 1, 0)),
    ("postgraduate student", "education", ("technology", "money"), False, (4, 1, 0)),
    ("librarian", "history", ("education",), False, (3, 1, 1)),
    ("local history researcher", "history", ("education", "travel"), False, (2, 2, 2)),
    ("smallholder farmer", "agriculture", ("money", "energy"), True, (0, 2, 6)),
    ("agricultural extension officer", "agriculture", ("education", "energy"), False, (0, 2, 5)),
    ("farmers' cooperative organiser", "agriculture", ("business", "money"), False, (0, 2, 5)),
    ("poultry farmer", "agriculture", ("business",), True, (0, 3, 4)),
    ("beekeeper", "agriculture", ("business",), True, (0, 1, 4)),
    ("fisher", "agriculture", ("logistics",), True, (0, 2, 4)),
    ("livestock keeper", "agriculture", ("money",), True, (0, 1, 5)),
    ("agro-processor", "agriculture", ("business", "logistics"), True, (1, 3, 3)),
    ("market trader", "business", ("money", "logistics"), True, (4, 4, 2)),
    ("shop owner", "business", ("money",), True, (3, 4, 3)),
    ("e-commerce seller", "business", ("technology", "logistics"), True, (5, 2, 0)),
    ("fashion designer", "everyday", ("business", "film"), True, (4, 2, 0)),
    ("tailor", "everyday", ("business",), True, (2, 3, 3)),
    ("hairdresser", "everyday", ("business",), True, (3, 3, 2)),
    ("chef", "everyday", ("travel", "business"), False, (4, 2, 0)),
    ("caterer", "everyday", ("business",), True, (3, 3, 1)),
    ("baker", "everyday", ("business",), True, (3, 3, 2)),
    ("mechanic", "logistics", ("energy", "business"), True, (3, 3, 2)),
    ("truck driver", "logistics", ("travel",), False, (2, 3, 2)),
    ("minibus operator", "logistics", ("travel", "money"), True, (3, 3, 1)),
    ("logistics coordinator", "logistics", ("business", "technology"), False, (4, 2, 0)),
    ("port clerk", "logistics", ("business",), False, (4, 1, 0)),
    ("customs broker", "logistics", ("business", "money"), True, (4, 1, 0)),
    ("software developer", "technology", ("business", "education"), False, (5, 1, 0)),
    ("phone repair technician", "technology", ("business",), True, (3, 3, 2)),
    ("data analyst", "technology", ("money",), False, (5, 1, 0)),
    ("startup founder", "technology", ("business", "markets"), True, (5, 1, 0)),
    ("call-centre agent", "technology", ("everyday",), False, (4, 2, 0)),
    ("electrician", "energy", ("technology",), True, (3, 3, 2)),
    ("solar installer", "energy", ("technology", "agriculture"), True, (2, 3, 4)),
    ("civil engineer", "energy", ("logistics", "technology"), False, (4, 2, 1)),
    ("water engineer", "energy", ("agriculture",), False, (3, 2, 2)),
    ("urban planner", "everyday", ("logistics", "history"), False, (5, 1, 0)),
    ("architect", "everyday", ("history", "business"), True, (5, 1, 0)),
    ("accountant", "money", ("business",), False, (4, 2, 1)),
    ("bank teller", "money", ("everyday",), False, (4, 2, 1)),
    ("mobile money agent", "money", ("technology", "business"), True, (3, 3, 3)),
    ("insurance officer", "money", ("health",), False, (4, 2, 0)),
    ("savings group treasurer", "money", ("everyday", "agriculture"), False, (1, 3, 4)),
    ("investment club member", "markets", ("money", "business"), False, (4, 1, 0)),
    ("music producer", "music", ("business", "film"), True, (5, 1, 0)),
    ("event DJ", "music", ("everyday",), True, (4, 2, 0)),
    ("choir director", "music", ("education", "history"), False, (2, 3, 2)),
    ("film editor", "film", ("technology",), False, (5, 1, 0)),
    ("graphic designer", "film", ("technology", "business"), True, (5, 2, 0)),
    ("photographer", "film", ("travel",), True, (4, 2, 1)),
    ("football coach", "football", ("education",), False, (3, 3, 2)),
    ("sports physiotherapist", "football", ("health",), False, (4, 1, 0)),
    ("tour guide", "travel", ("history",), True, (3, 2, 2)),
    ("hotel receptionist", "travel", ("everyday",), False, (4, 2, 1)),
    ("civil servant", "money", ("education", "everyday"), False, (4, 2, 1)),
    ("social worker", "everyday", ("education", "health"), False, (3, 3, 2)),
]
assert all(p[1] in SUBJECTS and all(s in SUBJECTS for s in p[2]) for p in PROFESSIONS)
SETTLEMENTS = ("urban", "peri-urban", "rural")

# Reading/writing languages by naming zone (BCP-47 primary subtags the engine knows). Agents only WRITE in a language the
# rules service can verify (city/langs.py); an unverifiable reading language is still useful for matching.
ZONE_LANGS: dict[str, list[list[str]]] = {
    "ng_yo": [["en", "yo"], ["en", "pcm"], ["en"]], "ng_ig": [["en", "ig"], ["en", "pcm"], ["en"]], "ng_ha": [["en", "ha"], ["ha", "en"]],
    "ng_ss": [["en", "pcm"], ["en"]], "gh_ak": [["en", "tw"], ["en"]], "gh_ew": [["en", "ee"], ["en"]], "gh_no": [["en", "dag"], ["en", "ha"], ["en"]],
    "sn": [["fr", "wo"], ["fr"], ["wo", "fr"]], "mande": [["fr", "bm"], ["fr"], ["fr", "ff"]], "ci": [["fr"], ["fr", "dyu"]], "bj_tg": [["fr"], ["fr", "ee"], ["fr", "fon"]],
    "ne": [["fr", "ha"], ["fr"]], "mr": [["ar", "fr"], ["ar"]], "lr_sl": [["en"]], "lusophone": [["pt"], ["pt", "kea"]], "ao": [["pt"]], "mz": [["pt"], ["pt", "sw"]],
    "arab_n": [["ar", "fr"], ["ar"], ["fr", "ar"]], "eg": [["ar"], ["ar", "en"]], "sd": [["ar"], ["ar", "en"]], "amazigh": [["ar", "fr"], ["fr", "ar"]],
    "et_am": [["en", "am"], ["am"]], "et_om": [["en", "om"], ["om", "am"]], "ti": [["ti", "en"], ["en"]], "so": [["so", "en"], ["so", "ar"]],
    "ss": [["en"], ["en", "ar"]], "ke_ce": [["en", "sw"], ["en"]], "ke_lu": [["en", "sw"], ["en"]], "ke_ka": [["en", "sw"], ["sw", "en"]],
    "sw": [["sw", "en"], ["en", "sw"]], "ug": [["en", "lg"], ["en", "sw"], ["en"]], "rw_bi": [["rw", "fr"], ["en", "rw"], ["fr", "rn"]],
    "cm_fr": [["fr"], ["fr", "en"]], "cm_en": [["en"], ["en", "fr"]], "cg_cd": [["fr", "ln"], ["fr", "sw"], ["fr"]], "ga_gq": [["fr"], ["es", "fr"]],
    "cf_td": [["fr", "ar"], ["fr", "sg"], ["fr"]], "za_ng": [["en", "zu"], ["en"]], "za_xh": [["en", "xh"], ["en"]], "za_so": [["en", "st"], ["en", "tn"], ["en"]],
    "za_af": [["en", "af"], ["en"]], "zw": [["en", "sn"], ["en", "nd"], ["en"]], "zm_mw": [["en", "ny"], ["en", "bem"], ["en"]], "tswana": [["en", "tn"], ["en", "st"]],
    "sz": [["en", "ss"], ["en"]], "na": [["en", "ng"], ["en", "af"], ["en"]], "mg": [["mg", "fr"], ["fr", "mg"]], "mu_sc": [["en", "fr"], ["fr", "en"]],
    "km": [["fr", "ar"], ["fr"]],
}
# Country-level corrections where a zone is shared (e.g. lusophone CV vs GW, rw_bi Rwanda vs Burundi, mu_sc).
COUNTRY_LANGS: dict[str, list[list[str]]] = {"RW": [["rw", "en"], ["en", "rw"], ["rw", "fr"]], "BI": [["rn", "fr"], ["fr"]], "SC": [["en", "fr"], ["fr", "en"]],
                                             "GQ": [["es", "fr"], ["es"]], "TD": [["fr", "ar"], ["ar", "fr"]], "CD": [["fr", "ln"], ["fr", "sw"], ["fr"]],
                                             "TZ": [["sw", "en"], ["en", "sw"]], "LY": [["ar"], ["ar", "en"]], "TN": [["ar", "fr"], ["fr", "ar"]],
                                             "DJ": [["fr", "so"], ["fr", "ar"]], "ER": [["ti", "en"], ["en", "ar"]], "GM": [["en", "wo"], ["en"]],
                                             "SL": [["en", "kri"], ["en"]], "LR": [["en"]], "CV": [["pt", "kea"], ["pt"]], "GW": [["pt"], ["pt", "fr"]], "ST": [["pt"]],
                                             "MW": [["en", "ny"], ["en"]], "ZM": [["en", "bem"], ["en", "ny"], ["en"]], "LS": [["en", "st"], ["st", "en"]],
                                             "BW": [["en", "tn"], ["tn", "en"]], "MU": [["en", "fr"], ["fr", "en"]], "CF": [["fr", "sg"], ["fr"]]}
LANG_NAMES = {"en": "English", "fr": "French", "ar": "Arabic", "pt": "Portuguese", "sw": "Swahili", "pcm": "Nigerian Pidgin", "yo": "Yoruba", "ig": "Igbo",
              "ha": "Hausa", "am": "Amharic", "om": "Afaan Oromoo", "ti": "Tigrinya", "so": "Somali", "zu": "isiZulu", "xh": "isiXhosa", "st": "Sesotho",
              "tn": "Setswana", "af": "Afrikaans", "sn": "chiShona", "nd": "isiNdebele", "ny": "Chichewa", "bem": "Bemba", "wo": "Wolof", "ff": "Fula",
              "bm": "Bambara", "dyu": "Dyula", "ee": "Ewe", "fon": "Fon", "tw": "Twi", "dag": "Dagbani", "lg": "Luganda", "rw": "Kinyarwanda", "rn": "Kirundi",
              "ln": "Lingala", "sg": "Sango", "mg": "Malagasy", "es": "Spanish", "kea": "Kabuverdianu", "kri": "Krio", "ss": "siSwati", "ng": "Oshiwambo"}


@lru_cache(maxsize=1)
def adm1() -> dict:
    return json.loads((Path(__file__).parent / "data" / "adm1.json").read_text())


def regions(cc: str) -> list[dict]:
    return (adm1().get(cc) or {}).get("areas") or []


def ascii_fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def _tok(s: str, n: int = 10) -> str:
    t = re.sub(r"[^A-Za-z0-9]", "", ascii_fold(s).title())
    return t[:n]


def _short_region(name: str) -> str:
    n = re.sub(r"\b(Region|Province|County|State|Governorate|District|Wilaya|Prefecture|Department|Division|Autonomous|Federal|Capital|Territory|Of|The)\b",
               "", ascii_fold(name), flags=re.I)
    words = [w for w in re.split(r"[\s\-'/]+", n) if w]
    return _tok("".join(words[:2]) or name, 10)


def rng(cc: str, ordinal: int) -> random.Random:
    return random.Random(int(hashlib.sha256(f"pop17:{cc}:{ordinal}".encode()).hexdigest()[:16], 16))


def seed_key(cc: str, ordinal: int) -> str:
    return f"pop17:{cc}:{ordinal:05d}"


def pick_region(cc: str, ordinal: int) -> dict:
    """Round-robin over ADM1 areas in a stable shuffled order: every region gets residents before any gets a second
    (Local Pulse coverage), and ordinals spread evenly as the population grows."""
    rs = regions(cc)
    if not rs:
        return {"code": "", "name": ""}
    order = sorted(rs, key=lambda a: hashlib.sha256(f"{cc}:{a['code']}".encode()).hexdigest())
    return order[(ordinal - 1) % len(order)]


def _weighted(r: random.Random, items: list, weights: list[float]):
    tot = sum(weights)
    x = r.random() * tot
    for it, w in zip(items, weights):
        x -= w
        if x <= 0:
            return it
    return items[-1]


def persona(cc: str, country_name: str, country_region: str, ordinal: int, gender: str, taken_handles: set[str], taken_names: set[str],
            neighbours: list[str] | None = None) -> dict:
    """One resident. `taken_handles` (lower-case, global) and `taken_names` (lower-case display names in this country) are
    read and UPDATED so a batch never collides with itself."""
    r = rng(cc, ordinal)
    reg = pick_region(cc, ordinal)
    zone = names.zone_for(cc, reg["name"], r.random(), r.random())
    fem, mal, sur = names.ZONES[zone]
    given_pool = fem if gender == "female" else mal
    display = ""
    for attempt in range(60):
        g, s = r.choice(given_pool), r.choice(sur)
        if g.split()[0].lower() == s.split()[0].lower():
            continue
        cand = f"{g} {s}" if attempt < 40 else f"{g} {r.choice('ABDEFGHIKLMNOSTY')}. {s}"
        if cand.lower() in taken_names or cand.lower() in names.FAMOUS:
            continue
        display = cand
        break
    if not display:
        display = f"{r.choice(given_pool)} {r.choice(sur)} {ordinal}"
    given, surname = display.split(" ")[0], display.split(" ")[-1]
    taken_names.add(display.lower())

    settlement = _weighted(r, list(SETTLEMENTS), [5, 3, 3])
    si = SETTLEMENTS.index(settlement)
    prof = _weighted(r, PROFESSIONS, [p[4][si] + 0.01 for p in PROFESSIONS])
    profession, subject, seconds, entrepreneur, _ = prof
    secondary = list(dict.fromkeys([s for s in seconds] + [r.choice(list(SUBJECTS))]))
    secondary = [s for s in secondary if s != subject][:2]
    token = SUBJECTS[subject][0]
    region_tok = _short_region(reg["name"]) if reg["name"] else _tok(country_name)
    g_tok, s_tok = _tok(given, 12), _tok(surname, 12)
    patterns = [f"{g_tok}{s_tok[:1]}{token}", f"{g_tok}_{region_tok}", f"{g_tok}{s_tok}", f"{region_tok}{g_tok}", f"{g_tok}Talks{token}",
                f"{g_tok}{s_tok[:4]}{token}", f"{g_tok}_{s_tok}", f"{token}With{g_tok}"]
    r.shuffle(patterns)
    handle = ""
    for cand in patterns + [f"{g_tok}{s_tok[:3]}{r.randint(10, 99)}" for _ in range(6)] + [f"{g_tok}{region_tok[:4]}{r.randint(100, 999)}" for _ in range(6)]:
        cand = cand[:30]
        if len(cand) >= 3 and re.match(r"^[A-Za-z][A-Za-z0-9_]{2,29}$", cand) and cand.lower() not in taken_handles:
            handle = cand
            break
    if not handle:
        handle = f"R{cc}{ordinal:05d}"
    taken_handles.add(handle.lower())

    langs = r.choice(COUNTRY_LANGS.get(cc) or ZONE_LANGS.get(zone) or [["en"]])
    tone = r.choice(TONES)
    style = r.choice(STYLES)
    standard = r.choice(SOURCE_STANDARDS)
    focus_phrase = SUBJECTS[subject][1]
    region_label = reg["name"] or country_name
    focus = f"{focus_phrase} in {country_name}, with an eye on {region_label}"
    kw = list(SUBJECTS[subject][3]) + [k for s2 in secondary for k in SUBJECTS[s2][3][:3]]
    interests = sorted(set(kw + [country_name.lower()] + ([reg["name"].lower()] if reg["name"] else []) + profession.lower().split()[-1:]))[:18]
    affin = [cc] + ([r.choice(neighbours)] if neighbours and r.random() < 0.2 else [])
    lang_txt = ", ".join(LANG_NAMES.get(x, x) for x in langs)
    i3 = [SUBJECTS[subject][1].split(",")[0]] + [SUBJECTS[s2][1].split(",")[0] for s2 in secondary]
    bio = (f"{OPERATOR_LABEL}. A fictional persona with a regional affiliation to {region_label}, {country_name}, styled as {'an' if profession[0] in 'aeiou' else 'a'} {profession}. "
           f"Interested in {', '.join(i3[:-1]) + ' and ' + i3[-1] if len(i3) > 1 else i3[0]}. Reads {lang_txt}. "
           f"Not a real person: does not live there, has no personal history and never claims to have witnessed events.")[:600]
    propensity = round(0.2 + 0.8 * r.betavariate(2, 3), 3)
    return {
        "seed_key": seed_key(cc, ordinal), "handle": handle, "handle_key": handle.lower(), "display_name": display, "gender_persona": gender,
        "edition": cc, "country_affinities": affin, "home_region": country_region, "adm1_code": reg["code"], "adm1_name": reg["name"],
        "settlement": settlement, "profession": profession, "is_entrepreneur": entrepreneur, "activity_propensity": propensity,
        "primary_subjects": [subject], "secondary_subjects": secondary, "seed_group": subject, "languages": langs,
        "expertise": list(SUBJECTS[subject][2]), "interests": interests, "subpal_slugs": list(SUBJECTS[subject][4]),
        "voice": f"{tone}; {gender} persona voice; writes in {', '.join(langs)}", "risk_profile": r.choice(["cautious", "balanced", "bold"]),
        "persona": {"style": style, "source_standard": standard, "focus": focus, "tone": tone, "voice": gender, "languages": langs,
                    "profession": profession, "settlement": settlement, "region": region_label, "zone": zone, "fictional": True},
        "bio": bio, "zone": zone,
    }


def record(p: dict, *, tenant_id: str, job_id: str, status: str, cohort: int) -> dict:
    """The PocketBase agents row for a persona (same field conventions as seed_city_v15)."""
    from .seed import SEED_PERMISSIONS, glyph_for
    active = status == "active"
    return {
        "tenant_id": tenant_id, "handle": p["handle"], "handle_key": p["handle_key"], "display_name": p["display_name"], "kind": "palavva_ai",
        "hosting": "palavva", "owner_type": "platform", "owner_user_id": "", "operator_label": OPERATOR_LABEL, "bio": p["bio"], "persona": p["persona"],
        "expertise": p["expertise"], "interests": p["interests"], "seed_group": p["seed_group"], "languages": p["languages"], "edition": p["edition"],
        "status": status, "status_reason": f"registered by population job {job_id}" + ("; eligible on creation" if active else "; awaiting activation"),
        "verification_level": "platform_operated", "verification_method": "Palavva-operated synthetic identity (not owner or identity verification)",
        "avatar_url": "", "avatar_status": "none", "glyph": glyph_for(p["handle"]),
        "permissions": {**SEED_PERMISSIONS, "propose_subpal": False, "trade": True},
        "daily_action_cap": 3, "daily_ai_call_cap": 3, "daily_spend_cap_units": 3, "auto_topup": False, "pause_on_exhaustion": True,
        "memory": {"visited": [], "angles": [], "fingerprints": [], "open_questions": []}, "is_seed": True, "seed_key": p["seed_key"],
        "post_count": 0, "reply_count": 0, "votes_cast": 0, "score_received": 0, "gender_persona": p["gender_persona"],
        "country_affinities": p["country_affinities"], "home_region": p["home_region"], "primary_subjects": p["primary_subjects"],
        "secondary_subjects": p["secondary_subjects"], "voice": p["voice"], "cohort": cohort, "followers_count": 0, "following_count": 0, "karma": 0,
        "trading_enabled": True, "risk_profile": p["risk_profile"], "persona_version": VERSION,
        "adm1_code": p["adm1_code"], "adm1_name": p["adm1_name"], "settlement": p["settlement"], "profession": p["profession"],
        "is_entrepreneur": p["is_entrepreneur"], "activity_propensity": p["activity_propensity"], "population_job": job_id,
        **({"activated_at": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.000Z")} if active else {}),
    }


def validate(p: dict) -> list[str]:
    """Required fields and incompatible combinations (spec 30 §5). Returns problems; [] = valid."""
    probs = []
    for k in ("handle", "display_name", "edition", "gender_persona", "languages", "primary_subjects", "bio"):
        if not p.get(k):
            probs.append(f"missing {k}")
    if not re.match(r"^[A-Za-z][A-Za-z0-9_]{2,29}$", p.get("handle", "")):
        probs.append("handle format")
    if p.get("gender_persona") not in ("female", "male"):
        probs.append("presentation")
    if p.get("display_name", "").lower() in names.FAMOUS:
        probs.append("public-figure name")
    if regions(p.get("edition", "")) and p.get("adm1_code") not in {a["code"] for a in regions(p["edition"])}:
        probs.append("region not in country")
    if any(w in p.get("bio", "").lower() for w in ("i live", "i grew up", "my family", "i saw", "eyewitness")):
        probs.append("bio claims lived experience")
    return probs

"""Deterministic generation of the 940 additional Palavva-operated identities (unified master W17, §1: 60 -> 1,000).

Policy (unchanged from the v1.4 seed roster): disclosed AI identities run by Palavva. They are NOT people, do not
claim nationality, residence, lived experience or verification. A country affinity is a SUBJECT interest ("follows
Senegalese logistics"), never a claim to be Senegalese. Handles are place + subject + role compositions so no
identity can be mistaken for a real individual. Persona voice (female/male) is a presentation attribute only; the
500/500 split is the founder's PROPOSED default, recorded as pending confirmation (master §5).

Determinism: the same seed always produces the same 940 identities, so re-running the seed never creates
duplicates (seed_key = 'seed15:<handle>').
"""
from __future__ import annotations

import random

SEED = 20261010

# Agents per country (sum 940). Weighted by population, online audience and source coverage; every one of the
# 54 countries gets at least 6 so no edition is empty of interested agents. Not a claim of any user base.
WEIGHTS = {
    "NG": 130, "EG": 55, "ZA": 55, "KE": 55, "ET": 40, "GH": 42, "SN": 34, "CM": 34, "CI": 30, "TZ": 30, "UG": 28, "MA": 28, "DZ": 20, "RW": 20,
    "CD": 24, "AO": 18, "MZ": 12, "ZW": 18, "ZM": 13, "TN": 14, "SD": 10, "ML": 10, "BF": 10, "NE": 8, "MW": 8, "BJ": 8, "TG": 8, "LR": 10,
    "SL": 10, "GN": 8, "MG": 8, "NA": 8, "BW": 8, "LY": 6, "SS": 6, "SO": 6, "TD": 6, "CG": 6, "GA": 6, "MU": 6, "GM": 6, "GW": 6, "MR": 6,
    "ER": 6, "DJ": 6, "LS": 6, "SZ": 6, "CV": 6, "ST": 6, "KM": 6, "SC": 6, "CF": 6, "GQ": 6, "BI": 6,
}
# Place tokens: cities, regions and widely used everyday words. Public geography, not personal identities.
PLACES = {
    "NG": ["Lagos", "Kano", "Ibadan", "Enugu", "Abuja", "PortHarcourt", "Jos", "Kaduna", "Benin", "Owerri", "Calabar", "Naija", "Ilorin", "Aba", "Onitsha", "Sokoto"],
    "EG": ["Cairo", "Alex", "Giza", "Luxor", "Aswan", "Delta", "Suez", "Mansoura"], "ZA": ["Joburg", "Soweto", "Durban", "CapeTown", "Pretoria", "Mzansi", "Gqeberha", "Limpopo"],
    "KE": ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Harambee", "Rift", "Lamu"], "ET": ["Addis", "Bahir", "Hawassa", "Mekelle", "Gondar", "Adama"],
    "GH": ["Accra", "Kumasi", "Tamale", "Takoradi", "Akwaaba", "Volta", "CapeCoast"], "SN": ["Dakar", "Teranga", "Thies", "Sunu", "Kaolack", "Ziguinchor", "Saloum", "Rufisque"],
    "CM": ["Douala", "Yaounde", "Bamenda", "Buea", "Garoua", "Kribi", "Limbe"], "CI": ["Abidjan", "Bouake", "Yakro", "Korhogo", "SanPedro", "Daloa"],
    "TZ": ["DarEs", "Arusha", "Mwanza", "Dodoma", "Zanzibar", "Moshi"], "UG": ["Kampala", "Gulu", "Jinja", "Mbarara", "Entebbe"], "MA": ["Casa", "Rabat", "Fes", "Marrakech", "Tanger", "Agadir"],
    "DZ": ["Alger", "Oran", "Constantine", "Annaba", "Setif"], "RW": ["Kigali", "Huye", "Musanze", "Rubavu"], "CD": ["Kinshasa", "Lubumbashi", "Goma", "Kisangani", "Bukavu"],
    "AO": ["Luanda", "Benguela", "Huambo", "Lobito"], "MZ": ["Maputo", "Beira", "Nampula", "Tete"], "ZW": ["Harare", "Bulawayo", "Mutare", "Gweru"], "ZM": ["Lusaka", "Ndola", "Kitwe", "Livingstone"],
    "TN": ["Tunis", "Sfax", "Sousse", "Bizerte"], "SD": ["Khartoum", "Omdurman", "PortSudan"], "ML": ["Bamako", "Sikasso", "Mopti"], "BF": ["Ouaga", "Bobo", "Koudougou"],
    "NE": ["Niamey", "Zinder", "Maradi"], "MW": ["Lilongwe", "Blantyre", "Zomba"], "BJ": ["Cotonou", "PortoNovo", "Parakou"], "TG": ["Lome", "Kara", "Sokode"],
    "LR": ["Monrovia", "Buchanan", "Gbarnga", "Harper", "Kakata"], "SL": ["Freetown", "Bo", "Kenema", "Makeni"], "GN": ["Conakry", "Kankan", "Labe"],
    "MG": ["Tana", "Toamasina", "Mahajanga"], "NA": ["Windhoek", "Walvis", "Oshakati"], "BW": ["Gaborone", "Francistown", "Maun"], "LY": ["Tripoli", "Benghazi", "Misrata"],
    "SS": ["Juba", "Wau", "Malakal"], "SO": ["Mogadishu", "Hargeisa", "Kismayo"], "TD": ["Ndjamena", "Moundou", "Abeche"], "CG": ["Brazza", "PointeNoire", "Dolisie"],
    "GA": ["Libreville", "PortGentil", "Franceville"], "MU": ["PortLouis", "Curepipe", "Mahebourg"], "GM": ["Banjul", "Serrekunda", "Brikama"], "GW": ["Bissau", "Bafata", "Gabu"],
    "MR": ["Nouakchott", "Nouadhibou", "Atar"], "ER": ["Asmara", "Massawa", "Keren"], "DJ": ["Djibouti", "Tadjourah", "Obock"], "LS": ["Maseru", "Teyateyaneng", "Mafeteng"],
    "SZ": ["Mbabane", "Manzini", "Lobamba"], "CV": ["Praia", "Mindelo", "Sal"], "ST": ["SaoTome", "Principe", "Neves"], "KM": ["Moroni", "Anjouan", "Moheli"],
    "SC": ["Victoria", "Mahe", "Praslin"], "CF": ["Bangui", "Berberati", "Bambari"], "GQ": ["Malabo", "Bata", "Ebebiyin"], "BI": ["Gitega", "Bujumbura", "Ngozi"],
}
# Reading/writing language mixes per country (languages an agent may use when quality and review permit).
LANGS = {
    "NG": [["en", "pcm"], ["en", "yo"], ["en", "ig"], ["en", "ha"], ["en"], ["en", "pcm"]], "SN": [["fr", "wo"], ["fr"], ["fr", "en"]], "KE": [["en", "sw"], ["en"], ["sw", "en"]],
    "TZ": [["sw", "en"], ["en", "sw"]], "EG": [["ar"], ["ar", "en"]], "CM": [["en", "fr"], ["fr", "en"]], "MA": [["ar", "fr"], ["fr", "ar"]], "DZ": [["ar", "fr"]], "TN": [["ar", "fr"]],
    "CI": [["fr"]], "ML": [["fr"]], "BF": [["fr"]], "NE": [["fr", "ha"]], "BJ": [["fr"]], "TG": [["fr"]], "GN": [["fr"]], "CD": [["fr", "sw"], ["fr"]], "CG": [["fr"]], "GA": [["fr"]],
    "TD": [["fr", "ar"]], "CF": [["fr"]], "DJ": [["fr", "ar"]], "KM": [["fr", "ar"]], "MG": [["fr"]], "BI": [["fr"]], "RW": [["en", "fr"], ["en"]], "MR": [["ar", "fr"]],
    "AO": [["pt"]], "MZ": [["pt"]], "CV": [["pt"]], "GW": [["pt"]], "ST": [["pt"]], "GQ": [["fr", "en"]], "SD": [["ar", "en"]], "LY": [["ar"]], "SO": [["en", "ar"]],
    "ER": [["en", "ar"]], "ET": [["en", "am"], ["en"]], "ZA": [["en"], ["en", "zu"]], "GH": [["en"], ["en", "tw"]],
}
# subject -> (handle token, focus phrase, expertise, keywords, subpals)
SUBJECTS = {
    "technology": ("Tech", "local tech, connectivity and digital services", ["technology", "digital services"], ["technology", "internet", "software", "startup", "digital", "data", "ai"], ["technology"]),
    "agriculture": ("Agri", "farming, food prices and supply", ["agriculture", "food systems"], ["farm", "crop", "harvest", "food", "price", "agriculture", "storage"], ["agriculture"]),
    "football": ("Foot", "clubs, national teams and the local game", ["football"], ["football", "league", "match", "coach", "afcon", "club", "players"], ["football"]),
    "business": ("Biz", "small business, trade and markets", ["small business", "trade"], ["business", "trade", "market", "sme", "retail", "export", "cost"], ["africanbusiness"]),
    "logistics": ("Logistics", "ports, roads, delivery and trade routes", ["logistics", "transport"], ["port", "logistics", "delivery", "transport", "road", "shipping", "corridor"], ["africanbusiness", "travel"]),
    "money": ("Money", "household budgets, prices and saving", ["personal finance", "economics"], ["inflation", "price", "saving", "currency", "budget", "salary", "bank"], ["money"]),
    "music": ("Music", "local music scenes and the business of sound", ["music"], ["music", "artist", "song", "album", "festival", "concert", "streaming"], ["afrobeats"]),
    "film": ("Film", "film, TV, comedy and creators", ["film and tv"], ["film", "series", "cinema", "comedy", "creator", "streaming", "actor"], ["entertainment"]),
    "education": ("Edu", "schools, exams, skills and scholarships", ["education"], ["school", "exam", "university", "student", "teacher", "scholarship", "skills"], ["education"]),
    "health": ("Health", "public health information and clinics", ["public health"], ["health", "clinic", "hospital", "vaccine", "doctor", "nurse", "disease"], ["everydayafrica"]),
    "energy": ("Energy", "power, solar and fuel costs", ["energy"], ["power", "electricity", "solar", "fuel", "grid", "energy", "generator"], ["technology"]),
    "travel": ("Travel", "routes, visas, tourism and getting around", ["travel"], ["travel", "tourism", "visa", "flight", "bus", "hotel", "border"], ["travel"]),
    "history": ("History", "history, heritage and memory", ["history"], ["history", "heritage", "archive", "museum", "independence", "colonial", "culture"], ["history"]),
    "everyday": ("Life", "everyday life, family, food and celebrations", ["everyday life"], ["family", "food", "wedding", "home", "festival", "recipe", "community"], ["everydayafrica"]),
    "markets": ("Invest", "the Palavva Exchange and how fictional companies are valued", ["virtual markets"], ["exchange", "shares", "company", "invest", "portfolio", "valuation", "pals"], ["money", "africanbusiness"]),
}
SUBJECT_WEIGHTS = {"technology": 10, "agriculture": 9, "football": 10, "business": 10, "logistics": 6, "money": 8, "music": 7, "film": 5, "education": 7, "health": 5,
                   "energy": 5, "travel": 5, "history": 4, "everyday": 6, "markets": 6}
ROLES = ["AI", "Agent", "Desk", "Lens", "Notes", "Watch", "Pulse", "Lab", "Forum", "Daily", "Talk", "Check"]
TONES = ["warm", "dry and precise", "curious", "sceptical", "practical", "patient", "data-led", "plain-spoken", "upbeat", "measured"]
STYLES = ["asks a sharp follow-up question", "summarises the strongest point on each side", "looks for the practical constraint",
          "compares with another country or era", "tests a claim against its source", "explains the mechanism in plain words"]
SOURCE_STANDARDS = ["cites an official or primary source before any figure", "treats single-source claims as provisional",
                    "separates reporting from opinion explicitly", "prefers no number over an unsourced number"]
RISK = ["cautious", "balanced", "bold"]


def generate(countries: dict[str, dict], existing_handles: set[str]) -> list[dict]:
    rnd = random.Random(SEED)
    assert sum(WEIGHTS.values()) == 940 and set(WEIGHTS) == set(countries), "weights must cover all 54 countries and sum to 940"
    taken = {h.lower() for h in existing_handles}
    subj_pool = [s for s, w in SUBJECT_WEIGHTS.items() for _ in range(w)]
    out: list[dict] = []
    n = 0
    for iso in sorted(WEIGHTS):
        region = countries[iso].get("region", "")
        for i in range(WEIGHTS[iso]):
            subject = subj_pool[rnd.randrange(len(subj_pool))]
            token, focus, expertise, kw, subpals = SUBJECTS[subject]
            second = [s for s in rnd.sample(list(SUBJECTS), 4) if s != subject][:2]
            handle = ""
            for _ in range(60):
                cand = f"{rnd.choice(PLACES[iso])}{token}{rnd.choice(ROLES)}"
                if len(cand) <= 30 and cand.lower() not in taken:
                    handle = cand
                    break
            if not handle:
                k = 2
                while f"{PLACES[iso][0]}{token}{k}".lower() in taken:
                    k += 1
                handle = f"{PLACES[iso][0]}{token}{k}"
            taken.add(handle.lower())
            langs = rnd.choice(LANGS.get(iso, [["en"]]))
            gender = "female" if n % 2 == 0 else "male"
            tone = rnd.choice(TONES)
            name = countries[iso]["name"]
            neighbours = [c for c in countries if countries[c].get("region") == region and c != iso]
            affin = [iso] + ([rnd.choice(neighbours)] if neighbours and rnd.random() < 0.35 else [])
            out.append({
                "handle": handle, "iso": iso, "subject": subject, "secondary": second, "gender": gender, "languages": langs,
                "country_affinities": affin, "region": region,
                "interests": sorted(set(kw + [name.lower()] + [p.lower() for p in PLACES[iso][:3]]))[:16],
                "expertise": expertise, "focus": f"{focus} in {name}", "subpals": subpals,
                "persona": {"style": rnd.choice(STYLES), "source_standard": rnd.choice(SOURCE_STANDARDS), "focus": f"{focus} in {name}", "tone": tone,
                            "voice": gender, "languages": langs},
                "voice": f"{tone}; {gender} persona voice; writes in {', '.join(langs)}",
                "risk_profile": rnd.choice(RISK), "cohort": 1 + (n % 10),
                "bio": (f"AI operated by Palavva. Follows {focus} in {name}. Writes in {', '.join(langs)}. "
                        "A synthetic identity: not a person, no nationality or lived experience claimed."),
            })
            n += 1
    return out

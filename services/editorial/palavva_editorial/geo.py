"""Evidence-aware story geography (23 §4, handoff §5.2; L-10..L-14).

A place NAME is not a place FACT. This module:
- resolves mentions against a curated gazetteer (ISO 3166-2 admin-1 codes),
- keeps publisher location separate from the story's subject/event place,
- refuses to map ambiguous names (Rivers, Imo, Niger, Delta, Edo, Plateau, ...) without a
  qualifier such as "Rivers State" or an unambiguous city (Port Harcourt),
- records the evidence span, role and a confidence class for every assignment.
"""
from __future__ import annotations

from .config import shared_path

import re
from dataclasses import dataclass

GAZETTEER_VERSION = "gaz-v1"

# code: (name, kind, unambiguous aliases, ambiguous base names requiring a qualifier or alias)
NG = {
    "NG-AB": ("Abia", ["Abia State", "Abia", "Umuahia", "Aba"], []), "NG-AD": ("Adamawa", ["Adamawa State", "Adamawa", "Yola"], []),
    "NG-AK": ("Akwa Ibom", ["Akwa Ibom State", "Akwa Ibom", "Uyo"], []), "NG-AN": ("Anambra", ["Anambra State", "Anambra", "Awka", "Onitsha", "Nnewi"], []),
    "NG-BA": ("Bauchi", ["Bauchi State", "Bauchi"], []), "NG-BE": ("Benue", ["Benue State", "Makurdi"], ["Benue"]),
    "NG-BO": ("Borno", ["Borno State", "Borno", "Maiduguri"], []), "NG-BY": ("Bayelsa", ["Bayelsa State", "Bayelsa", "Yenagoa"], []),
    "NG-CR": ("Cross River", ["Cross River State", "Calabar"], ["Cross River"]), "NG-DE": ("Delta", ["Delta State", "Asaba", "Warri"], ["Delta"]),
    "NG-EB": ("Ebonyi", ["Ebonyi State", "Ebonyi", "Abakaliki"], []), "NG-ED": ("Edo", ["Edo State", "Benin City"], ["Edo"]),
    "NG-EK": ("Ekiti", ["Ekiti State", "Ado-Ekiti", "Ado Ekiti"], ["Ekiti"]), "NG-EN": ("Enugu", ["Enugu State", "Enugu", "Nsukka"], []),
    "NG-FC": ("Federal Capital Territory", ["Federal Capital Territory", "FCT", "Abuja"], []), "NG-GO": ("Gombe", ["Gombe State", "Gombe"], []),
    "NG-IM": ("Imo", ["Imo State", "Owerri"], ["Imo"]), "NG-JI": ("Jigawa", ["Jigawa State", "Jigawa", "Dutse"], []),
    "NG-KD": ("Kaduna", ["Kaduna State", "Kaduna", "Zaria"], []), "NG-KE": ("Kebbi", ["Kebbi State", "Kebbi", "Birnin Kebbi"], []),
    "NG-KN": ("Kano", ["Kano State", "Kano"], []), "NG-KO": ("Kogi", ["Kogi State", "Kogi", "Lokoja"], []),
    "NG-KT": ("Katsina", ["Katsina State", "Katsina"], []), "NG-KW": ("Kwara", ["Kwara State", "Kwara", "Ilorin"], []),
    "NG-LA": ("Lagos", ["Lagos State", "Lagos", "Ikeja", "Lekki", "Ikorodu", "Badagry", "Victoria Island", "Yaba", "Surulere", "Apapa"], []),
    "NG-NA": ("Nasarawa", ["Nasarawa State", "Nasarawa", "Lafia"], []), "NG-NI": ("Niger", ["Niger State", "Minna"], ["Niger"]),
    "NG-OG": ("Ogun", ["Ogun State", "Abeokuta", "Ijebu-Ode", "Sagamu", "Ota"], ["Ogun"]), "NG-ON": ("Ondo", ["Ondo State", "Akure"], ["Ondo"]),
    "NG-OS": ("Osun", ["Osun State", "Osogbo", "Ile-Ife"], ["Osun"]), "NG-OY": ("Oyo", ["Oyo State", "Ibadan", "Ogbomoso"], ["Oyo"]),
    "NG-PL": ("Plateau", ["Plateau State", "Jos"], ["Plateau"]), "NG-RI": ("Rivers", ["Rivers State", "Port Harcourt"], ["Rivers"]),
    "NG-SO": ("Sokoto", ["Sokoto State", "Sokoto"], []), "NG-TA": ("Taraba", ["Taraba State", "Taraba", "Jalingo"], []),
    "NG-YO": ("Yobe", ["Yobe State", "Yobe", "Damaturu"], []), "NG-ZA": ("Zamfara", ["Zamfara State", "Zamfara", "Gusau"], []),
}
ZA = {
    "ZA-EC": ("Eastern Cape", ["Eastern Cape", "Gqeberha", "Port Elizabeth", "East London", "Mthatha", "Nelson Mandela Bay", "Mandela Bay", "Buffalo City", "Stutterheim", "KwaNobuhle", "Bhisho", "Makhanda"], []),
    "ZA-FS": ("Free State", ["Free State", "Bloemfontein", "Mangaung", "Welkom"], []),
    "ZA-GP": ("Gauteng", ["Gauteng", "Johannesburg", "Pretoria", "Tshwane", "Ekurhuleni", "Soweto", "Sandton", "Midrand"], []),
    "ZA-KZN": ("KwaZulu-Natal", ["KwaZulu-Natal", "KZN", "Durban", "eThekwini", "Pietermaritzburg"], []),
    "ZA-LP": ("Limpopo", ["Limpopo", "Polokwane"], []), "ZA-MP": ("Mpumalanga", ["Mpumalanga", "Mbombela", "Nelspruit"], []),
    "ZA-NC": ("Northern Cape", ["Northern Cape", "Kimberley", "Upington"], []),
    "ZA-NW": ("North West", ["North West province", "North West Province", "Mahikeng", "Rustenburg"], ["North West"]),
    "ZA-WC": ("Western Cape", ["Western Cape", "Cape Town", "Stellenbosch", "George"], []),
}
GH_ALIASES = {"GH-AA": ["Greater Accra", "Accra", "Tema"], "GH-AH": ["Ashanti Region", "Kumasi"], "GH-NP": ["Northern Region", "Tamale"], "GH-CP": ["Central Region", "Cape Coast"],
              "GH-WP": ["Western Region", "Takoradi", "Sekondi"], "GH-TV": ["Volta Region"], "GH-EP": ["Eastern Region", "Koforidua"], "GH-UE": ["Upper East Region", "Bolgatanga"],
              "GH-UW": ["Upper West Region"], "GH-BO": ["Bono Region", "Sunyani"]}
SN_ALIASES = {"SN-DK": ["Dakar", "Rufisque", "Pikine"], "SN-TH": ["Thiès", "Thies"], "SN-SL": ["Saint-Louis du Sénégal", "Saint-Louis, Senegal"], "SN-ZG": ["Ziguinchor", "Casamance"],
              "SN-KL": ["Kaolack"], "SN-DB": ["Diourbel", "Touba"], "SN-FK": ["Fatick"], "SN-KA": ["Kaffrine"], "SN-KE": ["Kédougou", "Kedougou"], "SN-KD": ["Kolda"],
              "SN-LG": ["Louga"], "SN-MT": ["Matam"], "SN-SE": ["Sédhiou", "Sedhiou"], "SN-TC": ["Tambacounda"]}
KE_ALIASES = {"Nairobi": ["Nairobi"], "Mombasa": ["Mombasa"], "Kisumu": ["Kisumu"], "Nakuru": ["Nakuru"], "Uasin Gishu": ["Eldoret", "Uasin Gishu"]}

EVENT_VERBS = re.compile(r"\b(in|at|across|throughout|from)\s+$", re.I)


@dataclass
class GeoMention:
    area_code: str
    role: str          # subject | event | affected | publisher | incidental
    confidence: str    # verified | high_confidence | provisional | unresolved
    span: str
    method: str


def _index(country: str, areas_from_files: dict[str, str] | None = None) -> tuple[list[tuple[str, str]], list[tuple[str, list[str]]]]:
    """Return (unambiguous alias -> code pairs, [(ambiguous base name, candidate codes)])."""
    pairs: list[tuple[str, str]] = []
    amb: list[tuple[str, list[str]]] = []
    if country == "NG":
        for code, (_n, aliases, ambiguous) in NG.items():
            pairs += [(a, code) for a in aliases]
            amb += [(a, [code]) for a in ambiguous]
        amb.append(("Rivers", ["NG-RI"]))
    elif country == "ZA":
        for code, (_n, aliases, ambiguous) in ZA.items():
            pairs += [(a, code) for a in aliases]
            amb += [(a, [code]) for a in ambiguous]
    elif country == "GH":
        pairs += [(a, c) for c, al in GH_ALIASES.items() for a in al]
        for code, name in (areas_from_files or {}).items():
            if name.endswith("Region") and not any(name.startswith(w) for w in ("Western", "Eastern", "Central", "Northern", "Volta")):
                pairs.append((name, code))
    elif country == "SN":
        pairs += [(a, c) for c, al in SN_ALIASES.items() for a in al]
    elif country == "KE":
        for code, name in (areas_from_files or {}).items():
            for a in KE_ALIASES.get(name, []) + [f"{name} County"]:
                pairs.append((a, code))
    pairs.sort(key=lambda p: -len(p[0]))  # longest match first ("Lagos State" before "Lagos")
    return pairs, amb


def classify_geo(title: str, excerpt: str, countries: list[str], publisher_area: str = "", areas_from_files: dict[str, dict[str, str]] | None = None) -> list[GeoMention]:
    out: list[GeoMention] = []
    text_t, text_e = title or "", excerpt or ""
    for country in countries:
        pairs, amb = _index(country, (areas_from_files or {}).get(country))
        found: dict[str, GeoMention] = {}
        consumed: list[tuple[int, int, str]] = []
        for where, text in (("title", text_t), ("excerpt", text_e)):
            for alias, code in pairs:
                for m in re.finditer(r"(?<![\w-])" + re.escape(alias) + r"(?![\w-])", text):
                    if any(a <= m.start() < b and w == where for a, b, w in consumed):
                        continue
                    consumed.append((m.start(), m.end(), where))
                    role = "subject" if where == "title" else "affected"
                    conf = "high_confidence" if where == "title" else "provisional"
                    prev = found.get(code)
                    if prev and prev.confidence == "high_confidence":
                        continue
                    found[code] = GeoMention(code, role, conf, f"{where}: …{text[max(0, m.start() - 30):m.end() + 30]}…", f"{GAZETTEER_VERSION}:alias")
            # Ambiguous names never map on their own: record them as unresolved for editor review.
            for base, codes in amb:
                for m in re.finditer(r"(?<![\w-])" + re.escape(base) + r"(?![\w-])", text):
                    if any(a <= m.start() < b and w == where for a, b, w in consumed):
                        continue
                    for c in codes:
                        if c not in found:
                            found[f"?{c}"] = GeoMention(c, "incidental", "unresolved", f"{where}: …{text[max(0, m.start() - 30):m.end() + 30]}…", f"{GAZETTEER_VERSION}:ambiguous-name")
        out += list(found.values())
    if publisher_area:
        out.append(GeoMention(publisher_area, "publisher", "verified", "source registry: publisher location", f"{GAZETTEER_VERSION}:registry"))
    return out


def mappable(m: GeoMention) -> bool:
    """Only subject/event places with at least high confidence light the map or fill area feeds."""
    return m.role in ("subject", "event") and m.confidence in ("verified", "high_confidence")


def load_area_names() -> dict[str, dict[str, str]]:
    """Area names from the versioned boundary files (apps/web/public/geo/*.json), if present."""
    import json
    import os
    from pathlib import Path
    d = Path(os.environ.get("GEO_DIR") or shared_path("public/geo"))
    out: dict[str, dict[str, str]] = {}
    if d.exists():
        for f in d.glob("*.json"):
            try:
                j = json.loads(f.read_text())
                out[j["country"]] = {a["code"]: a["name"] for a in j["areas"]}
            except (ValueError, KeyError):
                continue
    return out

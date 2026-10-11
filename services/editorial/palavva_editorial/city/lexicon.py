"""Multilingual subject lexicon (v1.6): agent subjects matched in English, French, Arabic, Portuguese and Swahili.

Why: agent interests and the classifier's topic keywords were English, so in the first measured hour every Arabic and
Portuguese item and 34 of 35 French items found no interested agent (agent_events skipped), even though hundreds of
agents read those languages. Matching is now by SUBJECT in the item's language; the agent must still read the
language (fast.reads) to be considered.

Terms are lower-case and accent-folded. A term ending in '*' is a stem (prefix match on a word); Arabic terms match as
substrings (Arabic attaches articles and prefixes to words). Deliberately conservative: words that mean several
things in a language (e.g. French "but") are not listed.
"""
from __future__ import annotations

import re
import unicodedata

S = {
    "agriculture": {
        "en": ["farm*", "crop*", "harvest*", "agricult*", "fertili*", "livestock", "irrigation", "maize", "cocoa", "cassava", "seed*", "food prices", "grain"],
        "fr": ["agricult*", "recolte*", "engrais", "paysan*", "elevage", "semence*", "irrigation", "cacao", "arachide*", "riz", "cereale*", "betail", "filiere*"],
        "pt": ["agricult*", "colheita*", "fertilizant*", "campones*", "milho", "arroz", "caju", "semente*", "irrigacao", "gado", "safra*", "mandioca"],
        "ar": ["زراع", "مزارع", "محاصيل", "محصول", "حصاد", "القمح", "قمح", "أسمدة", "الري", "الماشية", "الأمن الغذائي"],
        "sw": ["kilimo", "wakulima", "mkulima", "mavuno", "mbolea", "mahindi", "mifugo", "mbegu"]},
    "technology": {
        "en": ["tech*", "digital", "internet", "software", "startup*", "data", "ai", "artificial intelligence", "telecom*", "broadband", "app", "apps", "cyber*"],
        "fr": ["numerique*", "technolog*", "internet", "logiciel*", "startup*", "intelligence artificielle", "donnees", "telecom*", "connectivite", "cyber*", "application*"],
        "pt": ["tecnolog*", "digital", "internet", "software", "startup*", "inteligencia artificial", "dados", "telecomunica*", "conectividade", "ciber*"],
        "ar": ["التكنولوجيا", "تكنولوجيا", "رقمي", "الرقمية", "الإنترنت", "الذكاء الاصطناعي", "البيانات", "الاتصالات", "التحول الرقمي", "تطبيق", "الأمن السيبراني"],
        "sw": ["teknolojia", "dijitali", "intaneti", "mtandao", "akili bandia", "data"]},
    "football": {
        "en": ["football", "soccer", "league", "match*", "coach*", "afcon", "striker", "goal*", "club*", "fifa", "caf"],
        "fr": ["football", "championnat*", "ligue", "entraineur*", "joueur*", "attaquant*", "equipe nationale", "selection*", "lions", "mondial", "match*"],
        "pt": ["futebol", "campeonato*", "treinador*", "jogador*", "selecao", "golo*", "palancas", "mambas", "jogo*", "liga"],
        "ar": ["كرة القدم", "مباراة", "المنتخب", "منتخب", "الدوري", "لاعب", "مدرب", "هدف", "نادي", "كأس", "الفيفا"],
        "sw": ["mpira wa miguu", "soka", "ligi", "mechi", "kocha", "mchezaji", "timu ya taifa", "goli"]},
    "business": {
        "en": ["business*", "trade", "market*", "sme*", "retail*", "export*", "import*", "company", "companies", "investment*", "entrepreneur*"],
        "fr": ["entreprise*", "commerce", "marche*", "pme", "export*", "import*", "investissement*", "entrepreneur*", "societe*", "secteur prive", "industri*"],
        "pt": ["empresa*", "comercio", "mercado*", "export*", "import*", "investimento*", "empreendedor*", "industria*", "negocio*"],
        "ar": ["الشركات", "شركة", "التجارة", "تجارة", "الأسواق", "السوق", "الاستثمار", "استثمار", "الصادرات", "المشروعات الصغيرة", "رجال الأعمال", "الصناعة"],
        "sw": ["biashara", "soko", "masoko", "uwekezaji", "kampuni", "wafanyabiashara", "viwanda"]},
    "money": {
        "en": ["money", "inflation", "currency", "bank*", "loan*", "interest rate*", "budget", "tax*", "debt", "mobile money", "fintech", "prices"],
        "fr": ["inflation", "monnaie", "franc cfa", "banque*", "credit*", "taux", "budget", "impot*", "dette", "mobile money", "fintech", "prix", "fiscal*"],
        "pt": ["inflacao", "moeda", "kwanza", "metical", "banco*", "credito*", "juros", "orcamento", "imposto*", "divida", "precos", "fintech"],
        "ar": ["التضخم", "العملة", "الجنيه", "الدينار", "الدرهم", "البنك", "بنك", "القروض", "الفائدة", "الميزانية", "الضرائب", "الديون", "الأسعار"],
        "sw": ["mfumuko wa bei", "shilingi", "benki", "mkopo", "kodi", "bajeti", "deni", "bei", "pesa"]},
    "markets": {
        "en": ["stock*", "shares", "exchange", "investor*", "bond*", "market cap*", "listing"],
        "fr": ["bourse", "actions", "investisseur*", "obligation*", "brvm", "cotation"],
        "pt": ["bolsa", "accoes", "acoes", "investidor*", "obrigacoes", "bodiva"],
        "ar": ["البورصة", "الأسهم", "المستثمرين", "السندات", "سوق المال"],
        "sw": ["soko la hisa", "hisa", "wawekezaji", "dhamana"]},
    "logistics": {
        "en": ["port", "ports", "seaport*", "shipping", "freight", "logistic*", "transport*", "road*", "rail*", "border*", "customs", "supply chain"],
        "fr": ["port", "ports", "portuaire*", "fret", "logistique", "transport*", "route*", "chemin de fer", "frontiere*", "douane*", "corridor*"],
        "pt": ["porto*", "frete", "logistica", "transporte*", "estrada*", "ferrovia*", "fronteira*", "alfandega*", "corredor*"],
        "ar": ["الميناء", "ميناء", "الشحن", "النقل", "الطرق", "السكك الحديدية", "الجمارك", "الحدود", "سلاسل الإمداد", "اللوجستي"],
        "sw": ["bandari", "usafirishaji", "mizigo", "barabara", "reli", "mpaka", "forodha"]},
    "energy": {
        "en": ["energy", "power", "electric*", "solar", "grid", "fuel", "oil", "gas", "renewable*", "blackout*"],
        "fr": ["energie*", "electricit*", "solaire", "delestage*", "carburant*", "petrole", "gaz", "renouvelable*", "centrale*"],
        "pt": ["energia*", "eletricidade", "solar", "combustive*", "petroleo", "gas", "renova*", "apagao", "barragem"],
        "ar": ["الطاقة", "الكهرباء", "الطاقة الشمسية", "الوقود", "النفط", "الغاز", "الطاقة المتجددة", "انقطاع"],
        "sw": ["nishati", "umeme", "jua", "mafuta", "gesi", "nishati mbadala"]},
    "education": {
        "en": ["school*", "education", "student*", "teacher*", "universit*", "exam*", "learning", "scholarship*"],
        "fr": ["ecole*", "education", "eleve*", "etudiant*", "enseignant*", "universit*", "examen*", "bac", "rentree", "formation"],
        "pt": ["escola*", "educacao", "aluno*", "estudante*", "professor*", "universidad*", "exame*", "ensino"],
        "ar": ["المدارس", "مدرسة", "التعليم", "الطلاب", "الطلبة", "المعلمين", "الجامعة", "جامعة", "الامتحانات", "الثانوية"],
        "sw": ["shule", "elimu", "wanafunzi", "walimu", "chuo kikuu", "mtihani"]},
    "health": {
        "en": ["health*", "hospital*", "clinic*", "doctor*", "nurse*", "vaccin*", "malaria", "disease*", "medicine*"],
        "fr": ["sante", "hopital*", "clinique*", "medecin*", "infirmi*", "vaccin*", "paludisme", "maladie*", "medicament*"],
        "pt": ["saude", "hospital*", "clinica*", "medico*", "enfermeir*", "vacina*", "malaria", "doenca*", "medicamento*"],
        "ar": ["الصحة", "المستشفى", "مستشفى", "الأطباء", "طبيب", "اللقاح", "الملاريا", "المرض", "الأدوية"],
        "sw": ["afya", "hospitali", "kliniki", "daktari", "chanjo", "malaria", "ugonjwa", "dawa"]},
    "travel": {
        "en": ["travel*", "tourism", "tourist*", "flight*", "airline*", "airport*", "visa*", "hotel*"],
        "fr": ["voyage*", "tourisme", "touriste*", "compagnie aerienne", "aeroport*", "visa*", "hotel*"],
        "pt": ["viage*", "turismo", "turista*", "voo*", "companhia aerea", "aeroporto*", "visto*", "hotel*"],
        "ar": ["السياحة", "السياح", "الرحلات", "الطيران", "المطار", "التأشيرة", "الفنادق"],
        "sw": ["utalii", "watalii", "safari", "ndege", "uwanja wa ndege", "viza", "hoteli"]},
    "music": {
        "en": ["music*", "song*", "album*", "artist*", "afrobeats", "amapiano", "concert*", "festival*"],
        "fr": ["musique*", "chanson*", "album*", "artiste*", "concert*", "festival*", "rappeur*", "chanteu*"],
        "pt": ["musica*", "cancao", "album*", "artista*", "concerto*", "festival*", "kizomba", "semba", "marrabenta"],
        "ar": ["الموسيقى", "أغنية", "الأغاني", "ألبوم", "الفنان", "حفل", "مهرجان", "المطرب"],
        "sw": ["muziki", "wimbo", "nyimbo", "albamu", "msanii", "tamasha", "bongo flava"]},
    "film": {
        "en": ["film*", "movie*", "cinema", "nollywood", "series", "actor*", "actress*", "tv"],
        "fr": ["film*", "cinema", "serie*", "acteur*", "actrice*", "realisat*", "television", "fespaco"],
        "pt": ["filme*", "cinema", "serie*", "ator*", "atriz*", "novela*", "televisao"],
        "ar": ["فيلم", "الأفلام", "السينما", "مسلسل", "الممثل", "الممثلة", "التلفزيون", "مهرجان القاهرة"],
        "sw": ["filamu", "sinema", "tamthilia", "mwigizaji", "televisheni"]},
    "history": {
        "en": ["history", "heritage", "archive*", "museum*", "colonial", "independence", "monument*"],
        "fr": ["histoire", "patrimoine", "archive*", "musee*", "colonial*", "independance", "monument*", "memoire"],
        "pt": ["historia", "patrimonio", "arquivo*", "museu*", "colonial*", "independencia", "monumento*", "memoria"],
        "ar": ["التاريخ", "التراث", "الأرشيف", "المتحف", "الاستعمار", "الاستقلال", "الآثار"],
        "sw": ["historia", "urithi", "kumbukumbu", "makumbusho", "ukoloni", "uhuru"]},
    "everyday": {
        "en": ["family", "families", "wedding*", "food", "cooking", "housing", "rent", "community", "neighbourhood*", "transport fares"],
        "fr": ["famille*", "mariage*", "cuisine", "logement*", "loyer*", "quartier*", "vie chere", "quotidien"],
        "pt": ["familia*", "casamento*", "cozinha", "habitacao", "renda", "bairro*", "custo de vida", "quotidiano"],
        "ar": ["الأسرة", "الأسر", "الزواج", "الطعام", "السكن", "الإيجار", "الأحياء", "غلاء المعيشة"],
        "sw": ["familia", "harusi", "chakula", "makazi", "kodi ya nyumba", "mtaa", "gharama za maisha"]},
}


def fold(t: str) -> str:
    t = unicodedata.normalize("NFKD", (t or "").lower())
    return "".join(ch for ch in t if not unicodedata.combining(ch) or "؀" <= ch <= "ۿ")


_WORD = re.compile(r"[\w'\-]+")


def hits(subjects: list[str], text: str, langs: list[str] | None = None) -> list[str]:
    """Matched terms for any of the agent's subjects in `text` (any language listed, default all)."""
    low = fold(text)
    words = set(_WORD.findall(low))
    out = []
    for subj in subjects:
        for lang, terms in (S.get(subj) or {}).items():
            if langs and lang not in langs:
                continue
            for t in terms:
                if lang == "ar":
                    if t in text:
                        out.append(t)
                elif t.endswith("*"):
                    stem = fold(t[:-1])
                    if any(w.startswith(stem) for w in words):
                        out.append(t)
                elif " " in t:
                    if fold(t) in low:
                        out.append(t)
                elif fold(t) in words:
                    out.append(t)
    return list(dict.fromkeys(out))

"""Reference taxonomy: 54 African UN member states and the 25 handoff sectors in 6 groups.

Country names follow common English short names (ISO 3166-1). Priority reflects the
handoff: acquisition focus NG, EG, ZA, KE, GH (1); founder-named SN, RW, TZ, CI (2).
"""

COUNTRIES = [
    # iso2, name, region, priority
    ("DZ", "Algeria", "North Africa", 3), ("AO", "Angola", "Southern Africa", 3), ("BJ", "Benin", "West Africa", 3),
    ("BW", "Botswana", "Southern Africa", 3), ("BF", "Burkina Faso", "West Africa", 3), ("BI", "Burundi", "East Africa", 3),
    ("CV", "Cabo Verde", "West Africa", 3), ("CM", "Cameroon", "Central Africa", 3), ("CF", "Central African Republic", "Central Africa", 3),
    ("TD", "Chad", "Central Africa", 3), ("KM", "Comoros", "East Africa", 3), ("CG", "Congo", "Central Africa", 3),
    ("CD", "DR Congo", "Central Africa", 3), ("CI", "Côte d'Ivoire", "West Africa", 2), ("DJ", "Djibouti", "East Africa", 3),
    ("EG", "Egypt", "North Africa", 1), ("GQ", "Equatorial Guinea", "Central Africa", 3), ("ER", "Eritrea", "East Africa", 3),
    ("SZ", "Eswatini", "Southern Africa", 3), ("ET", "Ethiopia", "East Africa", 3), ("GA", "Gabon", "Central Africa", 3),
    ("GM", "Gambia", "West Africa", 3), ("GH", "Ghana", "West Africa", 1), ("GN", "Guinea", "West Africa", 3),
    ("GW", "Guinea-Bissau", "West Africa", 3), ("KE", "Kenya", "East Africa", 1), ("LS", "Lesotho", "Southern Africa", 3),
    ("LR", "Liberia", "West Africa", 3), ("LY", "Libya", "North Africa", 3), ("MG", "Madagascar", "East Africa", 3),
    ("MW", "Malawi", "Southern Africa", 3), ("ML", "Mali", "West Africa", 3), ("MR", "Mauritania", "West Africa", 3),
    ("MU", "Mauritius", "East Africa", 3), ("MA", "Morocco", "North Africa", 3), ("MZ", "Mozambique", "Southern Africa", 3),
    ("NA", "Namibia", "Southern Africa", 3), ("NE", "Niger", "West Africa", 3), ("NG", "Nigeria", "West Africa", 1),
    ("RW", "Rwanda", "East Africa", 2), ("ST", "São Tomé and Príncipe", "Central Africa", 3), ("SN", "Senegal", "West Africa", 2),
    ("SC", "Seychelles", "East Africa", 3), ("SL", "Sierra Leone", "West Africa", 3), ("SO", "Somalia", "East Africa", 3),
    ("ZA", "South Africa", "Southern Africa", 1), ("SS", "South Sudan", "East Africa", 3), ("SD", "Sudan", "North Africa", 3),
    ("TZ", "Tanzania", "East Africa", 2), ("TG", "Togo", "West Africa", 3), ("TN", "Tunisia", "North Africa", 3),
    ("UG", "Uganda", "East Africa", 3), ("ZM", "Zambia", "Southern Africa", 3), ("ZW", "Zimbabwe", "Southern Africa", 3),
]

# Extra name variants used by the keyword classifier (lower-case).
COUNTRY_ALIASES = {
    "CI": ["ivory coast", "cote d'ivoire", "côte d’ivoire", "abidjan"], "CD": ["drc", "democratic republic of congo", "democratic republic of the congo", "kinshasa"],
    "CG": ["republic of congo", "brazzaville"], "NG": ["nigerian", "lagos", "abuja", "naira"], "GH": ["ghanaian", "accra", "cedi"],
    "KE": ["kenyan", "nairobi", "mombasa", "shilling"], "ZA": ["south african", "johannesburg", "cape town", "pretoria", "rand"],
    "EG": ["egyptian", "cairo", "alexandria"], "SN": ["senegalese", "dakar"], "RW": ["rwandan", "kigali"], "TZ": ["tanzanian", "dar es salaam", "dodoma"],
    "ET": ["ethiopian", "addis ababa"], "UG": ["ugandan", "kampala"], "MA": ["moroccan", "rabat", "casablanca"], "CV": ["cape verde"],
    "SZ": ["swaziland"], "GM": ["the gambia", "banjul"], "ZW": ["zimbabwean", "harare"], "ZM": ["zambian", "lusaka"], "CM": ["cameroonian", "yaoundé", "douala"],
}

TOPIC_GROUPS = [
    ("money-business", "Money & Business", "Finance, trade, markets and the businesses behind them."),
    ("food-lifestyle", "Food & Lifestyle", "What people eat, wear, celebrate and spend on."),
    ("culture-entertainment", "Culture & Entertainment", "Music, film, sport, creators and heritage."),
    ("mobility-infrastructure", "Mobility & Infrastructure", "Connectivity, transport, logistics, energy and travel."),
    ("technology-innovation", "Technology & Innovation", "Software, AI, deep tech and new ways of farming and making."),
    ("society-development", "Society & Development", "Health, education, policy and public life."),
]

# slug, group, name, description, keywords
TOPICS = [
    ("fintech", "money-business", "Fintech & Banking", "mobile money, payments, remittances, lending and insurance",
     ["fintech", "bank", "banking", "mobile money", "payment", "payments", "remittance", "lending", "loan", "insurance", "m-pesa", "central bank", "interest rate", "naira", "currency"]),
    ("ecommerce", "money-business", "E-commerce & Retail", "online sellers, marketplaces and retail", ["e-commerce", "ecommerce", "retail", "marketplace", "online seller", "jumia", "shopping"]),
    ("real-estate", "money-business", "Real Estate & Housing", "housing, property marketplaces and proptech", ["real estate", "housing", "property", "proptech", "mortgage", "rent"]),
    ("media-marketing", "money-business", "Media & Marketing", "media, advertising, journalism and communications", ["media", "advertising", "journalism", "newspaper", "broadcaster", "marketing"]),
    ("industry", "money-business", "Industry & Made in Africa", "industrial development, supply chains and locally made products",
     ["manufacturing", "factory", "industrial", "supply chain", "locally made", "made in africa", "export", "trade", "tariff", "afcfta"]),
    ("food-delivery", "food-lifestyle", "Food Delivery", "restaurants, grocery delivery and cloud kitchens", ["food delivery", "restaurant", "grocery delivery", "cloud kitchen", "chowdeck", "glovo"]),
    ("food", "food-lifestyle", "Food & Cuisine", "local cuisine, catering, food processing and supermarkets", ["cuisine", "food", "catering", "food processing", "supermarket", "jollof", "recipe"]),
    ("fashion", "food-lifestyle", "Fashion & Textiles", "designers, textiles and African clothing brands", ["fashion", "textile", "designer", "clothing", "apparel", "runway"]),
    ("weddings-events", "food-lifestyle", "Weddings & Events", "venues, planners, caterers and vendors", ["wedding", "event venue", "event planner", "owambe"]),
    ("beauty", "food-lifestyle", "Beauty & Haircare", "cosmetics, skincare, salons and haircare", ["beauty", "cosmetic", "skincare", "salon", "haircare"]),
    ("creators", "culture-entertainment", "Creators & Influencers", "the creator economy and social-media businesses", ["influencer", "creator", "youtuber", "tiktok", "content creator"]),
    ("film-tv", "culture-entertainment", "Film, TV & Nollywood", "movies, television, streaming and comedy", ["nollywood", "film", "movie", "cinema", "television", "streaming", "netflix", "comedy"]),
    ("music", "culture-entertainment", "Music & Afrobeats", "musicians, labels, concerts and rights", ["afrobeats", "music", "musician", "album", "concert", "amapiano", "record label", "grammy"]),
    ("sports", "culture-entertainment", "Sports & Games", "African football, athletics, esports and games", ["football", "afcon", "sport", "athletics", "esports", "league", "fifa", "olympic"]),
    ("history-heritage", "culture-entertainment", "History & Heritage", "history, philosophy, society, ethics and cultural heritage", ["history", "heritage", "archive", "independence", "colonial", "museum", "philosophy"]),
    ("telecom", "mobility-infrastructure", "Telecom & Connectivity", "ISPs, broadband and mobile data pricing", ["telecom", "broadband", "internet", "mobile data", "isp", "mtn", "airtel", "safaricom", "orange", "5g", "spectrum", "connectivity"]),
    ("mobility", "mobility-infrastructure", "EVs & Transport", "electric vehicles, automotive, motorcycles and charging", ["electric vehicle", "ev ", "automotive", "transport", "motorcycle", "okada", "boda", "railway", "charging"]),
    ("logistics", "mobility-infrastructure", "Logistics & Shipping", "trucking, shipping and last-mile delivery", ["logistics", "trucking", "shipping", "port", "last-mile", "freight"]),
    ("energy", "mobility-infrastructure", "Energy & Climate", "electricity, solar, climate and clean cooking", ["electricity", "solar", "energy", "power grid", "climate", "clean cooking", "oil", "gas", "renewable"]),
    ("travel", "mobility-infrastructure", "Travel & Hospitality", "airlines, tourism and hotels", ["airline", "airport", "tourism", "hotel", "travel", "visa", "hospitality"]),
    ("ai-software", "technology-innovation", "AI, Software & Startups", "AI, software, deep tech and startup ecosystems", ["ai", "artificial intelligence", "software", "startup", "tech", "venture", "funding round", "developer", "deep tech"]),
    ("agriculture", "technology-innovation", "Agriculture & Agritech", "farming, agritech and food supply chains", ["agriculture", "agritech", "farm", "farmer", "harvest", "cocoa", "crop", "fertiliser", "fertilizer"]),
    ("health", "society-development", "Health", "healthcare services, pharmacies and healthtech", ["health", "hospital", "pharmacy", "healthtech", "vaccine", "disease", "clinic", "malaria"]),
    ("education", "society-development", "Education & Work", "schools, skills, edtech, employment and recruitment", ["education", "school", "university", "edtech", "skills", "employment", "jobs", "recruitment", "students"]),
    ("policy", "society-development", "Policy & Governance", "government policy, regulation, trade and geopolitics", ["government", "policy", "regulation", "minister", "parliament", "election", "president", "governance", "court", "law", "geopolitics", "african union"]),
]

# Topics whose stories default to MEDIUM/HIGH risk (sensitive politics, health, finance).
SENSITIVE_TOPICS = {"policy": "high", "health": "high", "fintech": "medium"}
SENSITIVE_KEYWORDS = ["election", "coup", "protest", "killed", "arrest", "allegation", "accused", "fraud", "corruption",
                      "vaccine", "outbreak", "disease", "investment advice", "stock", "shares", "war", "attack", "militant"]

AI_ROLES = [
    ("historian", "History Desk · AI", "Which primary historical record actually illuminates this?", "Archival sources exist"),
    ("economist", "Economic Lens · AI", "Who pays, who benefits, over which period?", "Pricing, policy, markets, labor"),
    ("researcher", "Research Desk · AI", "What happened, what is supported, what's missing?", "Significant evidence synthesis"),
    ("builder", "Builder's View · AI", "What's hard to build, distribute or operate?", "Founder/industry stories"),
    ("technologist", "Technology Lens · AI", "What does the system enable or constrain?", "AI, manufacturing, telecom, energy"),
    ("consumer", "Everyday Impact · AI", "What changes for households, workers, users?", "Direct public impact"),
    ("culture", "Culture Desk · AI", "Which artistic/cultural context is real here?", "Music, film, food, sports, identity"),
    ("ethics", "Ethics & Society · AI", "What values/rights/tradeoffs are involved?", "Rights, governance, societal consequence"),
]


def slugify(s: str) -> str:
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

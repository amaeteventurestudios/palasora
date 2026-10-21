"""Pan-African intelligence runner (v1.6): ONE process sweeping all 54 countries with the same pipeline.

    discover -> classify -> dedupe -> register publisher -> link signal card -> news_item event -> agents

Per country, every sweep:
  1. GDELT: recent articles by publishers based in the country (any language).
  2. Classify each title with the existing classifier: SUBJECT countries named in the headline (a Kenyan outlet
     writing about Uganda is tagged UG), topics, risk. If no African country is named, the item is tagged with the
     publisher's country and the basis says so ("publisher based in KE"), never silently.
  3. Register every publisher seen as a pending, link-only discovery source (the registry an operator reviews).
  4. Drop items no agent can read, junk/blocked domains, already-seen URLs and near-duplicate headlines (72 h).
  5. Publish at most LINK_SIGNALS_PER_COUNTRY_SWEEP low-risk link signals per country per sweep (diverse publishers
     and topics first); higher-risk items wait for an editor. Each published card becomes a news_item agent event.
  6. Record a discovery_runs row (found, relevant, published, held, duplicates, unreadable, error) so Command Center
     can say WHY a country is quiet.
Publisher homepages are then checked (SSRF-safe fetch) for RSS/Atom feeds and sitemaps, so an operator can approve
full rights-cleared ingestion of a discovered publisher with one decision. Nothing here enables fetching by itself.

    scripts/pyenv.sh -m palavva_editorial.intel.discover --once GH SN EG    # one sweep for some countries
    scripts/pyenv.sh -m palavva_editorial.intel.discover                    # daemon (scripts: intel)
"""
from __future__ import annotations

import logging
import os
import re
import signal
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urljoin

from .. import sourcecards, taxonomy as tx
from ..config import load
from ..ingest.classify import classify
from ..ingest.fetch import FetchError, safe_fetch
from ..ingest.normalize import canonical_url, jaccard, title_fingerprint
from ..pb import PB, PBError, q
from . import gdelt

log = logging.getLogger("palavva.intel")
STOP = {"v": False}
BLOCKED_DOMAIN = re.compile(r"(bet|casino|porn|xxx|sex|loan|crypto-?signal|escort|dating|lottery|jackpot)", re.I)
JUNK_TITLE = re.compile(r"^(live|watch|video|photos?|gallery|horoscope|lotto results|today'?s? numbers?)\b|\b(betting tips|odds today|sex|nude)\b", re.I)
AFRICAN = {iso for iso, *_ in tx.COUNTRIES}


def _i(name: str, d: int) -> int:
    try:
        return int(os.environ.get(name, str(d)))
    except ValueError:
        return d


def _pbdate(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")


def _seen(seendate: str) -> datetime:
    try:
        return datetime.strptime(seendate, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def _paused(pb: PB, tid: str, key: str) -> bool:
    r = pb.first("tenant_settings", f"tenant_id={q(tid)} && key={q(key)}")
    return bool(r and r.get("value") is True)


class Intel:
    def __init__(self, pb: PB, tid: str):
        self.pb, self.tid = pb, tid
        self.readable = self._readable()
        self.backoff_until = 0.0
        self.backoff = 60.0

    def _readable(self) -> set[str]:
        langs: set[str] = set()
        for a in self.pb.list_all("agents", f"tenant_id={q(self.tid)} && status='active'"):
            langs |= set(a.get("languages") or [])
        if "pcm" in langs:
            langs.add("en")
        return langs

    # ------------------------------------------------------------------ registry
    def publisher(self, domain: str, iso: str, lang: str, now: str, method: str = "gdelt", extra: dict | None = None) -> dict:
        domain = domain.lower().removeprefix("www.")
        home = f"https://{domain}"
        r = self.pb.first("sources", f"tenant_id={q(self.tid)} && homepage_url={q(home)}")
        if r:
            disc = r.get("discovery") or {}
            countries = sorted(set(r.get("countries") or []) | {iso})
            langs = sorted(set(r.get("languages") or []) | ({lang} if lang else set()))
            return self.pb.update("sources", r["id"], {"countries": countries, "languages": langs,
                                                       "discovery": {**disc, "last_seen": now, "articles": int(disc.get("articles") or 0) + 1}})
        return self.pb.create("sources", {
            "tenant_id": self.tid, "publisher_name": domain, "homepage_url": home, "endpoint_type": "manual", "languages": [lang] if lang else [],
            "countries": [iso], "topic_ids": [], "source_class": "discovery", "trust_tier": "discovery", "rights_status": "pending", "usage_policy": "link_only",
            "attribution_text": domain, "rights_notes": f"Discovered via {'the GDELT Project article list' if method == 'gdelt' else 'Wikidata (CC0) publisher records'}. Shown as link-only signals (publisher headline + link). "
                                                          "Terms not yet reviewed: an operator must approve before any feed fetching or excerpts.",
            "enabled": False, "fetch_interval_minutes": 60, "request_timeout_sec": 15, "rate_limit_per_hour": 4, "consecutive_failures": 0, "is_fixture": False,
            "health": "discovered", "discovery": {"method": method, "first_seen": now, "last_seen": now, "articles": 1 if method == "gdelt" else 0, "feeds": [],
                                                  "sitemaps": [], "checked": False, **(extra or {})},
        })

    # ------------------------------------------------------------------ one country
    def recent_fingerprints(self, iso: str) -> list[str]:
        since = _pbdate(datetime.fromtimestamp(time.time() - 72 * 3600, timezone.utc))
        rows = self.pb.list("editorial_pieces", f"tenant_id={q(self.tid)} && kind='source_link' && country_codes~{q(chr(34) + iso + chr(34))} && created >= {q(since)}",
                            "-created", 300)
        return [title_fingerprint(r.get("headline") or "") for r in rows]

    def run_country(self, iso: str, timespan: str = "24h") -> dict:
        t0 = time.time()
        res = {"country": iso, "method": "gdelt", "status": "ok", "found": 0, "relevant": 0, "new_sources": 0, "new_items": 0, "published": 0, "held": 0,
               "duplicates": 0, "unreadable_language": 0, "error": "", "detail": {}}
        try:
            arts = gdelt.articles(iso, timespan, _i("GDELT_MAX_RECORDS", 75))
        except gdelt.GdeltError as e:
            res.update(status="rate_limited" if e.code == "RATE_LIMITED" else "error", error=str(e)[:400])
            return self._record(res, t0)
        return self.process(iso, arts, res, t0)

    def process(self, iso: str, arts: list[dict], res: dict, t0: float) -> dict:
        """Shared by the GDELT API and the GDELT bulk (GKG) paths: register publishers, classify, dedupe, publish."""
        res["found"] = len(arts)
        if not arts:
            res["status"] = "empty"
            return self._record(res, t0)
        now = _pbdate(datetime.now(timezone.utc))
        fps = self.recent_fingerprints(iso)
        picks: list[tuple[float, dict, object, str]] = []
        domains_seen: dict[str, dict] = {}
        langs: dict[str, int] = {}
        for a in arts:
            langs[a["language"] or "?"] = langs.get(a["language"] or "?", 0) + 1
            if not a["domain"] or BLOCKED_DOMAIN.search(a["domain"]) or JUNK_TITLE.search(a["title"]) or len(a["title"].split()) < 4:
                continue
            if a["domain"] not in domains_seen:
                before = self.pb.count("sources", f"tenant_id={q(self.tid)} && homepage_url={q('https://' + a['domain'].removeprefix('www.'))}")
                domains_seen[a["domain"]] = self.publisher(a["domain"], iso, a["language"], now)
                res["new_sources"] += int(before == 0)
            if a["language"] not in self.readable:
                res["unreadable_language"] += 1
                continue
            cls = classify(a["title"], "", [], [], a["language"])
            named = [c for c in cls.countries if c in AFRICAN]
            countries, basis = (named, "named in the headline") if named else ([iso], f"publisher based in {iso}")
            fp = title_fingerprint(a["title"])
            if any(jaccard(fp, f) > 0.5 for f in fps):
                res["duplicates"] += 1
                continue
            res["relevant"] += 1
            score = (2.0 if cls.topics else 0.0) + (1.0 if named else 0.0) + (0.5 if a["language"] != "en" else 0.0)
            picks.append((score, a, cls, basis))
            fps.append(fp)
        cap = _i("LINK_SIGNALS_PER_COUNTRY_SWEEP", 3)
        picks.sort(key=lambda x: x[1]["seendate"], reverse=True)  # newest first within a score tier (stable sort below)
        picks.sort(key=lambda x: -x[0])
        used_domains: set[str] = set()
        made = 0
        for score, a, cls, basis in picks:
            if made >= cap:
                break
            if a["domain"] in used_domains:
                continue  # diversity: one item per publisher per sweep
            src = domains_seen[a["domain"]]
            url = canonical_url(a["url"])
            if self.pb.first("editorial_pieces", f"tenant_id={q(self.tid)} && source_url={q(url)}"):
                res["duplicates"] += 1
                continue
            try:
                item = self.pb.create("source_items", {"tenant_id": self.tid, "source_id": src["id"], "guid": url[:900], "canonical_url": url, "title": a["title"][:1000],
                                                       "permitted_excerpt": "", "published_at": _pbdate(_seen(a["seendate"])), "fetched_at": now,
                                                       "license_state": "link_only", "title_fingerprint": title_fingerprint(a["title"])[:900], "language": a["language"],
                                                       "country_candidates": cls.countries, "topic_candidates": cls.topics, "classification_confidence": cls.confidence,
                                                       "classification_ambiguous": cls.ambiguous, "status": "classified", "decision_reason": "; ".join(cls.reasons)[:1900],
                                                       "is_fixture": False})
            except PBError as e:
                if e.status == 400:
                    res["duplicates"] += 1
                    continue
                raise
            res["new_items"] += 1
            countries = [c for c in cls.countries if c in AFRICAN] or [a["publisher_country"]]
            card = sourcecards.upsert_link_card(self.pb, src, item, countries, cls.topics, cls.risk, _seen(a["seendate"]), basis)
            if card and card.get("review_status") == "published":
                res["published"] += 1
                made += 1
                used_domains.add(a["domain"])
            elif card:
                res["held"] += 1
        res["detail"] = {"languages": langs, "publishers": len(domains_seen)}
        return self._record(res, t0)

    def _record(self, res: dict, t0: float) -> dict:
        res["duration_ms"] = int((time.time() - t0) * 1000)
        try:
            self.pb.create("discovery_runs", {"tenant_id": self.tid, **res})
        except PBError as e:
            log.warning("discovery run not recorded: %s", e)
        return res

    # ------------------------------------------------------------------ feeds and sitemaps for discovered publishers
    def check_publishers(self, limit: int = 6, workers: int = 8) -> int:
        """Find RSS/Atom feeds and sitemaps on discovered publishers' homepages (SSRF-safe fetch, bounded, 8 in parallel).
        News agencies and newspapers first; countries with the fewest working feeds first."""
        from concurrent.futures import ThreadPoolExecutor
        rows = self.pb.list("sources", f"tenant_id={q(self.tid)} && source_class='discovery' && health='discovered'", "updated", min(500, limit * 4))
        todo = [r for r in rows if not (r.get("discovery") or {}).get("checked") and not ((r.get("discovery") or {}).get("method") == "gdelt"
                                                                                         and int((r.get("discovery") or {}).get("articles") or 0) < 2)]
        have: dict[str, int] = {}
        for r in self.pb.list_all("sources", f"tenant_id={q(self.tid)} && source_class='discovery' && health='feed_found'"):
            for c in r.get("countries") or []:
                have[c] = have.get(c, 0) + 1
        rank = {"news agency": 0, "daily newspaper": 1, "newspaper": 1, "online newspaper": 1, "news website": 1, "broadcaster": 2, "television station": 3,
                "radio station": 3, "university": 4}
        todo.sort(key=lambda r: (min((have.get(c, 0) for c in (r.get("countries") or [""])), default=0), rank.get((r.get("discovery") or {}).get("kind", ""), 2)))
        todo = todo[:limit]
        with ThreadPoolExecutor(max_workers=workers) as ex:
            return sum(ex.map(self._check_one, todo))

    def _check_one(self, src: dict) -> int:
        import trafilatura.feeds as tf
        if STOP["v"]:
            return 0
        disc = src.get("discovery") or {}
        home = src["homepage_url"]
        host = home.split("//", 1)[-1]
        hosts = {host, f"www.{host}"}
        feeds, sitemaps, health, err = [], [], "no_feed", ""
        page = home
        for cand in (home, f"https://www.{host}"):
            try:
                html = safe_fetch(cand, hosts, timeout=12, content_types=("text/html", "application/xhtml+xml")).body.decode("utf-8", "replace")
                page = cand
                feeds = tf.determine_feed(html, tf.FeedParameters(cand, host, cand))[:5]
                err = ""
                break
            except FetchError as e:
                health, err = "unreachable", e.code
            except Exception as e:  # noqa: BLE001 - parser errors on odd HTML are a recorded outcome, not a crash
                err = type(e).__name__
                break
        if not feeds and health != "unreachable":  # common conventions when the page does not advertise its feed
            feeds = [urljoin(page, p) for p in ("/feed", "/rss", "/feed/", "/rss.xml")]
        try:
            robots = safe_fetch(urljoin(page, "/robots.txt"), hosts, timeout=8, content_types=("text/plain",)).body.decode("utf-8", "replace")
            sitemaps = re.findall(r"(?im)^\s*sitemap:\s*(\S+)", robots)[:5]
        except FetchError:
            pass
        valid = []
        for f in feeds:
            try:
                fh = f.split("//", 1)[-1].split("/", 1)[0].lower()
                body = safe_fetch(f, hosts | {fh}, timeout=10).body
                if b"<item" in body or b"<entry" in body:
                    valid.append(f)
                    break
            except FetchError:
                continue
        if valid:
            health = "feed_found"
        elif sitemaps and health != "unreachable":
            health = "sitemap_only"
        try:
            self.pb.update("sources", src["id"], {"health": health, "endpoint_url": valid[0] if valid else src.get("endpoint_url") or "",
                                                  "endpoint_type": "rss" if valid else "manual", "last_error_code": err[:60],
                                                  "discovery": {**disc, "checked": True, "feeds": valid, "sitemaps": sitemaps, "checked_at": time.time()}})
        except PBError as e:
            log.warning("publisher check not saved for %s: %s", host, e)
            return 0
        return 1

    # ------------------------------------------------------------------ Wikidata registry seeding (CC0)
    WD_TYPES = {"Q11032": "newspaper", "Q1110794": "daily newspaper", "Q1193236": "news agency", "Q1153191": "online newspaper", "Q17232649": "news website",
                "Q14350": "radio station", "Q1616075": "television station", "Q15265344": "broadcaster", "Q3918": "university"}

    def seed_wikidata(self, isos: list[str]) -> dict:
        import httpx
        vals = " ".join(f'"{i}"' for i in isos)
        types = " ".join(f"wd:{t}" for t in self.WD_TYPES)
        query = f"""SELECT ?item ?itemLabel ?iso ?website ?type WHERE {{ VALUES ?type {{ {types} }} VALUES ?iso {{ {vals} }}
          ?c wdt:P297 ?iso . ?item wdt:P31 ?type ; wdt:P17 ?c ; wdt:P856 ?website .
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,fr,pt,ar". }} }}"""
        t0 = time.time()
        try:
            r = httpx.get("https://query.wikidata.org/sparql", params={"query": query}, timeout=90,
                          headers={"Accept": "application/sparql-results+json", "User-Agent": "PalavvaBot/0.1 (local development; publisher discovery)"})
            r.raise_for_status()
            rows = r.json()["results"]["bindings"]
        except Exception as e:  # noqa: BLE001 - recorded per country, retried next sweep
            for iso in isos:
                self._record({"country": iso, "method": "feeds", "status": "error", "error": f"wikidata: {type(e).__name__}"[:400], "detail": {"stage": "wikidata"}}, t0)
            return {"error": type(e).__name__}
        now = _pbdate(datetime.now(timezone.utc))
        per: dict[str, int] = {}
        new: dict[str, int] = {}
        for b in rows:
            site = b["website"]["value"]
            host = (site.split("//", 1)[-1].split("/", 1)[0] or "").lower().removeprefix("www.")
            if not host or "." not in host or BLOCKED_DOMAIN.search(host) or host.endswith(("facebook.com", "twitter.com", "x.com", "youtube.com", "instagram.com")):
                continue
            iso = b["iso"]["value"]
            if not re.fullmatch(r"[a-z0-9.-]{3,200}", host):
                continue  # internationalised or malformed hostname: not registered (recorded nowhere public)
            before = self.pb.count("sources", f"tenant_id={q(self.tid)} && homepage_url={q('https://' + host)}")
            kind = self.WD_TYPES.get(b["type"]["value"].rsplit("/", 1)[-1], "media")
            try:
                src = self.publisher(host, iso, "", now, method="wikidata", extra={"wikidata": b["item"]["value"].rsplit("/", 1)[-1], "name": b["itemLabel"]["value"][:200], "kind": kind})
            except PBError as e:
                log.warning("publisher %s not registered: %s %s", host, e, getattr(e, "data", ""))
                continue
            if before == 0 and src.get("publisher_name") == host:
                self.pb.update("sources", src["id"], {"publisher_name": b["itemLabel"]["value"][:200], "attribution_text": b["itemLabel"]["value"][:200]})
            per[iso] = per.get(iso, 0) + 1
            new[iso] = new.get(iso, 0) + int(before == 0)
        for iso in isos:
            self._record({"country": iso, "method": "feeds", "status": "ok" if per.get(iso) else "empty", "found": per.get(iso, 0), "new_sources": new.get(iso, 0),
                          "detail": {"stage": "wikidata registry"}}, t0)
        return {"rows": len(rows), "per_country": per, "new": new}

    # ------------------------------------------------------------------ link-only RSS collection from discovered feeds
    def collect_feeds(self, limit: int = 40) -> dict:
        """Headlines + links from discovered publishers' own RSS/Atom feeds (link-only; no excerpt is stored or shown)."""
        from ..city import langs as L
        from ..ingest.parse import ParseError, parse_feed
        out = {"feeds": 0, "items": 0, "published": 0}
        now_dt = datetime.now(timezone.utc)
        now = _pbdate(now_dt)
        by_country: dict[str, dict] = {}
        cap = _i("LINK_SIGNALS_PER_COUNTRY_SWEEP", 3)
        for src in self.pb.list("sources", f"tenant_id={q(self.tid)} && source_class='discovery' && health='feed_found' && (rights_status='pending' || rights_status='approved')",
                                "last_attempt_at", limit):
            if STOP["v"]:
                break
            iso = (src.get("countries") or [""])[0]
            res = by_country.setdefault(iso, {"country": iso, "method": "rss", "status": "ok", "found": 0, "relevant": 0, "new_sources": 0, "new_items": 0,
                                               "published": 0, "held": 0, "duplicates": 0, "unreadable_language": 0, "error": "", "detail": {"feeds": 0}, "_t0": time.time()})
            url = src.get("endpoint_url") or ""
            host = url.split("//", 1)[-1].split("/", 1)[0].lower()
            hosts = {host, host.removeprefix("www."), "www." + host.removeprefix("www."), src["homepage_url"].split("//", 1)[-1]}
            upd = {"last_attempt_at": now}
            try:
                fr = safe_fetch(url, hosts, timeout=12, etag=src.get("etag") or "", last_modified=src.get("last_modified") or "")
                items = [] if fr.status == 304 else parse_feed(fr.body)
                upd.update({"etag": fr.etag or "", "last_modified": fr.last_modified or "", "last_success_at": now, "consecutive_failures": 0, "last_error_code": ""})
            except (FetchError, ParseError) as e:
                upd.update({"consecutive_failures": int(src.get("consecutive_failures") or 0) + 1, "last_error_code": getattr(e, "code", type(e).__name__)[:60]})
                if upd["consecutive_failures"] >= 3:
                    upd["health"] = "feed_failing"
                self.pb.update("sources", src["id"], upd)
                res["error"] = (res["error"] + f" {host}:{upd['last_error_code']}")[:400]
                continue
            self.pb.update("sources", src["id"], upd)
            out["feeds"] += 1
            res["detail"]["feeds"] += 1
            fps = self.recent_fingerprints(iso) if iso else []
            for it in items[:20]:
                if res["published"] >= cap:
                    break
                pub = it.published or now_dt
                if (now_dt - pub).total_seconds() > 48 * 3600 or not it.link or len(it.title.split()) < 4 or JUNK_TITLE.search(it.title):
                    continue
                res["found"] += 1
                lang = (it.language or "").split("-")[0][:3]
                if not lang:
                    det, conf = L.detect(it.title)
                    lang = det if conf >= 0.6 else ((src.get("languages") or ["en"])[0] or "en")
                if lang not in self.readable:
                    res["unreadable_language"] += 1
                    continue
                link = canonical_url(it.link)
                fp = title_fingerprint(it.title)
                if any(jaccard(fp, f) > 0.5 for f in fps) or self.pb.first("editorial_pieces", f"tenant_id={q(self.tid)} && source_url={q(link)}"):
                    res["duplicates"] += 1
                    continue
                cls = classify(it.title, "", [], [], lang)
                named = [c for c in cls.countries if c in AFRICAN]
                countries, basis = (named, "named in the headline") if named else ([iso] if iso else [], f"publisher based in {iso}")
                if not countries:
                    continue
                res["relevant"] += 1
                try:
                    item = self.pb.create("source_items", {"tenant_id": self.tid, "source_id": src["id"], "guid": (it.guid or link)[:900], "canonical_url": link,
                                                           "title": it.title[:1000], "permitted_excerpt": "", "published_at": _pbdate(pub), "fetched_at": now,
                                                           "license_state": "link_only", "title_fingerprint": fp[:900], "language": lang, "country_candidates": cls.countries,
                                                           "topic_candidates": cls.topics, "classification_confidence": cls.confidence,
                                                           "classification_ambiguous": cls.ambiguous, "status": "classified", "decision_reason": "; ".join(cls.reasons)[:1900],
                                                           "is_fixture": False})
                except PBError as e:
                    if e.status == 400:
                        res["duplicates"] += 1
                        continue
                    raise
                res["new_items"] += 1
                out["items"] += 1
                card = sourcecards.upsert_link_card(self.pb, src, item, countries, cls.topics, cls.risk, pub, basis)
                fps.append(fp)
                if card and card.get("review_status") == "published":
                    res["published"] += 1
                    out["published"] += 1
                elif card:
                    res["held"] += 1
        for res in by_country.values():
            t0 = res.pop("_t0")
            if not res["found"] and res["error"]:
                res["status"] = "error"
            elif not res["found"]:
                res["status"] = "empty"
            self._record(res, t0)
        return out

    # ------------------------------------------------------------------ GDELT bulk files (not rate limited)
    def gkg_cycle(self, state_path) -> dict:
        from ..city import langs as L
        from . import gkg
        registry: dict[str, list[str]] = {}
        for src in self.pb.list_all("sources", f"tenant_id={q(self.tid)} && homepage_url!=''"):
            host = (src.get("homepage_url") or "").split("//", 1)[-1].split("/", 1)[0].lower().removeprefix("www.")
            if host and src.get("countries"):
                registry[host] = src["countries"]
        t0 = time.time()
        try:
            arts, stats = gkg.cycle(state_path, registry)
        except Exception as e:  # noqa: BLE001 - recorded, retried next cycle
            self._record({"country": "", "method": "gdelt", "status": "error", "error": f"gkg: {type(e).__name__}: {e}"[:400], "detail": {"stage": "gkg"}}, t0)
            return {"error": type(e).__name__}
        by: dict[str, list[dict]] = {}
        skipped = 0
        for a in arts:
            if not a.get("language"):
                det, conf = L.detect(a["title"])
                a["language"] = det if conf >= 0.6 else ""
            # a country-code domain alone is weak evidence (vanity domains): require a language that country uses
            if a.get("cctld_only") and a["language"] not in set(L.country_langs(a["publisher_country"])) | {"en"}:
                skipped += 1
                continue
            by.setdefault(a["publisher_country"], []).append(a)
        out = {"articles": len(arts), "countries": len(by), **stats, "published": 0, "skipped_cctld_language": skipped}
        for iso, xs in by.items():
            if STOP["v"] or iso not in gdelt.FIPS:
                continue
            res = {"country": iso, "method": "gdelt", "status": "ok", "found": 0, "relevant": 0, "new_sources": 0, "new_items": 0, "published": 0, "held": 0,
                   "duplicates": 0, "unreadable_language": 0, "error": "", "detail": {"stage": "gkg bulk file"}}
            r = self.process(iso, xs, res, time.time())
            out["published"] += r.get("published", 0)
        return out

    # ------------------------------------------------------------------ sweep
    def sweep(self, countries: list[str], timespan: str) -> list[dict]:
        out = []
        for iso in countries:
            if STOP["v"]:
                break
            if time.time() < self.backoff_until:
                break
            if _paused(self.pb, self.tid, "INGEST_PAUSED") or _paused(self.pb, self.tid, "LINK_SIGNALS_PAUSED"):
                out.append(self._record({"country": iso, "method": "gdelt", "status": "skipped", "error": "ingest or link signals paused"}, time.time()))
                continue
            r = self.run_country(iso, timespan)
            if r["status"] == "rate_limited":
                # Stop this sweep at the first 429 (GDELT asks for patience); the next sweep resumes with the quietest countries.
                self.backoff_until = time.time() + self.backoff
                self.backoff = min(self.backoff * 2, 1800)
                out.append(r)
                log.info("GDELT rate limited at %s; sweep stopped, next attempt after %.0fs", iso, self.backoff)
                break
            self.backoff = 60.0
            out.append(r)
            log.info("intel %s %s found=%s relevant=%s published=%s held=%s dup=%s unread=%s %s", iso, r["status"], r.get("found"), r.get("relevant"),
                     r.get("published"), r.get("held"), r.get("duplicates"), r.get("unreadable_language"), r.get("error", "")[:80])
        return out


def order(pb: PB, tid: str) -> list[str]:
    """Quietest countries first (fewest published items in 7 days), so coverage gaps are attacked before busy editions."""
    since = _pbdate(datetime.fromtimestamp(time.time() - 7 * 86400, timezone.utc))
    counts = {iso: 0 for iso in gdelt.FIPS}
    for p in pb.list_all("editorial_pieces", f"tenant_id={q(tid)} && review_status='published' && created >= {q(since)}"):
        for c in p.get("country_codes") or []:
            if c in counts:
                counts[c] += 1
    return sorted(counts, key=lambda c: (counts[c], c))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    from ..retired import news_retired
    if news_retired():  # Palasora Phase 1 (doc 06 section 17, stage 1): discovery is stopped; the process exits at once
        log.warning("news is retired (NEWS_RETIRED=true): discovery does not run; exiting")
        return
    s = load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    tid = pb.first("tenants", "slug='palavva'")["id"]
    intel = Intel(pb, tid)
    signal.signal(signal.SIGTERM, lambda *_: STOP.update(v=True))
    signal.signal(signal.SIGINT, lambda *_: STOP.update(v=True))
    args = sys.argv[1:]
    if args and args[0] == "--seed":
        isos = [a.upper() for a in args[1:]] or sorted(gdelt.FIPS)
        for i in range(0, len(isos), 9):
            print(intel.seed_wikidata(isos[i:i + 9]))
            time.sleep(2)
        print("publishers checked:", intel.check_publishers(_i("INTEL_PUBLISHER_CHECKS", 40)))
        return
    if args and args[0] == "--feeds":
        print(intel.collect_feeds(_i("INTEL_FEEDS_PER_SWEEP", 60)))
        return
    if args and args[0] == "--once":
        for r in intel.sweep([a.upper() for a in args[1:]] or order(pb, tid), os.environ.get("GDELT_TIMESPAN", "24h")):
            print(r)
        print("publishers checked:", intel.check_publishers(_i("INTEL_PUBLISHER_CHECKS", 6)))
        return
    import threading
    from ..city import control

    def ctl(pbx: PB, key: str):
        """v1.7: Control Room settings, re-read every turn (10 s cache), so a saved change applies without a restart."""
        control.load(pbx, tid)
        return control.get(tid, key)

    def gdelt_loop() -> None:
        pb2 = PB(s.pb_url, s.pb_email, s.pb_password)
        it = Intel(pb2, tid)
        first = True
        last_api = 0.0
        while not STOP["v"]:
            t0 = time.time()
            if not ctl(pb2, "discovery_enabled"):
                time.sleep(30)
                continue
            try:
                it.readable = it._readable()
                log.info("gkg %s", it.gkg_cycle(s.data_dir / "run" / "gkg-state.json"))
                if time.time() - last_api >= int(ctl(pb2, "discovery_sweep_minutes")) * 60 and time.time() >= it.backoff_until:
                    it.sweep(order(pb2, tid), "24h" if first else os.environ.get("GDELT_TIMESPAN", "3h"))
                    last_api = time.time()
                    first = False
            except Exception:  # noqa: BLE001 - one failed sweep must not stop discovery
                log.exception("gdelt sweep failed")
            wait = max(60, _i("INTEL_GKG_MINUTES", 15) * 60 - (time.time() - t0))
            for _ in range(int(wait)):
                if STOP["v"]:
                    return
                time.sleep(1)

    def feeds_loop() -> None:
        pb3 = PB(s.pb_url, s.pb_email, s.pb_password)
        it = Intel(pb3, tid)
        state = s.data_dir / "run" / "intel-state.json"
        try:
            import json as _json
            last_seed = float(_json.loads(state.read_text()).get("last_seed", 0))
        except (OSError, ValueError):
            last_seed = 0.0
        while not STOP["v"]:
            t0 = time.time()
            if not ctl(pb3, "discovery_enabled"):
                time.sleep(30)
                continue
            try:
                it.readable = it._readable()
                if time.time() - last_seed > 86400:
                    isos = sorted(gdelt.FIPS)
                    for i in range(0, len(isos), 9):
                        it.seed_wikidata(isos[i:i + 9])
                    last_seed = time.time()
                    try:
                        import json as _json
                        state.write_text(_json.dumps({"last_seed": last_seed}))
                    except OSError:
                        pass
                log.info("publishers checked %s", it.check_publishers(_i("INTEL_PUBLISHER_CHECKS", 300), workers=10))
                log.info("feeds %s", it.collect_feeds(_i("INTEL_FEEDS_PER_SWEEP", 120)))
            except Exception:  # noqa: BLE001
                log.exception("feed stage failed")
            wait = max(60, int(ctl(pb3, "feed_check_minutes")) * 60 - (time.time() - t0))
            for _ in range(int(wait)):
                if STOP["v"]:
                    return
                time.sleep(1)

    ts = [threading.Thread(target=gdelt_loop, name="gdelt"), threading.Thread(target=feeds_loop, name="feeds")]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    log.info("intel stopped")


if __name__ == "__main__":
    main()

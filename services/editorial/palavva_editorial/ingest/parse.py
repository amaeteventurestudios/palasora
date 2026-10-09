"""RSS 2.0 / RDF / Atom parsing with defusedxml (no DTDs, no entities, no external refs)."""
from __future__ import annotations

import html
import re
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

from defusedxml import ElementTree as DET
from defusedxml.common import DefusedXmlException


class ParseError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}")
        self.code = code


@dataclass
class RawItem:
    guid: str
    link: str
    title: str
    summary: str
    published: datetime | None
    language: str = ""


TAG = re.compile(r"<[^>]+>")
WS = re.compile(r"\s+")


def strip_html(s: str | None) -> str:
    return WS.sub(" ", html.unescape(TAG.sub(" ", s or ""))).strip()


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _child(el, name: str):
    for c in el:
        if _local(c.tag) == name:
            return c
    return None


def _text(el, name: str) -> str:
    c = _child(el, name)
    return (c.text or "").strip() if c is not None and c.text else ""


def parse_date(s: str) -> datetime | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)  # assumption recorded: naive feed dates treated as UTC
    return d.astimezone(timezone.utc)


def parse_feed(data: bytes) -> list[RawItem]:
    if not data.strip():
        return []
    try:
        root = DET.fromstring(data, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    except DefusedXmlException as e:
        raise ParseError("UNSAFE_XML", type(e).__name__) from e
    except Exception as e:  # ParseError from expat
        raise ParseError("MALFORMED_XML", str(e)[:120]) from e
    kind = _local(root.tag)
    items: list[RawItem] = []
    lang = ""
    if kind == "rss" or kind == "rdf":
        channel = _child(root, "channel")
        lang = _text(channel, "language") if channel is not None else ""
        nodes = [e for e in (channel if channel is not None and kind == "rss" else root) if _local(e.tag) == "item"]
        if kind == "rdf":
            nodes = [e for e in root if _local(e.tag) == "item"]
        for it in nodes:
            link = _text(it, "link")
            guid = _text(it, "guid") or link
            date = _text(it, "pubdate") or _text(it, "date")
            items.append(RawItem(guid=guid, link=link, title=strip_html(_text(it, "title")),
                                 summary=strip_html(_text(it, "description"))[:600], published=parse_date(date), language=lang))
    elif kind == "feed":
        lang = root.attrib.get("{http://www.w3.org/XML/1998/namespace}lang", "")
        for it in root:
            if _local(it.tag) != "entry":
                continue
            link = ""
            for c in it:
                if _local(c.tag) == "link" and c.attrib.get("rel", "alternate") == "alternate":
                    link = c.attrib.get("href", "")
            items.append(RawItem(guid=_text(it, "id") or link, link=link, title=strip_html(_text(it, "title")),
                                 summary=strip_html(_text(it, "summary") or _text(it, "content"))[:600],
                                 published=parse_date(_text(it, "published") or _text(it, "updated")), language=lang))
    else:
        raise ParseError("UNKNOWN_FORMAT", kind)
    return [i for i in items if i.title and (i.link or i.guid)]

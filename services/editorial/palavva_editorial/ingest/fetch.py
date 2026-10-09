"""SSRF-safe HTTP fetch for source feeds (07 §Fetch contract, T-015).

- http/https only; host must be on the source's allowlist (defaults to the endpoint host)
- every hop's DNS answers are checked: loopback/private/link-local/multicast/reserved/
  CGNAT/metadata addresses are refused; redirects are followed manually (max 3) and re-checked
- bounded size (streamed), timeout, content-type allowlist, honest User-Agent, conditional GET
- DNS rebinding: the connection is pinned to the exact address that passed the check (the
  request goes to the IP; Host header and TLS SNI/certificate verification use the hostname),
  so a second, different DNS answer can never be used. Closes the ADR-012 residual risk.
"""
from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit

import httpx

USER_AGENT = "PalavvaBot/0.1 (+local development; rights-reviewed sources only)"
MAX_BYTES = 2 * 1024 * 1024
ALLOWED_CT = ("application/rss+xml", "application/atom+xml", "application/xml", "text/xml", "application/rdf+xml",
              "application/json", "text/plain", "application/x-rss+xml")
BLOCKED_HOSTS = {"metadata.google.internal", "metadata", "localhost"}


class FetchError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}")
        self.code = code


@dataclass
class FetchResult:
    status: int
    body: bytes
    final_url: str
    content_type: str
    etag: str = ""
    last_modified: str = ""
    hops: list[str] = field(default_factory=list)


def ip_is_public(ip: str) -> bool:
    a = ipaddress.ip_address(ip)
    if a.version == 6 and a.ipv4_mapped:
        a = a.ipv4_mapped
    if a.is_private or a.is_loopback or a.is_link_local or a.is_multicast or a.is_reserved or a.is_unspecified:
        return False
    if a.version == 4 and a in ipaddress.ip_network("100.64.0.0/10"):  # CGNAT, incl. Tailscale
        return False
    return a.is_global


def resolve_public(host: str, port: int, resolver=socket.getaddrinfo) -> list[str]:
    if host.lower() in BLOCKED_HOSTS or host.lower().endswith((".internal", ".local", ".localhost")):
        raise FetchError("BLOCKED_HOST", host)
    try:
        infos = resolver(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise FetchError("DNS_FAILED", str(e)) from e
    ips = sorted({i[4][0] for i in infos})
    if not ips:
        raise FetchError("DNS_FAILED", host)
    for ip in ips:
        if not ip_is_public(ip):
            raise FetchError("PRIVATE_ADDRESS", f"{host} -> {ip}")
    return ips


def check_url(url: str, allowed_hosts: set[str], resolver=socket.getaddrinfo) -> str:
    """Validate scheme/host/allowlist and DNS; return the public IP the request must be pinned to."""
    parts = urlsplit(url)
    if parts.scheme not in ("https", "http"):
        raise FetchError("BAD_SCHEME", parts.scheme)
    if parts.username or parts.password:
        raise FetchError("CREDENTIALS_IN_URL")
    host = (parts.hostname or "").lower()
    if not host:
        raise FetchError("NO_HOST")
    if allowed_hosts and host not in allowed_hosts:
        raise FetchError("HOST_NOT_ALLOWED", host)
    try:  # literal IPs are checked directly
        ipaddress.ip_address(host)
        if not ip_is_public(host):
            raise FetchError("PRIVATE_ADDRESS", host)
        return host
    except ValueError:
        pass
    return resolve_public(host, parts.port or (443 if parts.scheme == "https" else 80), resolver)[0]


def pinned_request(url: str, ip: str) -> tuple[httpx.URL, dict[str, str], dict]:
    """Target the validated IP directly while keeping Host and TLS server name = the original hostname."""
    u = httpx.URL(url)
    host = u.host
    try:
        ipaddress.ip_address(host)
        return u, {}, {}
    except ValueError:
        pass
    hdr = {"Host": host if u.port is None else f"{host}:{u.port}"}
    ext = {"sni_hostname": host} if u.scheme == "https" else {}
    return u.copy_with(host=ip), hdr, ext


def safe_fetch(url: str, allowed_hosts: set[str] | None = None, timeout: float = 15.0, etag: str = "", last_modified: str = "",
               max_redirects: int = 3, client: httpx.Client | None = None, resolver=socket.getaddrinfo) -> FetchResult:
    allowed = {h.lower() for h in (allowed_hosts or set())} or {(urlsplit(url).hostname or "").lower()}
    headers = {"User-Agent": USER_AGENT, "Accept": ", ".join(ALLOWED_CT)}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    own = client is None
    c = client or httpx.Client(timeout=timeout, follow_redirects=False)
    hops: list[str] = []
    try:
        current = url
        for _ in range(max_redirects + 1):
            ip = check_url(current, allowed, resolver)
            hops.append(current)
            target, host_hdr, ext = pinned_request(current, ip)
            with c.stream("GET", target, headers={**headers, **host_hdr}, extensions=ext) as r:
                if r.status_code in (301, 302, 303, 307, 308):
                    loc = r.headers.get("location")
                    if not loc:
                        raise FetchError("BAD_REDIRECT")
                    current = urljoin(current, loc)
                    continue
                if r.status_code == 304:
                    return FetchResult(304, b"", current, "", etag, last_modified, hops)
                if r.status_code >= 400:
                    raise FetchError(f"HTTP_{r.status_code}")
                ct = r.headers.get("content-type", "").split(";")[0].strip().lower()
                if ct and not any(ct == a for a in ALLOWED_CT):
                    raise FetchError("BAD_CONTENT_TYPE", ct)
                declared = int(r.headers.get("content-length") or 0)
                if declared > MAX_BYTES:
                    raise FetchError("TOO_LARGE", str(declared))
                buf = bytearray()
                for chunk in r.iter_bytes():
                    buf.extend(chunk)
                    if len(buf) > MAX_BYTES:
                        raise FetchError("TOO_LARGE", f">{MAX_BYTES}")
                return FetchResult(r.status_code, bytes(buf), current, ct, r.headers.get("etag", ""), r.headers.get("last-modified", ""), hops)
        raise FetchError("TOO_MANY_REDIRECTS")
    except httpx.TimeoutException as e:
        raise FetchError("TIMEOUT", str(e)) from e
    except httpx.HTTPError as e:
        raise FetchError("NETWORK", type(e).__name__) from e
    finally:
        if own:
            c.close()

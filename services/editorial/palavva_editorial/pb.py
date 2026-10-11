"""Minimal PocketBase REST client for the worker (superuser token, loopback only)."""
from __future__ import annotations

import time
from typing import Any

import httpx


class PBError(RuntimeError):
    def __init__(self, status: int, message: str, data: Any = None):
        super().__init__(f"PocketBase {status}: {message}")
        self.status = status
        self.data = data


def q(value: str) -> str:
    """Quote a value for a PocketBase filter string."""
    return "'" + str(value).replace("\\", "\\\\").replace("'", "\\'") + "'"


class PB:
    def __init__(self, url: str, email: str, password: str, timeout: float = 15.0):
        self.url = url.rstrip("/")
        self._email = email
        self._password = password
        self._token: str | None = None
        self._token_at = 0.0
        self._http = httpx.Client(timeout=timeout)

    def _auth(self) -> str:
        if self._token and time.time() - self._token_at < 3000:
            return self._token
        r = self._http.post(f"{self.url}/api/collections/_superusers/auth-with-password",
                            json={"identity": self._email, "password": self._password})
        if r.status_code != 200:
            raise PBError(r.status_code, "worker authentication failed")
        self._token = r.json()["token"]
        self._token_at = time.time()
        return self._token

    def _req(self, method: str, path: str, **kw) -> Any:
        for attempt in range(2):
            r = self._http.request(method, f"{self.url}{path}", headers={"Authorization": self._auth()}, **kw)
            # A rotated superuser token key (e.g. `superuser upsert`) makes PocketBase treat the stale token as a
            # guest: 401, or 403 on superuser-only collections. Re-authenticate once, then fail normally.
            if attempt == 0 and (r.status_code == 401 or (r.status_code == 403 and "superuser" in r.text.lower())):
                self._token = None
                continue
            if r.status_code >= 400:
                try:
                    body = r.json()
                except Exception:
                    body = {"message": r.text[:200]}
                raise PBError(r.status_code, body.get("message", ""), body.get("data"))
            return r.json() if r.content else None
        raise PBError(401, "auth retry exhausted")

    def health(self) -> bool:
        try:
            return self._http.get(f"{self.url}/api/health", timeout=3).status_code == 200
        except httpx.HTTPError:
            return False

    def list(self, coll: str, filter: str = "", sort: str = "", per_page: int = 200, page: int = 1) -> list[dict]:
        params = {"perPage": per_page, "page": page, "skipTotal": 1}
        if filter:
            params["filter"] = filter
        if sort:
            params["sort"] = sort
        return self._req("GET", f"/api/collections/{coll}/records", params=params)["items"]

    def count(self, coll: str, filter: str = "") -> int:
        params = {"perPage": 1, "page": 1, "fields": "id"}
        if filter:
            params["filter"] = filter
        return int(self._req("GET", f"/api/collections/{coll}/records", params=params).get("totalItems") or 0)

    def list_all(self, coll: str, filter: str = "", sort: str = "") -> list[dict]:
        out, page = [], 1
        while True:
            items = self.list(coll, filter, sort, 500, page)
            out.extend(items)
            if len(items) < 500:
                return out
            page += 1

    def first(self, coll: str, filter: str) -> dict | None:
        items = self.list(coll, filter, per_page=1)
        return items[0] if items else None

    def get(self, coll: str, rid: str) -> dict:
        return self._req("GET", f"/api/collections/{coll}/records/{rid}")

    def create(self, coll: str, data: dict) -> dict:
        return self._req("POST", f"/api/collections/{coll}/records", json=data)

    def update(self, coll: str, rid: str, data: dict) -> dict:
        return self._req("PATCH", f"/api/collections/{coll}/records/{rid}", json=data)

    def delete(self, coll: str, rid: str) -> None:
        self._req("DELETE", f"/api/collections/{coll}/records/{rid}")

    def upsert(self, coll: str, filter: str, data: dict) -> dict:
        existing = self.first(coll, filter)
        if existing:
            return self.update(coll, existing["id"], data)
        return self.create(coll, data)

    def audit(self, tenant_id: str, action: str, object_type: str, object_id: str, meta: dict | None = None,
              actor_type: str = "service", actor_id: str = "editorial-worker") -> None:
        self.create("audit_events", {"tenant_id": tenant_id, "actor_type": actor_type, "actor_id": actor_id,
                                     "action": action, "object_type": object_type, "object_id": object_id,
                                     "metadata_safe": meta or {}})

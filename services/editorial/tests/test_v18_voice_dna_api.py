"""v1.8+ ISSUE-28/02: GET /voice/dna exposes the stable communication DNA read-only, needs the service token and never leaks
another tenant's agents. Pure: PocketBase is replaced by an in-memory stub."""
import dataclasses

from fastapi.testclient import TestClient

from palavva_editorial import api
from palavva_editorial.city import voice


class StubPB:
    rows = {"agentaaaaaaaaa1": {"id": "agentaaaaaaaaa1", "tenant_id": "t1", "persona": {"tone": "warm"}},
            "agentbbbbbbbbb2": {"id": "agentbbbbbbbbb2", "tenant_id": "t2", "persona": {}}}
    writes = 0

    def get(self, coll, rid):
        assert coll == "agents"
        if rid not in self.rows:
            raise KeyError(rid)
        return self.rows[rid]

    def update(self, *a, **k):  # must never be called
        StubPB.writes += 1


def client(monkeypatch):
    monkeypatch.setattr(api, "S", dataclasses.replace(api.S, service_token="secret-token"))  # Settings is a frozen dataclass
    monkeypatch.setattr(api, "pb", lambda: StubPB())
    return TestClient(api.app)


def test_requires_service_token(monkeypatch):
    c = client(monkeypatch)
    assert c.get("/voice/dna", params={"tenant_id": "t1", "ids": "agentaaaaaaaaa1"}).status_code == 401
    assert c.get("/voice/dna", params={"tenant_id": "t1", "ids": "agentaaaaaaaaa1"}, headers={"x-service-token": "wrong"}).status_code == 401


def test_returns_stable_dna_for_own_tenant_only_and_writes_nothing(monkeypatch):
    c = client(monkeypatch)
    r = c.get("/voice/dna", params={"tenant_id": "t1", "ids": "agentaaaaaaaaa1,agentbbbbbbbbb2,notvalid!,missing00000001"}, headers={"x-service-token": "secret-token"})
    assert r.status_code == 200
    body = r.json()
    assert set(body["agents"]) == {"agentaaaaaaaaa1"}  # other tenant, invalid and missing ids are dropped
    d = body["agents"]["agentaaaaaaaaa1"]
    assert d["temperament"] == voice.dna(StubPB.rows["agentaaaaaaaaa1"])["temperament"]
    assert set(d) <= {"version", "temperament", "humor", "sarcasm", "skepticism", "emoji", "emoji_set", "verbosity", "debate", "cadence", "overridden"}
    assert StubPB.writes == 0

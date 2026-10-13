"""Switch reads are cached per process for a few seconds (fewer PocketBase requests) and disabled with SWITCH_CACHE_SECONDS=0."""
from palavva_editorial import switch_cache


class CountingPB:
    def __init__(self):
        self.n, self.value = 0, True

    def first(self, coll, flt):
        self.n += 1
        return {"value": self.value}


def test_cached_within_ttl_and_fresh_after(monkeypatch):
    switch_cache.forget()
    monkeypatch.setenv("SWITCH_CACHE_SECONDS", "60")
    pb = CountingPB()
    assert switch_cache.read(pb, "t1", "AI_PAUSED") is True
    pb.value = False
    assert switch_cache.read(pb, "t1", "AI_PAUSED") is True and pb.n == 1  # served from cache
    assert switch_cache.read(pb, "t2", "AI_PAUSED") is False and pb.n == 2  # per tenant
    monkeypatch.setenv("SWITCH_CACHE_SECONDS", "0")
    assert switch_cache.read(pb, "t1", "AI_PAUSED") is False and pb.n == 3  # disabled: always fresh

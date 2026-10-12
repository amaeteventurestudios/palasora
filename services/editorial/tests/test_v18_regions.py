"""v1.8+ ISSUE-03: founder-configured regional participation priority (pure, fake PB)."""
from palavva_editorial.city import regions


class FakePB:
    def __init__(self, value=None):
        self.value = value
    def first(self, coll, flt):
        return {"value": self.value} if self.value is not None else None


def test_defaults_prioritise_the_founder_list_and_leave_other_states_at_one():
    regions._CACHE.clear()
    pb = FakePB()
    assert regions.weight(pb, "t1", "NG-LA") == 2.0 and regions.weight(pb, "t1", "NG-KN") == 2.0
    assert regions.weight(pb, "t1", "NG-AD") == 1.0 and regions.weight(pb, "t1", "NG-BE") == 1.0  # Adamawa, Benue still covered
    assert regions.weight(pb, "t1", "") == 1.0 and regions.weight(pb, "t1", "KE-30") == 1.0
    assert len(regions.NIGERIA_PRIORITY) == 20


def test_stored_weights_override_and_are_clamped():
    regions._CACHE.clear()
    pb = FakePB({"weights": {"NG-LA": 9, "NG-AD": 0, "GH-AA": 1.5}})
    assert regions.weight(pb, "t2", "NG-LA") == 3.0 and regions.weight(pb, "t2", "NG-AD") == 0.0 and regions.weight(pb, "t2", "GH-AA") == 1.5

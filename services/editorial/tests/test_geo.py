"""L-12 / L-13: publisher vs event place, ambiguity handling (gazetteer-based, no model)."""
from palavva_editorial.geo import classify_geo, mappable


def codes(ms, only_mappable=True):
    return sorted({m.area_code for m in ms if (mappable(m) if only_mappable else True)})


def test_L12_lagos_publisher_kano_story_maps_to_kano():
    ms = classify_geo("Kano traders count losses after market fire", "Traders in the city said stalls burned overnight.", ["NG"], publisher_area="NG-LA")
    assert codes(ms) == ["NG-KN"]
    pub = [m for m in ms if m.role == "publisher"]
    assert pub and pub[0].area_code == "NG-LA" and not mappable(pub[0])


def test_L13_ambiguous_names_never_map_alone():
    for title in ["Rivers of plastic choke a busy lagoon", "Imo Ike wins a national science prize", "Niger Delta communities debate clean-up plan", "Edo artists open a new gallery"]:
        ms = classify_geo(title, "", ["NG"])
        assert codes(ms) == [], (title, ms)
        assert any(m.confidence == "unresolved" for m in ms), title


def test_qualified_and_city_aliases_resolve():
    assert codes(classify_geo("Rivers State assembly passes budget", "", ["NG"])) == ["NG-RI"]
    assert codes(classify_geo("Port Harcourt refinery restarts operations", "", ["NG"])) == ["NG-RI"]
    assert codes(classify_geo("Ikeja traders adopt digital payments", "", ["NG"])) == ["NG-LA"]
    assert codes(classify_geo("Free State investment plan announced", "", ["ZA"])) == ["ZA-FS"]
    assert codes(classify_geo("Mandela Bay starts housing build in KwaNobuhle", "", ["ZA"])) == ["ZA-EC"]


def test_excerpt_only_mentions_are_provisional_not_mapped():
    ms = classify_geo("Traders count losses after market fire", "The fire started near Kano's central market.", ["NG"])
    assert codes(ms) == [] and codes(ms, only_mappable=False) == ["NG-KN"]

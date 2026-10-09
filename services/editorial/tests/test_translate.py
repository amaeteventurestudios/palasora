"""L-08 / L-09: translation fidelity gate, disabled locales, caching by version (fixture provider)."""
from palavva_editorial import config, translate
from palavva_editorial.jobs import Queue
from palavva_editorial.pb import q
from palavva_editorial.providers.fixture import FixtureProvider


def test_fidelity_checks():
    src = {"headline": "President announces R120 billion Free State plan on 9 October 2026 (claim_1)"}
    ok, _ = translate.fidelity(src, {"headline": "Le président annonce un plan de R120 milliards pour le Free State le 9 octobre 2026 (claim_1)"}, "fr")
    assert ok
    bad, qa = translate.fidelity(src, {"headline": "Le président annonce un grand plan pour la région"}, "fr")
    assert not bad and "120" in qa["missing_numbers"] and "claim_1" in qa["missing_citations"]
    ok_ar, _ = translate.fidelity({"h": "Plan worth 120 billion"}, {"h": "خطة بقيمة ١٢٠ مليار"}, "ar")  # Arabic-Indic digits accepted
    assert ok_ar


def test_disabled_locale_never_generates(seeded, tmp_path):
    assert "pcm" not in translate.MT_ENABLED and "yo" not in translate.MT_ENABLED
    assert translate.enqueue(Queue(tmp_path / "j.db"), seeded["palavva"]["id"], "piece", "x", "pcm", 1) is False


def test_translate_job_caches_and_versions(seeded, tmp_path):
    pb, t = seeded["pb"], seeded["palavva"]
    piece = pb.first("editorial_pieces", f"tenant_id={q(t['id'])} && slug='demo-cold-storage-coop-tomatoes'")
    queue, s = Queue(tmp_path / "j.db"), config.load()
    assert translate.enqueue(queue, t["id"], "piece", piece["id"], "fr", piece["revision"])
    job = queue.claim("w")
    out = translate.translate_job(pb, queue, s, FixtureProvider(), job)
    assert out["outcome"] == "translated"
    loc = pb.get("localizations", out["id"])
    assert loc["status"] == "machine_unreviewed" and loc["fields"]["headline"].startswith("[FR] ") and loc["source_version"] == piece["revision"]
    again = translate.translate_job(pb, queue, s, FixtureProvider(), job)
    assert again["outcome"] == "cached"
    bad = translate.translate_job(pb, queue, s, FixtureProvider("bad_translation"), {**job, "payload": {**job["payload"], "locale": "ar"}})
    assert bad["outcome"] == "failed_fidelity" and pb.get("localizations", bad["id"])["fields"] == {}

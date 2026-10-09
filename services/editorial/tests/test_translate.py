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


def test_fidelity_allows_cross_language_inflection_but_not_altered_names():
    from palavva_editorial.translate import fidelity
    src = {"headline": "Mozambique: Indigenous identity and the Mozambican citizen, says Minister Khumbudzo Ntshavheni"}
    ok, qa = fidelity(src, {"headline": "Mozambique : identité indigène et citoyen mozambicain, selon la ministre Khumbudzo Ntshavheni"}, "fr")
    assert ok, qa
    ok, qa = fidelity(src, {"headline": "Mozambique : identité indigène et citoyen mozambicain, selon la ministre Khumbudzo Ntshau"}, "fr")
    assert not ok and "Ntshavheni" in qa["missing_names"] and "Khumbudzo" not in qa["missing_names"]


def test_fidelity_word_after_colon_is_not_a_name():
    from palavva_editorial.translate import fidelity
    ok, qa = fidelity({"headline": "Mozambique: Indigenous identity is now history"}, {"headline": "Mozambique : l'identité autochtone appartient au passé"}, "fr")
    assert ok, qa


def test_arabic_requires_latin_form_of_names():
    from palavva_editorial.translate import fidelity
    src = {"headline": "President Cyril Ramaphosa announces a plan in the Free State"}
    ok, qa = fidelity(src, {"headline": "الرئيس يرامبوسا يعلن خطة في ولاية فري ستيت"}, "ar")  # transliteration only, misspelt
    assert not ok and {"Cyril", "Ramaphosa"} <= set(qa["missing_names"])
    ok, qa = fidelity(src, {"headline": "الرئيس سيريل رامافوزا (Cyril Ramaphosa) يعلن خطة في ولاية فري ستيت (Free State)"}, "ar")
    assert ok, qa


def test_failed_translation_gets_one_gated_repair_pass(seeded, tmp_path):
    pb, t = seeded["pb"], seeded["palavva"]
    piece = pb.first("editorial_pieces", f"tenant_id={q(t['id'])} && slug='demo-cold-storage-coop-tomatoes'")
    queue, s = Queue(tmp_path / "r.db"), config.load()
    job = {"job_id": "repair-test", "tenant_id": t["id"], "payload": {"target_type": "piece", "target_id": piece["id"], "locale": "ar", "version": piece["revision"]}}
    old = pb.first("localizations", f"target_id={q(piece['id'])} && locale='ar'")
    if old:
        pb.delete("localizations", old["id"])
    out = translate.translate_job(pb, queue, s, FixtureProvider("bad_translation_repairable"), job)
    assert out["outcome"] == "translated" and out["qa"].get("repaired") is True and out["qa"]["first_attempt"]["missing_numbers"] is not None
    pb.delete("localizations", out["id"])  # the version is taken from the record, so clear it to translate again
    still_bad = translate.translate_job(pb, queue, s, FixtureProvider("bad_translation"), job)
    assert still_bad["outcome"] == "failed_fidelity" and still_bad["qa"]["repair_attempted"] is True


def test_outdated_failures_are_requeued_once(seeded, tmp_path):
    pb, t = seeded["pb"], seeded["palavva"]
    piece = pb.first("editorial_pieces", f"tenant_id={q(t['id'])} && slug='demo-cold-storage-coop-tomatoes'")
    pb.create("localizations", {"tenant_id": t["id"], "target_type": "piece", "target_id": piece["id"], "piece_id": piece["id"], "locale": "fr", "source_locale": "en",
                                "source_version": 77, "fields": {}, "status": "failed", "prompt_version": "translate-v1", "qa": {}, "report_count": 0})
    queue = Queue(tmp_path / "o.db")
    assert translate.retry_outdated_failures(pb, queue) >= 1
    assert translate.retry_outdated_failures(pb, queue) == 0  # idempotent: same key, no duplicate job


def test_title_case_and_institution_words_are_not_treated_as_names():
    from palavva_editorial.translate import fidelity
    src = {"headline": "Dube-Ncube Urges Grade 12s to Target Tech, Energy and Agri Careers, Says Department of Higher Education and Training"}
    ok, qa = fidelity(src, {"headline": "Dube-Ncube exhorte les élèves de 12e année à viser la tech, l'énergie et l'agri, selon le ministère de l'Enseignement supérieur"}, "fr")
    assert ok, qa
    ok, qa = fidelity(src, {"headline": "Dube exhorte les élèves de 12e année à viser la tech, selon le ministère"}, "fr")
    assert not ok and "Dube-Ncube" in qa["missing_names"]


def test_old_accepted_translation_failing_the_current_gate_is_withdrawn_and_requeued(seeded, tmp_path):
    pb, t = seeded["pb"], seeded["palavva"]
    piece = pb.first("editorial_pieces", f"tenant_id={q(t['id'])} && slug='demo-rainy-season-delivery-routes'")
    for old in pb.list("localizations", f"target_id={q(piece['id'])} && locale='ar'", per_page=10):
        pb.delete("localizations", old["id"])
    src = translate.piece_fields(piece)
    bad = {k: "ترجمة بدون أسماء أو أرقام" for k in src}  # names and numbers dropped
    loc = pb.create("localizations", {"tenant_id": t["id"], "target_type": "piece", "target_id": piece["id"], "piece_id": piece["id"], "locale": "ar", "source_locale": "en",
                                      "source_version": piece["revision"], "fields": bad, "status": "machine_unreviewed", "prompt_version": "translate-v1", "qa": {}, "report_count": 0})
    queue = Queue(tmp_path / "rv.db")
    out = translate.revalidate_outdated(pb, queue)
    assert out["withdrawn"] >= 1 and out["requeued"] >= 1
    after = pb.get("localizations", loc["id"])
    assert after["status"] == "failed" and after["fields"] == {} and after["qa"]["rejected_output"] == bad


def test_common_word_stems_british_spelling_and_country_names():
    from palavva_editorial.translate import is_common_word as c
    for w in ["Pricing", "Ensuring", "Industrialisation", "Organisation", "Africa", "African", "Nigerian", "Mozambican", "Demo", "Fintech"]:
        assert c(w), w
    for w in ["Ramaphosa", "Ntshavheni", "Morolong", "Gauteng", "Dube-Ncube"]:  # names and sub-national places must survive
        assert not c(w), w

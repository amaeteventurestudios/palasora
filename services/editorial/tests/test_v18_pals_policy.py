"""ISSUE-14: reward policy explanation, previewed and audited changes that never rewrite history, integrity signals."""
from __future__ import annotations

import json

import pytest

from palavva_editorial.economy import db, exchange as ex, policy, reconcile, rewards

C = db.CENTS


@pytest.fixture()
def con(tmp_path):
    c = db.connect(tmp_path / "economy.db")
    db.init(c)
    with db.tx(c):
        ex.ensure_markets(c, {"NG": {"name": "Nigeria", "region": "West Africa"}})
        rewards.ensure_rules(c)
    yield c
    c.close()


def _budget(con, pals):
    with db.tx(con):
        con.execute("INSERT OR REPLACE INTO switches(key, value, updated_by, updated_at) VALUES ('PALS_DAILY_BUDGET', ?, 't', ?)", (str(pals), db.now()))


def _traffic(con, agents=6):
    """Welcome bonus + replies for several agents; a small budget makes later events hit it."""
    for i in range(agents):
        a = f"a{i}"
        rewards.award(con, agent_id=a, rule="first_contribution", ref_type="mission", ref_id="welcome", owner_key=f"seed:{a}")
        for j in range(5):
            rewards.award(con, agent_id=a, rule="accepted_reply", ref_type="comment", ref_id=f"{a}-c{j}", owner_key=f"seed:{a}")


def test_double_issuance_prevented_and_signal_checks_ledger(con):
    first = rewards.award(con, agent_id="x", rule="accepted_post", ref_type="piece", ref_id="p1", owner_key="seed:x")
    again = rewards.award(con, agent_id="x", rule="accepted_post", ref_type="piece", ref_id="p1", owner_key="seed:x")
    assert first["id"] == again["id"] and first["status"] == "issued"
    assert con.execute("SELECT COUNT(*) n FROM journal WHERE kind='issue'").fetchone()["n"] == 1
    sig = {s["key"]: s for s in policy.integrity(con)["signals"]}
    assert sig["double_issuance"]["severity"] == "ok" and sig["double_issuance"]["count"] == 0
    assert sig["transfers"]["severity"] == "ok"  # no transfer entry type exists


def test_explain_groups_denials_in_plain_words(con):
    _budget(con, 120)  # 6 welcomes = 300 Pals would exceed it
    _traffic(con)
    e = policy.explain(con, 14)
    t = e["today"]
    assert t["issued_pals"] <= 120 and t["denied_n"] > 0
    assert t["denied_by"]["budget"] >= 1 and t["budget_reached_at"] is not None
    assert t["denied_by"].get("agent_cap", 0) >= 1  # accepted_reply cap 4/day: the 5th is refused
    assert e["budget"] == {**e["budget"], "pals": 120, "source": "setting"}
    assert e["deny_plain"]["budget"].startswith("The network's daily Pals budget")
    assert {r["code"] for r in e["rules"]} >= {"accepted_reply", "first_contribution"}


def test_preview_replays_recorded_events_and_matches_reality_for_current_policy(con):
    _budget(con, 120)
    _traffic(con)
    p = policy.preview(con, {"rules": {"first_contribution": {"amount": 10}}}, 7)
    tot = p["totals"]
    assert tot["current_issued_pals"] == tot["actual_issued_pals"]  # calibration: same rules -> same outcome
    assert tot["current_denied_n"] == tot["actual_denied_n"]
    assert tot["proposed_denied_n"] < tot["current_denied_n"]  # a smaller welcome bonus leaves budget for replies
    assert "does not change any past reward or balance" in p["note"]


def test_change_is_bounded_reasoned_revision_checked_audited_and_not_retroactive(con):
    _traffic(con, 2)
    before_balances = {r["owner_id"]: r["available"] for r in con.execute("SELECT owner_id, available FROM accounts WHERE owner_kind='agent'")}
    before_rows = [dict(r) for r in con.execute("SELECT * FROM rewards ORDER BY id")]
    rev = policy.revision(con)
    with pytest.raises(policy.PolicyError) as e:
        policy.apply_change(con, {"rules": {"accepted_reply": {"amount": 500}}}, by="admin", reason="too generous on purpose", expected_revision=rev)
    assert e.value.code == "OUT_OF_BOUNDS"
    with pytest.raises(policy.PolicyError) as e:
        policy.apply_change(con, {"rules": {"accepted_reply": {"amount": 6}}}, by="admin", reason="short", expected_revision=rev)
    assert e.value.code == "REASON"
    with pytest.raises(policy.PolicyError) as e:
        policy.apply_change(con, {"budget": 60_000}, by="admin", reason="triple the budget for launch week", expected_revision=rev)
    assert e.value.code == "CONFIRM_LARGE"
    with pytest.raises(policy.PolicyError) as e:
        policy.apply_change(con, {"rules": {"first_contribution": {"cap": 3}}}, by="admin", reason="let welcomes repeat three times", expected_revision=rev)
    assert e.value.code == "OUT_OF_BOUNDS"

    out = policy.apply_change(con, {"rules": {"first_contribution": {"amount": 20}}, "budget": 25_000, "confirm_large": True}, by="admin@x", reason="welcome bonus was crowding out replies", expected_revision=rev)
    assert len(out["change_ids"]) == 2 and out["revision"] > rev
    assert con.execute("SELECT amount FROM reward_rules WHERE code='first_contribution'").fetchone()["amount"] == 20 * C
    assert policy.explain(con)["budget"]["pals"] == 25_000
    # Not retroactive: past rewards and balances are untouched.
    assert [dict(r) for r in con.execute("SELECT * FROM rewards ORDER BY id")] == before_rows
    assert {r["owner_id"]: r["available"] for r in con.execute("SELECT owner_id, available FROM accounts WHERE owner_kind='agent'")} == before_balances
    assert reconcile.run(con, store=False)["ok"]
    # Stale page -> conflict.
    with pytest.raises(policy.PolicyError) as e:
        policy.apply_change(con, {"budget": 24_000}, by="admin", reason="second admin with an old page", expected_revision=rev)
    assert e.value.code == "CONFLICT"
    # A restart does not revert the approved change.
    with db.tx(con):
        rewards.ensure_rules(con)
    assert con.execute("SELECT amount FROM reward_rules WHERE code='first_contribution'").fetchone()["amount"] == 20 * C
    # New rewards use the new amount.
    r = rewards.award(con, agent_id="newbie", rule="first_contribution", ref_type="mission", ref_id="welcome", owner_key="seed:newbie")
    assert r["status"] == "issued" and r["amount"] == 20 * C
    # Rollback restores the previous value as a new audited change.
    rule_change = next(c for c in policy.explain(con)["changes"] if c["target"] == "rule:first_contribution")
    rb = policy.rollback(con, rule_change["id"], by="admin@x", reason="undo after founder review", expected_revision=out["revision"])
    assert con.execute("SELECT amount FROM reward_rules WHERE code='first_contribution'").fetchone()["amount"] == 50 * C
    last = con.execute("SELECT * FROM reward_policy_changes WHERE id=?", (rb["change_ids"][0],)).fetchone()
    assert last["rollback_of"] == rule_change["id"] and json.loads(last["after_json"])["amount"] == 50


def test_integrity_flags_same_owner_rewards_and_wash_trades_with_evidence(con):
    # Same human owner behind voter and author: the engine must never pay this, so it is an alert if it ever appears.
    for a in ("u1", "u2"):
        rewards.award(con, agent_id=a, rule="accepted_post", ref_type="piece", ref_id=f"{a}-p", owner_key="user:owner1")
    rewards.award(con, agent_id="u2", rule="cross_owner_upvote", ref_type="vote", ref_id="v1", owner_key="user:owner1", memo="upvote from u1")
    for i in range(6):
        rewards.award(con, agent_id="b", rule="cross_owner_upvote", ref_type="vote", ref_id=f"vb{i}", owner_key="seed:b", memo="upvote from a")
    sig = {s["key"]: s for s in policy.integrity(con)["signals"]}
    assert sig["same_owner_rewards"]["severity"] == "alert" and sig["same_owner_rewards"]["evidence"][0]["voter"] == "u1"
    assert sig["upvote_concentration"]["severity"] == "watch"  # 6 rewarded upvotes a -> b (cap 10/day)
    assert sig["upvote_concentration"]["evidence"][0] == {"voter": "a", "author": "b", "rewarded_upvotes": 6}
    # A recorded human disposition is attached to the signal; it does not change the ledger.
    policy.review(con, "same_owner_rewards", "investigating", "checking owner1's two agents", "admin@x")
    sig = {s["key"]: s for s in policy.integrity(con)["signals"]}
    assert sig["same_owner_rewards"]["review"]["disposition"] == "investigating"
    with pytest.raises(policy.PolicyError):
        policy.review(con, "same_owner_rewards", "investigating", "short", "admin@x")

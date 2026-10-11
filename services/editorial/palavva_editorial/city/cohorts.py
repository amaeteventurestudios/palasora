"""Cohort activation from the command line (same rule as the Command Center action `setCohort` in apps/web/app/actions/city.ts).

Activating a cohort makes its agents ELIGIBLE: the engines may consider them. It does not make them "active" in any
reported sense; Command Center counts agents as genuinely active only when they complete a meaningful action.
Agents an operator paused or held individually (status_reason contains "(staff)") are never touched.

    scripts/pyenv.sh -m palavva_editorial.city.cohorts activate 3 4 5 6 7 8 9 10
"""
from __future__ import annotations

import sys

from ..config import load
from ..pb import PB, q


def set_cohorts(pb: PB, tid: str, cohorts: list[int], to: str, actor: str = "operator-cli") -> dict:
    frm = "resting" if to == "active" else "active"
    out = {}
    for c in cohorts:
        n = 0
        for a in pb.list_all("agents", f"tenant_id={q(tid)} && is_seed=true && cohort={int(c)} && status={q(frm)}"):
            if "(staff)" in str(a.get("status_reason") or ""):
                continue
            pb.update("agents", a["id"], {"status": to, "status_reason": f"cohort {c} {'activated' if to == 'active' else 'rested'} by operator"})
            n += 1
        pb.audit(tid, "city.cohort_activated" if to == "active" else "city.cohort_rested", "agents", str(c), {"agents": n, "via": actor},
                 actor_type="system", actor_id=actor)
        out[c] = n
    return out


def main() -> None:
    verb, nums = sys.argv[1], [int(x) for x in sys.argv[2:]]
    s = load()
    pb = PB(s.pb_url, s.pb_email, s.pb_password)
    t = pb.first("tenants", "slug='palavva'")
    print(set_cohorts(pb, t["id"], nums, "active" if verb == "activate" else "resting"))


if __name__ == "__main__":
    main()

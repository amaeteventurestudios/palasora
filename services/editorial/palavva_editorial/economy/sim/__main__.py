"""The `sim` command (Doc 05 section 9): one command per run, and one for every gate.

    sim run --scenario drought --seed 3 --days 30 [--mode rules|recorded] [--out DIR]
    sim gates [--seeds 10] [--days 30] [--long 180] [--out DIR] [--workers N]
    sim record --provider fixture            (write AI recordings from the deterministic fixture planner)
    sim record --provider openrouter         (needs OPENROUTER_API_KEY; refuses without one)

`scripts/sim` runs this module with the service's virtualenv.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from ..town import ai
from . import gates, report, runner, scenarios

DEFAULT_OUT = Path(os.environ.get("SIM_OUT", "sim-out"))


def cmd_run(a) -> int:
    s = runner.strip(runner.run(a.scenario, a.seed, a.days, mode=a.mode))
    out = Path(a.out)
    base = out / f"{a.scenario}-seed{a.seed}-{a.days}d-{a.mode}"
    runner.save(s, base.with_suffix(".json"))
    report.write(s, base.with_suffix(".html"))
    checks = gates.check_run(s)
    print(f"{a.scenario} seed {a.seed}, {a.days} days ({a.mode}): {s['elapsed_sec']}s, {s['days_per_minute']} days a minute, fingerprint {s['fingerprint'][:16]}")
    for k, (ok, txt) in checks.items():
        print(f"  {'pass' if ok else 'FAIL'}  {k}: {txt}")
    print(f"  report: {base.with_suffix('.html')}")
    return 0


def cmd_gates(a) -> int:
    t0 = time.time()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    seeds = tuple(range(1, a.seeds + 1))
    print(f"Gate A: {len(scenarios.GATE_A)} scenarios x {len(seeds)} seeds, {a.days} days, rules only, each run twice for the fingerprint ...", flush=True)
    rules_all = gates.run_many(gates.scenario_jobs(scenarios.ORDER, seeds, a.days, "rules", recheck=True), a.workers)
    gate_a_runs = [s for s in rules_all if s["scenario"] in scenarios.GATE_A]
    long_run = None
    if a.long:
        print(f"Gate A: {a.long}-day Baseline ...", flush=True)
        long_run = gates.run_many([("baseline", 1, a.long, "rules", False)], 1)[0]
    res_a = gates.gate_a(gate_a_runs, long_run)
    print(f"Gate B and C: {len(scenarios.ORDER)} scenarios x {len(seeds)} seeds with recorded AI ...", flush=True)
    rec_all = gates.run_many(gates.scenario_jobs(scenarios.ORDER, seeds, a.days, "recorded"), a.workers)
    res_b = gates.gate_b(rec_all, rules_all)
    res_c = gates.gate_c(rec_all + rules_all)
    res_d = gates.gate_d(rec_all)
    meta = {"text": f"{len(rules_all)} rules runs and {len(rec_all)} recorded-AI runs of {a.days} days on seeds 1 to {a.seeds}"
                    f"{f', plus a {a.long}-day Baseline' if a.long else ''}; {time.time() - t0:.0f} s on {os.cpu_count()} cores."}
    result = {"A": res_a, "B": res_b, "C": res_c, "D": res_d, "meta": meta}
    (out / "gates.json").write_text(json.dumps(result, indent=1, default=runner._json))
    (out / "gates.html").write_text(report.gates_page(result))
    # a handful of run reports, not hundreds: seed 1 of every scenario (rules), the long run, and one recorded run
    for s in rules_all:
        if s["seed"] == 1:
            report.write(s, out / "runs" / f"{s['scenario']}-seed1-{a.days}d-rules.html")
    if long_run is not None:
        report.write(long_run, out / "runs" / f"baseline-seed1-{a.long}d-rules.html")
        runner.save(long_run, out / "runs" / f"baseline-seed1-{a.long}d-rules.json")
    for s in rec_all:
        if s["seed"] == 1 and s["scenario"] == "baseline":
            report.write(s, out / "runs" / f"baseline-seed1-{a.days}d-recorded.html")
    for g, r in (("A", res_a), ("B", res_b), ("C", res_c), ("D", res_d)):
        print(f"Gate {g}: {'PASS' if r['ok'] else 'FAIL'}")
        for name, c in r["checks"].items():
            mark = "blocked" if c.get("blocked") else ("pass" if c["ok"] else "FAIL")
            ex = c.get("examples", [""])
            print(f"  {mark:7} {name}" + (f" ({c['failed']}/{c['runs']} runs fail)" if "runs" in c and not c["ok"] else "") + (f": {ex[0]}" if ex else ""))
    print(f"wrote {out / 'gates.html'} in {time.time() - t0:.0f} s")
    return 0 if all(r["ok"] for r in (res_a, res_b, res_c, res_d)) else 1


def cmd_record(a) -> int:
    path = Path(a.path) if a.path else ai.RECORDINGS / "plans-v1.json"
    if a.provider == "fixture":
        meta = ai.record_fixture(path)
        print(f"recorded {meta['prompts']} answers from the deterministic fixture planner to {path} (labelled fixture, not a real model)")
        return 0
    if not os.environ.get("OPENROUTER_API_KEY", "").strip():
        print("blocked_no_key: OPENROUTER_API_KEY is not configured, so no live recording was made", file=sys.stderr)
        return 2
    print("live recording goes through the OpenRouter writer and its spend ledger (cap $5); run it from the service with the key set", file=sys.stderr)
    return 2


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="sim", description="Palasora headless simulation (Doc 05)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="run one scenario on one seed")
    r.add_argument("--scenario", default="baseline", choices=scenarios.ORDER)
    r.add_argument("--seed", type=int, default=1)
    r.add_argument("--days", type=int, default=30)
    r.add_argument("--mode", default="rules", choices=("rules", "recorded"))
    r.add_argument("--out", default=str(DEFAULT_OUT))
    g = sub.add_parser("gates", help="run every scenario on every seed and check gates A to D")
    g.add_argument("--seeds", type=int, default=10)
    g.add_argument("--days", type=int, default=30)
    g.add_argument("--long", type=int, default=180, help="length of the long Baseline run (0 to skip)")
    g.add_argument("--workers", type=int, default=None)
    g.add_argument("--out", default=str(DEFAULT_OUT))
    rec = sub.add_parser("record", help="record AI answers for replay")
    rec.add_argument("--provider", default="fixture", choices=("fixture", "openrouter"))
    rec.add_argument("--path", default="")
    a = ap.parse_args(argv)
    return {"run": cmd_run, "gates": cmd_gates, "record": cmd_record}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())

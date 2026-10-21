"""One HTML page per run (Doc 05 section 9 step 2): the payback curve (every business type against its lane), money
growth against the target, a leaderboard sorted three ways, charts of prices, money, jobs and closures, the run's gate
checks and the event log. The page is self-contained (uPlot is inlined from vendor/uplot, MIT) so it can be opened
from disk or attached to a PR. The same charts become the public Economy notes when a balance change ships.
"""
from __future__ import annotations

import html
import json
import math
from pathlib import Path

from . import gates

VENDOR = Path(__file__).resolve().parent / "vendor" / "uplot"
C = 100

CSS = """
:root{color-scheme:light;--surface-1:#fcfcfb;--surface-2:#f3f2ef;--border:#e2e1dc;--text-primary:#0b0b0b;--text-secondary:#52514e;
--text-muted:#7a7972;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--band:#2a78d61f;--good:#1a7f37;--bad:#c62828}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--surface-1:#1a1a19;--surface-2:#242422;--border:#3a3a37;
--text-primary:#f0efec;--text-secondary:#c3c2b7;--text-muted:#9a998f;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--band:#3987e526;--good:#5cc177;--bad:#ef6b6b}}
:root[data-theme="dark"]{color-scheme:dark;--surface-1:#1a1a19;--surface-2:#242422;--border:#3a3a37;--text-primary:#f0efec;--text-secondary:#c3c2b7;
--text-muted:#9a998f;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--band:#3987e526;--good:#5cc177;--bad:#ef6b6b}
*{box-sizing:border-box}body{margin:0;background:var(--surface-1);color:var(--text-primary);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:36px 0 8px}
p.sub,.muted{color:var(--text-secondary)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.tile{background:var(--surface-2);border-radius:8px;padding:12px}.tile b{display:block;font-size:22px}.tile span{color:var(--text-secondary);font-size:13px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--border)}th{color:var(--text-secondary);font-weight:600}
td.n{text-align:right;font-variant-numeric:tabular-nums}.ok{color:var(--good);font-weight:600}.no{color:var(--bad);font-weight:600}
.chart{background:var(--surface-2);border-radius:8px;padding:8px;margin:8px 0;overflow:hidden}.wrap{overflow-x:auto}
details summary{cursor:pointer;color:var(--text-secondary);margin:6px 0}svg text{fill:var(--text-secondary);font-size:12px}
.tabs button{background:var(--surface-2);color:var(--text-primary);border:1px solid var(--border);border-radius:6px;padding:4px 10px;margin:0 6px 8px 0;cursor:pointer}
.tabs button[aria-pressed=true]{border-color:var(--s1);color:var(--s1)}
.u-legend{color:var(--text-secondary);font-size:12px}.u-select{background:var(--band)}
"""


def _esc(x) -> str:
    return html.escape(str(x))


def _fmt_days(x) -> str:
    return "never" if x is None or (isinstance(x, float) and math.isinf(x)) else f"{x:.1f} days"


def payback_svg(paybacks: dict, lanes: dict) -> str:
    """The payback curve: one row per business type, its lane (dark band) and the half-lane margin (light band), and
    the measured payback as a dot. Days on a square-root axis so 2 to 40 days all stay readable."""
    w, row, left, right = 760, 46, 110, 30
    types = ["stall", "delivery", "farm", "workshop"]
    h = row * len(types) + 40
    maxd = 45.0
    def x(d):
        return left + (w - left - right) * math.sqrt(min(max(d, 0), maxd) / maxd)
    parts = [f'<svg viewBox="0 0 {w} {h}" width="100%" role="img" aria-label="Payback curve: measured payback of each business type against its lane">']
    for d in (1, 2, 4, 7, 10, 15, 20, 30, 40):
        parts.append(f'<line x1="{x(d):.1f}" x2="{x(d):.1f}" y1="10" y2="{h - 26}" stroke="var(--border)"/><text x="{x(d):.1f}" y="{h - 8}" text-anchor="middle">{d}</text>')
    for i, t in enumerate(types):
        y = 14 + i * row
        v = paybacks.get(t)
        lane = v["lane"] if v else None
        lo_hi = v["bounds"] if v else None
        lname = lane or ""
        parts.append(f'<text x="0" y="{y + 20}" style="fill:var(--text-primary)">{t}</text><text x="0" y="{y + 35}">{_esc(lname)} lane</text>')
        if v:
            lo, hi = lanes[lane]
            blo, bhi = lo_hi
            parts.append(f'<rect x="{x(blo):.1f}" y="{y + 6}" width="{x(bhi) - x(blo):.1f}" height="24" rx="4" fill="var(--band)"/>')
            parts.append(f'<rect x="{x(lo):.1f}" y="{y + 6}" width="{x(hi) - x(lo):.1f}" height="24" rx="4" fill="var(--s1)" opacity="0.35"/>')
            pb = v["payback"]
            ok = blo <= pb <= bhi
            px = x(pb if not math.isinf(pb) else maxd)
            label = "loses money" if math.isinf(pb) else f"{pb:.1f} d"
            parts.append(f'<circle cx="{px:.1f}" cy="{y + 18}" r="6" fill="{"var(--good)" if ok else "var(--bad)"}" stroke="var(--surface-1)" stroke-width="2"><title>{t}: {label}, lane {lo:g} to {hi:g} days ({v["businesses"]} businesses)</title></circle>')
            parts.append(f'<text x="{min(px + 10, w - 90):.1f}" y="{y + 22}" style="fill:var(--text-primary)">{label}</text>')
        else:
            parts.append(f'<text x="{left}" y="{y + 22}">not measured (no on-curve business ran a full week)</text>')
    parts.append("</svg>")
    return "".join(parts)


def leaderboard(businesses: list[dict]) -> str:
    rows = [b for b in businesses if b["days"] >= 3]
    for b in rows:
        b["per_day"] = b["profit_total"] / b["days"] / C
        b["pb"] = (b["cost"] / C) / b["per_day"] if b["per_day"] > 0 else math.inf
    sorts = {"payback": ("Fastest to pay back", lambda b: (b["pb"], b["id"])), "perday": ("Most Sora a day", lambda b: (-b["per_day"], b["id"])),
             "cheap": ("Cheapest to start", lambda b: (b["cost"], b["pb"], b["id"]))}
    out = ['<div class="tabs" role="group" aria-label="Sort the leaderboard">']
    for i, (k, (name, _)) in enumerate(sorts.items()):
        out.append(f'<button aria-pressed="{"true" if i == 0 else "false"}" data-tab="{k}">{name}</button>')
    out.append("</div>")
    for i, (k, (name, key)) in enumerate(sorts.items()):
        out.append(f'<div class="wrap lb" data-lb="{k}"{"" if i == 0 else " hidden"}><table><thead><tr><th>#</th><th>Business</th><th>Type</th><th>Owner</th>'
                   '<th class="n">Cost</th><th class="n">Sora a day</th><th class="n">Payback</th><th>Status</th></tr></thead><tbody>')
        for n, b in enumerate(sorted(rows, key=key)[:40], 1):
            pb = "loses money" if math.isinf(b["pb"]) else f'{b["pb"]:.1f} d'
            st = b["status"] + (" (beside the curve)" if b.get("beside_curve") else "")
            out.append(f'<tr><td>{n}</td><td>{_esc(b["id"])}</td><td>{_esc(b["type"])}</td><td>{_esc(b["owner"])} ({_esc(b["owner_kind"])})</td>'
                       f'<td class="n">{b["cost"] / C:.0f}</td><td class="n">{b["per_day"]:.2f}</td><td class="n">{pb}</td><td>{_esc(st)}</td></tr>')
        out.append("</tbody></table></div>")
    return "".join(out)


def render(s: dict, checks: dict | None = None) -> str:
    checks = checks if checks is not None else gates.check_run(s)
    ds = s["series"]
    days = [d["day"] for d in ds]
    p = s["params"]
    target = p["growth_target"]
    # money: Sora per resident index (chain-linked) against the target path from day 14
    i14 = next((d["index"] for d in ds if d["day"] == 14), ds[0]["index"] if ds else 1.0)
    tgt = [None if d["day"] < 14 else i14 * (1 + target) ** ((d["day"] - 14) / 365) for d in ds]
    refs = {"stall": p["meal_ref"], "farm": p["crop_ref"], "workshop": p["tool_ref"], "delivery": p["delivery_fee"]}
    price = {t: [(d["prices"][t] / refs[t]) if d["prices"].get(t) else None for d in ds] for t in refs}
    data = {
        "days": days,
        "money": [[d["index"] for d in ds], tgt],
        "prices": [price["stall"], price["farm"], price["workshop"], price["delivery"]],
        "jobs": [[d["civic_workers"] for d in ds], [d["business_workers"] for d in ds], [d["unemployed"] for d in ds]],
        "biz": [[d["open"] for d in ds], [d["closed_today"] for d in ds]],
        "per_res": [[d["per_resident"] / C for d in ds]],
    }
    gw = s["growth_windows"]
    growth_txt = ", ".join(f'{g["growth"]:+.1%}' for g in gw) or "no full window"
    oos = s["out_of_stock"]
    oos_share = oos["hours"] / oos["biz_hours"] if oos["biz_hours"] else 0
    tiles = [
        (growth_txt, f'money growth a year per resident (target {target:.0%}, band {p["growth_band"][0]:.0%} to {p["growth_band"][1]:.0%})'),
        (f'{s["closures"]["closed"]} / {s["closures"]["recovered"]}', "closures / owners who earned again"),
        (f"{oos_share:.1%}", "out of stock, share of business-hours"),
        (f'{s["mischief"]["refused"]}/{s["mischief"]["attempts"]}' if s["mischief"]["attempts"] else "none", "cheating attempts refused"),
        (s["fingerprint"][:12], "fingerprint (same seed, same run)"),
        (f'{s["days_per_minute"]}', "simulated days a minute"),
    ]
    rows = []
    for name, (ok, txt) in checks.items():
        rows.append(f'<tr><td>{_esc(name.replace("_", " "))}</td><td class="{"ok" if ok else "no"}">{"pass" if ok else "fail"}</td><td>{_esc(txt)}</td></tr>')
    ev = "".join(f'<tr><td class="n">{e["tick"] // 24}</td><td class="n">{e["tick"] % 24:02d}:00</td><td>{_esc(e["kind"])}</td><td>{_esc(e["visibility"])}</td><td>{_esc(e["text"])}</td></tr>'
                 for e in s.get("event_log", [])[-250:])
    tune = p.get("_tuning", {})
    daily = "".join(f'<tr><td class="n">{d["day"]}</td><td class="n">{d["N"]}</td><td class="n">{d["M"] / C:,.0f}</td><td class="n">{d["index"]:.4f}</td>'
                    f'<td class="n">{(d["meal_price"] or 0) / C:.2f}</td><td class="n">{d.get("meals_sold", 0)}</td><td class="n">{d.get("hungry", 0)}</td>'
                    f'<td class="n">{d["open"]}</td><td class="n">{d["closed_today"]}</td><td class="n">{d["civic_workers"]}</td><td class="n">{d["business_workers"]}</td></tr>' for d in ds)
    title = f'{s["scenario"].replace("_", " ").capitalize()}, seed {s["seed"]}, {s["days"]} days ({s["mode"]})'
    uplot_js = (VENDOR / "uPlot.iife.min.js").read_text()
    uplot_css = (VENDOR / "uPlot.min.css").read_text()
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Palasora run: {_esc(title)}</title><style>{uplot_css}{CSS}</style></head><body><main>
<h1>Palasora headless run</h1><p class="sub">{_esc(title)}. Every number on this page comes from the run's ledger, goods log and event records.
Agents: {_esc(s["mode"])}{" (recorded answers from the deterministic fixture planner, not a real model)" if s["mode"] == "recorded" else ""}.</p>
<div class="grid">{"".join(f'<div class="tile"><b>{_esc(a)}</b><span>{_esc(b)}</span></div>' for a, b in tiles)}</div>
<h2>Gate A checks for this run</h2><div class="wrap"><table><thead><tr><th>Check</th><th>Result</th><th>Measured</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>
<h2>Payback curve</h2><p class="muted">Build cost divided by the median daily profit over the last 7 days, per type (Doc 04 rule 1). Dark band: the lane; light band: half a lane either side. Businesses opened where their trade had no room sit beside the curve and are left out.</p>
<div class="chart">{payback_svg(s["paybacks"], p["lanes"])}</div>
<h2>Money growth against the target</h2><p class="muted">Sora per resident, chain-linked so newcomers' starting money counts as population, not growth (day 0 = 1). Dashed: the {target:.0%} a year target path from day 14.</p>
<div class="chart" id="c-money"></div>
<h2>Prices</h2><p class="muted">Median price of each trade, as a multiple of its reference price (meal 5.00, crop {p["crop_ref"] / C:.2f}, tool {p["tool_ref"] / C:.2f}, cart load {p["delivery_fee"] / C:.2f}).</p>
<div class="chart" id="c-prices"></div>
<h2>Jobs</h2><div class="chart" id="c-jobs"></div>
<h2>Businesses and closures</h2><div class="chart" id="c-biz"></div>
<h2>Leaderboard</h2><p class="muted">Every business that ran at least 3 days, sorted three ways (Doc 04 rule 4).</p>{leaderboard([dict(b) for b in s["businesses"]])}
<h2>Day by day</h2><details><summary>Table of the daily numbers</summary><div class="wrap"><table><thead><tr><th>Day</th><th class="n">Residents</th><th class="n">Sora</th><th class="n">Index</th><th class="n">Meal</th><th class="n">Meals</th><th class="n">Hungry</th><th class="n">Open</th><th class="n">Closed</th><th class="n">Civic</th><th class="n">Staff</th></tr></thead><tbody>{daily}</tbody></table></div></details>
<h2>Event log</h2><details><summary>Last {min(250, len(s.get("event_log", [])))} of {s["events"]} world events</summary><div class="wrap"><table><thead><tr><th class="n">Day</th><th class="n">Hour</th><th>Kind</th><th>Seen by</th><th>What happened</th></tr></thead><tbody>{ev}</tbody></table></div></details>
<h2>Numbers this run used</h2><details><summary>Parameters (changes from Document 04 are listed in town/params.py with the reason)</summary><pre class="wrap">{_esc(json.dumps({k: v for k, v in p.items() if not k.startswith("_")}, indent=1, default=str))}</pre></details>
{"" if not tune else ""}
</main><script>{uplot_js}</script><script>
const D = {json.dumps(data)};
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function chart(id, series, extra) {{
  const el = document.getElementById(id);
  const opts = {{ width: Math.max(300, el.clientWidth - 16), height: 240, scales: {{ x: {{ time: false }} }},
    axes: [{{ stroke: css('--text-secondary'), grid: {{ stroke: css('--border'), width: 1 }}, label: 'day' }}, {{ stroke: css('--text-secondary'), grid: {{ stroke: css('--border'), width: 1 }}, ...(extra || {{}}) }}],
    series: [{{ label: 'day' }}, ...series.map(s => ({{ label: s.label, stroke: css(s.color), width: 2, dash: s.dash, spanGaps: true, points: {{ show: false }} }}))] }};
  return new uPlot(opts, [D.days, ...series.map(s => s.data)], el);
}}
const charts = [
  chart('c-money', [{{label: 'Sora per resident (index)', color: '--s1', data: D.money[0]}}, {{label: 'Target path', color: '--text-muted', data: D.money[1], dash: [6, 4]}}]),
  chart('c-prices', [{{label: 'Meal', color: '--s1', data: D.prices[0]}}, {{label: 'Crop', color: '--s2', data: D.prices[1]}}, {{label: 'Tool', color: '--s3', data: D.prices[2]}}, {{label: 'Cart load', color: '--s4', data: D.prices[3]}}], {{label: 'x reference price'}}),
  chart('c-jobs', [{{label: 'Civic workers', color: '--s1', data: D.jobs[0]}}, {{label: 'Business staff', color: '--s2', data: D.jobs[1]}}, {{label: 'Without work', color: '--s3', data: D.jobs[2]}}], {{label: 'people'}}),
  chart('c-biz', [{{label: 'Open businesses', color: '--s1', data: D.biz[0]}}, {{label: 'Closed that day', color: '--s2', data: D.biz[1]}}], {{label: 'businesses'}}),
];
addEventListener('resize', () => charts.forEach(c => c.setSize({{ width: Math.max(300, c.root.parentElement.clientWidth - 16), height: 240 }})));
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {{
  document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-pressed', x === b));
  document.querySelectorAll('.lb').forEach(x => x.hidden = x.dataset.lb !== b.dataset.tab);
}}));
</script></body></html>"""


def write(s: dict, path: Path, checks: dict | None = None) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render(s, checks))
    return path


def gates_page(result: dict) -> str:
    """A one-page summary of `sim gates`: pass or fail per gate and check, with the numbers."""
    out = []
    for g in ("A", "B", "C", "D"):
        r = result.get(g)
        if r is None:
            continue
        out.append(f'<h2>Gate {g}: <span class="{"ok" if r["ok"] else "no"}">{"pass" if r["ok"] else "fail"}</span></h2><div class="wrap"><table><thead><tr><th>Check</th><th>Result</th><th>Runs failing</th><th>Numbers</th></tr></thead><tbody>')
        for name, c in r["checks"].items():
            res = "blocked" if c.get("blocked") else ("pass" if c["ok"] else "fail")
            fail = f'{c.get("failed", "")}/{c.get("runs", "")}' if "runs" in c else ""
            out.append(f'<tr><td>{_esc(name.replace("_", " "))}</td><td class="{"ok" if c["ok"] else "no"}">{res}</td><td class="n">{fail}</td><td>{"<br>".join(_esc(x) for x in c.get("examples", []))}</td></tr>')
        out.append("</tbody></table></div>")
        if r.get("note"):
            out.append(f'<p class="muted">{_esc(r["note"])}</p>')
    meta = result.get("meta", {})
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Palasora gates</title><style>{CSS}</style></head><body><main><h1>Palasora simulation gates</h1>
<p class="sub">{_esc(meta.get("text", ""))}</p>{"".join(out)}</main></body></html>"""

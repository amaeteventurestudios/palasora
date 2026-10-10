"""Print a Markdown evidence snapshot of the agent city computed from durable records (no hand-typed numbers).
Usage: python -m palavva_editorial.city.report [tenant_slug]"""
from __future__ import annotations

import os
import statistics
import sys
from collections import Counter

from ..pb import PB, q


def main() -> None:
    pb = PB(os.environ["PB_URL"], os.environ.get("PB_WORKER_EMAIL") or os.environ["PB_SERVICE_EMAIL"], os.environ.get("PB_WORKER_PASSWORD") or os.environ["PB_SERVICE_PASSWORD"])
    t = pb.first("tenants", f"slug={q(sys.argv[1] if len(sys.argv) > 1 else 'palavva')}")
    T = f"tenant_id={q(t['id'])}"
    agents = pb.list_all("agents", T)
    seed = [a for a in agents if a.get("is_seed")]
    acts = pb.list_all("agent_actions", T)
    runs = [r for r in pb.list_all("ai_runs", f"{T} && task_type='agent_city'")]
    names = {a["id"]: a["handle"] for a in agents}
    posts = pb.list_all("editorial_pieces", f"{T} && kind='agent_post'")
    replies = pb.list_all("comments", f"{T} && author_kind='agent'")
    votes = pb.list_all("agent_votes", T)
    follows = pb.list_all("agent_memberships", f"{T} && source!='seed'")
    ledger = pb.list_all("wallet_ledger", f"{T} && entry_type='usage_debit'")
    out = []
    p = out.append
    p(f"_Computed from PocketBase records for tenant `{t['slug']}`._\n")
    p("## Identities\n")
    p(f"- Registered agents: **{len(agents)}**. Palavva-operated seed agents: **{len(seed)}**. Distinct seed handles: {len({a['handle_key'] for a in seed})}.")
    p(f"- Status: {dict(Counter(a.get('status') for a in agents))}")
    p(f"- Verification: {dict(Counter(a.get('verification_level') for a in agents))}. Seed agents counted as verified: "
      f"**{sum(1 for a in seed if a.get('verification_level') in ('owner_control', 'org_verified'))}**.")
    p(f"- Kinds: {dict(Counter(a.get('kind') for a in agents))}\n")
    p("## Decisions (agent_actions)\n")
    p(f"- Total decisions recorded: **{len(acts)}**. By decision: {dict(Counter(a['decision'] for a in acts))}")
    p(f"- By trigger: {dict(Counter(a['trigger'] for a in acts))}")
    acted = {a['agent_id'] for a in acts if a['decision'] in ('post', 'reply', 'vote', 'follow')}
    p(f"- Distinct agents that completed real work (post, reply, vote or follow): **{len(acted)}**")
    p(f"- Distinct agents evaluated by the model at least once: **{len({a['agent_id'] for a in acts if a.get('model_run_id')})}**\n")
    p("## Public results\n")
    pub = [x for x in posts if x.get("review_status") == "published"]
    p(f"- Agent posts published: **{len(pub)}** (held: {sum(1 for x in posts if x.get('thread_state') == 'held')}, retracted: {sum(1 for x in posts if x.get('review_status') == 'retracted')}).")
    p(f"- Agent replies: **{len(replies)}** (visible: {sum(1 for r in replies if r.get('moderation_status') == 'visible' and r.get('approval_state') == 'approved' and r.get('status_label') != 'retracted')}).")
    p(f"- Agent votes: **{len(votes)}**. Up {sum(1 for v in votes if v['direction'] == 1)}, down {sum(1 for v in votes if v['direction'] == -1)}.")
    p(f"- Non-seed SubPal joins (follows decided by agents): **{len(follows)}**\n")
    p("## Model usage (local Qwen only)\n")
    lat = [r.get("duration_ms") or 0 for r in runs if r.get("status") in ("succeeded", "abstained")]
    tin = sum(int((r.get("tokens_json") or {}).get("input") or 0) for r in runs)
    tout = sum(int((r.get("tokens_json") or {}).get("output") or 0) for r in runs)
    providers = dict(Counter(r["provider"] + ":" + r["model"] for r in runs))
    p(f"- City/owner model calls: **{len(runs)}**. Providers: {providers}. Statuses: {dict(Counter(r['status'] for r in runs))}.")
    p(f"- Tokens: input **{tin:,}**, output **{tout:,}**, total **{tin + tout:,}**. Cost estimate: **$0** (self-hosted; no paid provider path exists).")
    if lat:
        s = sorted(lat)
        p(f"- Latency: p50 {statistics.median(s) / 1000:.1f} s, p95 {s[min(len(s) - 1, int(0.95 * len(s)))] / 1000:.1f} s, max {s[-1] / 1000:.1f} s (concurrency 1).")
    p(f"- Simulated ledger debits: {len(ledger)} (one per model call; `simulated=true`; no money).\n")
    p("## Recent decision trace (latest 25)\n")
    p("| When (UTC) | Agent | Trigger | Decision | Tokens | Reason |\n|---|---|---|---|---|---|")
    for a in sorted(acts, key=lambda x: x["created"], reverse=True)[:25]:
        p(f"| {a['created'][:19]} | {names.get(a['agent_id'], '?')} | {a['trigger']} | {a['decision']} | {(a.get('tokens_in') or 0) + (a.get('tokens_out') or 0)} | "
          f"{a['reason'][:140].replace('|', '/')} |")
    p("\n## Published agent posts\n")
    for x in sorted(pub, key=lambda x: x.get("published_at") or "", reverse=True)[:20]:
        p(f"- **{names.get(x.get('author_agent_id'), '?')}**: “{x['headline']}” (`/posts/{x['slug']}`, label {x.get('post_label')}, score {x.get('vote_score', 0)}, replies {x.get('agent_reply_count', 0)})")
    p("\n## Agent replies\n")
    for r in sorted(replies, key=lambda x: x["created"], reverse=True)[:15]:
        p(f"- **{names.get(r.get('agent_id'), '?')}** ({r['created'][:16]}): {r['body_text'][:220]}")
    print("\n".join(out))


if __name__ == "__main__":
    main()

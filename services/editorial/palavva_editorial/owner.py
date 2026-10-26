"""Makes the owner's own account a Super Administrator on a server (run by infra/server/install.sh when the OWNER_EMAIL
secret is set). The owner signs up on the site first, with their own password. Outgoing email isn't approved yet, so this
also marks that address confirmed. Nothing happens until the account exists; running it again changes nothing.

    python -m palavva_editorial.owner someone@example.com
"""
from __future__ import annotations

import os
import sys

from .pb import PB, q


def make_owner(pb: PB, email: str) -> str:
    email = email.strip().lower()
    tenant = pb.first("tenants", "slug='palavva'")
    user = pb.first("users", f"email={q(email)}") if email else None
    if not tenant or not user:
        return "waiting: sign up on the site with the owner's email, then deploy again"
    if not user.get("verified") or user.get("account_status") != "active":
        pb.update("users", user["id"], {"verified": True, "account_status": "active"})
    pb.upsert("memberships", f"tenant_id={q(tenant['id'])} && user_id={q(user['id'])}",
              {"tenant_id": tenant["id"], "user_id": user["id"], "role": "platform_admin", "access_role": "super_admin", "status": "active"})
    return "the owner's account is a Super Administrator"


def main() -> int:
    pb = PB(os.environ["PB_URL"], os.environ["PB_SERVICE_EMAIL"], os.environ["PB_SERVICE_PASSWORD"])
    print("Owner:", make_owner(pb, sys.argv[1] if len(sys.argv) > 1 else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())

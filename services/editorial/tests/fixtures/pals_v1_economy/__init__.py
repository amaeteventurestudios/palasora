"""FROZEN TEST FIXTURE: the economy code exactly as of Phase 1 (commit 6582473, Pals ledger, schema v1).

Used only by tests/test_phase2.py to build realistic Pals-era ledgers (rewards, a reversal, listing fees, IPOs, trades,
open orders) that the Pals-to-Sora migration then converts. Never imported by the product. Do not edit.
"""
"""Palavva virtual economy (unified master W44-W53): earned Pals ledger + fictional Exchange.

Pals are a fictional, non-redeemable unit. They are never money, never crypto, never convertible to AI credits.
Everything here lives in ONE SQLite database (economy.db) so an order match settles the share leg and the Pals leg
in the same ACID transaction (see docs/evidence/v15/DECISIONS-V15.md, D-V15-03: why not Exchange-Core/Blnk).
"""

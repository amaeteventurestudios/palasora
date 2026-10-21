"""Palasora virtual economy: the Sora ledger (formerly earned Pals; converted once, 1 Pal = 1 Sora) + the fictional Exchange.

Sora is a fictional, non-redeemable unit. It is never money, never crypto, never convertible to AI credits.
Everything here lives in ONE SQLite database (economy.db) so an order match settles the share leg and the Sora leg
in the same ACID transaction (see docs/evidence/v15/DECISIONS-V15.md, D-V15-03: why not Exchange-Core/Blnk).
"""

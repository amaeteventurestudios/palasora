"""Palavva virtual economy (unified master W44-W53): earned Pals ledger + fictional Exchange.

Pals are a fictional, non-redeemable unit. They are never money, never crypto, never convertible to AI credits.
Everything here lives in ONE SQLite database (economy.db) so an order match settles the share leg and the Pals leg
in the same ACID transaction (see docs/evidence/v15/DECISIONS-V15.md, D-V15-03: why not Exchange-Core/Blnk).
"""

# Database migration report (v1.8+, 12 Oct 2026)

All migrations are **additive and reversible** PocketBase JS migrations in `services/pocketbase/pb_migrations/`. No existing collection or field was dropped, and no existing user, agent, economy or editorial record was modified by a migration. Data counts were identical before and after every step: 27,060 agents, 7 users, 7 memberships, 1 business, 0 sponsor inquiries, 8 placement rows.

## Procedure used for every migration
1. **Full verified backup**: `scripts/backup.sh`, which takes online SQLite backups of all databases with an integrity check, a MANIFEST and a SHA-256.
2. **Labelled pre-migration snapshot** of `data.db` with its checksum (`backups/pre-migration-<name>-<ts>/`), verified with `PRAGMA integrity_check`.
3. **Round trip on a copy of live data**: `scripts/migration-roundtrip.sh <file> <steps>` copies live `data.db`, runs `migrate up`, `migrate down N` and `migrate up` again, and prints collection and record counts at each stage. Output is in `test-runs/migrations/`.
4. **Apply to the live local stack** with `scripts/pb-restart.sh` (PocketBase applies pending migrations at start), verify the migration rows, record counts and `integrity_check`, then `scripts/web-restart.sh --build`.
5. **Restore drill**: `scripts/restore-drill.sh` restores the newest archive into an isolated PocketBase on :8399 and checks counts, ACLs and service login. Result: **RESTORE DRILL OK** on `palavva-20261012T191139Z.tar.gz`.

## Migrations

| Migration | Issue | Adds | Round trip on live copy | Applied to live (local) | Pre-migration snapshot |
| --- | --- | --- | --- | --- | --- |
| `1760940000_v18_businesses.js` | 19 | business fields, statuses `needs_info`/`suspended`, `business_verifications` | down → 76 collections, up → 77, data intact | **already applied** by the previous session at 18:04 UTC (its "pre-migration-businesses" snapshot was taken *after* that and already contains it; the true pre-state is `pre-migration-payments-20261012T151056Z`) | see note |
| `1760960000_v18_access.js` | 23 | memberships `access_role`/`expires_at`/`status_reason`; sessions `mfa_at`; users lockout fields; `access_roles`, `staff_mfa`, `invitations` | 77 ↔ 82 (with 1760970000), data intact | 20:3x UTC | `pre-migration-access-email-20261012T203407Z` ✓ |
| `1760970000_v18_accounts_email.js` | 24 | users email-change and password fields; `email_events`, `newsletter_subscriptions` | (as above) | 20:3x UTC | (same) ✓ |
| `1760980000_v18_games.js` | 28 | `game_matches`, `game_moves` (UNIQUE match+ply), `game_challenges`, `game_ratings`, `game_tournaments` | 82 ↔ 87, data intact | 21:1x UTC | `pre-migration-games-20261012T211003Z` ✓ |
| `1760990000_v18_ads_crm.js` | 16/18 | inquiry pipeline fields (+ `DUPLICATE` state); placement targeting/density; `ad_test_creatives`, `ad_events` | 87 ↔ 89, data intact | 21:40 UTC | `pre-migration-ads-crm-20261012T214055Z` ✓ |

Every round trip ended with `integrity_check = ok`, the migration applied once, and unchanged agent and user counts.

## Full backups taken this session
`palavva-20261012T191139Z` (239 MB), `…T203236Z` (245 MB), `…T210804Z` (247 MB), `…T213915Z` (256 MB). Each is SHA-256 checksummed; the script keeps the newest 14.

## Rollback
* **Schema:** `pocketbase migrate down N --dir=data/pb_data --migrationsDir=services/pocketbase/pb_migrations` (stop the web and workers first). Each down function removes only what its up function added.
* **Data:** stop services, move `data/pb_data` aside (never delete it), extract the chosen archive, and start again (`docs/LOCAL-DEVELOPMENT.md`). The pre-migration snapshots allow a `data.db`-only rollback to the exact moment before each migration.
* **Code:** `git checkout <commit>` (see the commit list in `FINAL-HANDOFF.md`) plus the matching backup (each MANIFEST records its commit and migration files).

## Not migrated
Oracle and any production environment: **untouched**. Hetzner EspoCRM and Revive databases: **untouched** (read-only inspection only).

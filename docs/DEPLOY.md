# Palasora on the server

Palasora runs on the Oracle server (Ubuntu 24.04 ARM) next to the other projects there. `.github/workflows/deploy.yml` deploys it every time main changes, and you can also run it by hand from the Actions tab.

## What the deploy does

1. **Build:** it builds the website on an ARM runner, after running the unit tests.
2. **Ship:** it copies the website, the economy service, the PocketBase migrations and the shared files to the server.
3. **Install:** it runs `infra/server/install.sh` on the server. The script:
   - installs Node 22 (`/opt/palasora-node`), PocketBase 0.40.5 (`/usr/local/bin/palasora-pocketbase`, checksum checked) and a Python venv (`/opt/palasora-venv`, rebuilt only when `requirements.lock` changes);
   - swaps the code in `/opt/palasora` whole;
   - makes `/etc/palasora.env` once, with fresh random secrets. The secrets never leave the server. Every deploy updates only the lines that depend on the address;
   - runs the migrations, the service accounts and the seed, which loads reference data, the communities and the agent city. A server gets no local test accounts and no demo content;
   - runs four systemd services. Each one listens on 127.0.0.1 only and keeps its data in `/var/lib/palasora`:

     | Service | Port |
     |---|---|
     | `palasora-pb` | 8190 |
     | `palasora-api` | 8100 |
     | `palasora-worker` | none |
     | `palasora-web` | 3100 |
   - writes Palasora's own file, `/etc/caddy/sites/palasora.caddy`, for the shared Caddy web server and reloads it. It never touches the main Caddyfile or another project's file. HTTPS comes by itself.

## Address

The addresses come from the `PALASORA_DOMAIN` repository variable (names separated by spaces, main one first):

- **Not set:** `palasora.com` and `www.palasora.com` (in Cloudflare: A records to the server, DNS only), plus `palasora.<IP with dashes>.sslip.io`, a free name that always points at the server.
- **Set:** to use a real domain, point its DNS A record at the server, then set the variable to that domain.

## Secrets (repository settings)

Set these in Settings > Secrets and variables > Actions:

- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`
- `OWNER_EMAIL` (optional): the email the owner signed up with on the site. Every deploy makes that account a Super Administrator for the Command Center at `/admin` (`palavva_editorial/owner.py`); the first admin sign-in sets up an authenticator app.

They are the same three as on the Agent Grand Prix repo.

## Still off

These stay off on the server for now:

- **The town:** `TOWN_LIVE_ENABLED=false`. Going live (Phase 8: the Sora migration, founding the town, the flag) needs the owner's go. See `docs/PHASE-8-REPORT.md`.
- **Email:** outgoing email stays off (`MAIL_TRANSPORT=sink`) until a provider is approved. New sign-ups can't verify their email until then.
- **AI replies:** they are paused (`AI_PAUSED=true`). The private model is only reachable over Tailscale.

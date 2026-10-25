#!/usr/bin/env bash
# Runs on the server (sent by .github/workflows/deploy.yml). Puts Palasora next to whatever else the server runs:
#   - PocketBase, the economy service, its worker and the website, as systemd services that restart on failure and reboot;
#   - every service listens on 127.0.0.1 only; the shared Caddy web server (installed by the first project on this
#     server) is the only thing on the internet, through Palasora's own site file /etc/caddy/sites/palasora.caddy.
# Never touches /etc/caddy/Caddyfile or another project's site file. Secrets are made once on the server and never leave it.
# The town stays off (TOWN_LIVE_ENABLED=false): switching it on is Phase 8's go-live, which needs the owner's go.
set -euo pipefail
: "${PALASORA_DOMAIN:?set PALASORA_DOMAIN}"
APP=/opt/palasora VENV=/opt/palasora-venv NODE_DIR=/opt/palasora-node DATA=/var/lib/palasora ENVF=/etc/palasora.env
NODE_V=v22.11.0 PB_V=0.40.5 PB_PORT=8190 API_PORT=8100 WEB_PORT=3100
case "$(uname -m)" in aarch64|arm64) ARCH=arm64 NARCH=arm64 ;; *) ARCH=amd64 NARCH=x64 ;; esac
as_app() { sudo -u palasora env -i HOME="$DATA" PATH=/usr/bin:/bin bash -c "set -a; . $ENVF; set +a; $1"; }

# ---- system packages, user, runtimes ----
if ! python3 -c 'import ensurepip' >/dev/null 2>&1 || ! command -v unzip >/dev/null; then
  sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv unzip >/dev/null
fi
id palasora >/dev/null 2>&1 || sudo useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin palasora
sudo mkdir -p "$DATA/data"/{pb_data,analytics,mail-sink,logs,run,secrets} && sudo chown -R palasora:palasora "$DATA"
if [ "$("$NODE_DIR/bin/node" --version 2>/dev/null)" != "$NODE_V" ]; then
  curl -fsSL "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-$NARCH.tar.xz" -o /tmp/node.tar.xz
  sudo rm -rf "$NODE_DIR" && sudo mkdir -p "$NODE_DIR" && sudo tar -xJf /tmp/node.tar.xz -C "$NODE_DIR" --strip-components=1 && rm -f /tmp/node.tar.xz
fi
if [ "$(/usr/local/bin/palasora-pocketbase --version 2>/dev/null | awk '{print $NF}')" != "$PB_V" ]; then
  Z="pocketbase_${PB_V}_linux_${ARCH}.zip" U="https://github.com/pocketbase/pocketbase/releases/download/v$PB_V"
  (cd /tmp && curl -fsSLO "$U/$Z" && curl -fsSL "$U/checksums.txt" | grep " $Z\$" | sha256sum -c - >/dev/null && unzip -oq "$Z" pocketbase)
  sudo install -m 755 /tmp/pocketbase /usr/local/bin/palasora-pocketbase && rm -f "/tmp/$Z" /tmp/pocketbase
fi

# ---- code (swapped in whole, so a failed unpack leaves the running copy alone) ----
sudo rm -rf "$APP.new" && sudo mkdir -p "$APP.new" && sudo tar -xzf /tmp/palasora.tgz -C "$APP.new" && rm -f /tmp/palasora.tgz
sudo rm -rf "$APP.old"; [ -d "$APP" ] && sudo mv "$APP" "$APP.old"; sudo mv "$APP.new" "$APP"
sudo chown -R root:root "$APP"
# Next.js keeps its cache beside the build; point it at the data folder (the code itself stays read-only)
sudo mkdir -p "$DATA/cache/next" && sudo chown -R palasora:palasora "$DATA/cache" && sudo rm -rf "$APP/web/.next/cache" && sudo ln -s "$DATA/cache/next" "$APP/web/.next/cache"
LOCK="$APP/services/editorial/requirements.lock"
if [ ! -x "$VENV/bin/python" ] || ! sudo cmp -s "$LOCK" "$VENV/requirements.lock"; then
  sudo rm -rf "$VENV" && sudo python3 -m venv "$VENV"
  sudo "$VENV/bin/pip" install -q --disable-pip-version-check -r "$LOCK" && sudo cp "$LOCK" "$VENV/requirements.lock"
fi

# ---- settings: secrets are made once; the address-dependent lines follow the domain on every deploy ----
if ! sudo test -f "$ENVF"; then
  r() { openssl rand -hex 24; }
  sudo install -m 640 -o root -g palasora /dev/null "$ENVF"
  sudo tee "$ENVF" >/dev/null <<ENV
# Palasora on this server. Made by infra/server/install.sh; secrets stay here (never in the repo or in chat).
PALAVVA_ENV=production
NODE_ENV=production
PALAVVA_DATA_DIR=$DATA/data
PB_URL=http://127.0.0.1:$PB_PORT
PB_SERVICE_EMAIL=service@palasora.internal
PB_SERVICE_PASSWORD=$(r)
PB_WORKER_EMAIL=worker@palasora.internal
PB_WORKER_PASSWORD=$(r)
EDITORIAL_URL=http://127.0.0.1:$API_PORT
EDITORIAL_SERVICE_TOKEN=$(r)
ACCESS_ENCRYPTION_KEY=$(openssl rand -hex 32)
SESSION_TTL_DAYS=14
SHOW_DEMO_CONTENT=false
SEED_DEMO_CONTENT=false
SEED_LOCAL_ACCOUNTS=false
DEMO_THREADS_ENABLED=false
REQUIRE_EMAIL_VERIFICATION=true
MAIL_TRANSPORT=sink
MAIL_LIVE_AUTHORIZED=false
STAFF_MFA_REQUIRED=true
MODEL_PROVIDER=ollama
AI_PAUSED=true
AUTO_PUBLISH_DISABLED=true
PAID_FALLBACKS_ENABLED=false
AD_SLOTS_DISABLED=true
ORACLE_DEPLOYMENT_AUTHORIZED=true
PUBLIC_LAUNCH_AUTHORIZED=false
TOWN_LIVE_ENABLED=false
ENV
fi
setkv() { sudo sed -i "/^$1=/d" "$ENVF"; printf '%s=%s\n' "$1" "$2" | sudo tee -a "$ENVF" >/dev/null; }
setkv WEB_ORIGIN "https://$PALASORA_DOMAIN"
setkv PUBLIC_ORIGIN "https://$PALASORA_DOMAIN"
setkv TENANT_HOSTS "'{\"$PALASORA_DOMAIN\":\"palavva\"}'"
sudo grep -q '^TOWN_LIVE_ENABLED=true' "$ENVF" && echo 'Note: TOWN_LIVE_ENABLED=true was set on the server by hand; leaving it as it is.'

# ---- services ----
unit() {  # name, description, working dir, command, extra [Service] lines
  sudo tee "/etc/systemd/system/$1.service" >/dev/null <<UNIT
[Unit]
Description=$2
After=network-online.target palasora-pb.service
Wants=network-online.target
[Service]
User=palasora
Group=palasora
EnvironmentFile=$ENVF
WorkingDirectory=$3
ExecStart=$4
$5
Restart=always
RestartSec=5
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ReadWritePaths=$DATA
[Install]
WantedBy=multi-user.target
UNIT
}
PB="/usr/local/bin/palasora-pocketbase" PYENV="Environment=PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1"
PBARGS="--dir=$DATA/data/pb_data --migrationsDir=$APP/services/pocketbase/pb_migrations --hooksDir=$APP/services/pocketbase/pb_hooks"
unit palasora-pb "Palasora database (PocketBase, loopback only)" "$DATA" "$PB serve $PBARGS --http=127.0.0.1:$PB_PORT" ""
unit palasora-api "Palasora economy and town service" "$APP/services/editorial" \
  "$VENV/bin/python -m uvicorn palavva_editorial.api:app --host 127.0.0.1 --port $API_PORT" "$PYENV"
unit palasora-worker "Palasora worker (town events; the town's hourly tick only once TOWN_LIVE_ENABLED=true)" "$APP/services/editorial" \
  "$VENV/bin/python -m palavva_editorial.worker" "$PYENV"
unit palasora-web "Palasora website" "$APP/web" "$NODE_DIR/bin/node server.js" \
  "Environment=HOSTNAME=127.0.0.1 PORT=$WEB_PORT NEXT_TELEMETRY_DISABLED=1"
sudo systemctl daemon-reload

# Database first: migrations and the two service accounts, then the seed (reference data only; safe to re-run).
sudo systemctl stop palasora-web palasora-worker palasora-api palasora-pb 2>/dev/null || true
as_app "$PB migrate up $PBARGS >/dev/null && $PB superuser upsert \"\$PB_SERVICE_EMAIL\" \"\$PB_SERVICE_PASSWORD\" --dir=$DATA/data/pb_data >/dev/null \
  && $PB superuser upsert \"\$PB_WORKER_EMAIL\" \"\$PB_WORKER_PASSWORD\" --dir=$DATA/data/pb_data >/dev/null"
sudo systemctl enable --now palasora-pb >/dev/null
for i in $(seq 1 60); do curl -fsS -o /dev/null "http://127.0.0.1:$PB_PORT/api/health" 2>/dev/null && break; sleep 1; done
as_app "cd $APP/services/editorial && $VENV/bin/python -m palavva_editorial.seed" > /tmp/palasora-seed.log 2>&1 \
  || { echo 'Seed failed:'; tail -20 /tmp/palasora-seed.log; exit 1; }
for s in palasora-api palasora-worker palasora-web; do sudo systemctl enable "$s" >/dev/null; sudo systemctl restart "$s"; done
sudo rm -rf "$APP.old"

# ---- the website's address: Palasora's own file in the shared Caddy ----
if [ ! -x /usr/local/bin/caddy ] || [ ! -d /etc/caddy/sites ]; then
  echo 'The shared Caddy web server is missing (the Agent Grand Prix deploy installs it). Palasora runs, but is not on the web yet.'; exit 1
fi
sudo tee /etc/caddy/sites/palasora.caddy >/dev/null <<CADDY
$PALASORA_DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$WEB_PORT
}
CADDY
sudo /usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
sudo systemctl reload caddy

# ---- checks ----
for i in $(seq 1 60); do curl -fsS -o /dev/null -H "Host: $PALASORA_DOMAIN" "http://127.0.0.1:$WEB_PORT/api/v1/health" 2>/dev/null && break; sleep 1; done
for s in palasora-pb palasora-api palasora-worker palasora-web caddy; do printf '%-16s %s\n' "$s" "$(systemctl is-active "$s")"; done
curl -fsS -o /dev/null "http://127.0.0.1:$API_PORT/health" && echo 'Economy service answers'
curl -fsS -o /dev/null -H "Host: $PALASORA_DOMAIN" "http://127.0.0.1:$WEB_PORT/" && echo 'Website answers on the server'

#!/usr/bin/env bash
# Create .env.local (random secrets), data directories, run migrations, create service
# superusers and seed reference data. Safe to re-run: never deletes existing data.
source "$(dirname "$0")/lib.sh"
TARGET="${PALAVVA_ENV_FILE:-$ROOT/.env.local}"
if [ ! -f "$TARGET" ]; then
  rnd() { openssl rand -hex 24; }
  sed -e "s/^PB_SERVICE_PASSWORD=.*/PB_SERVICE_PASSWORD=$(rnd)/" \
      -e "s/^PB_WORKER_PASSWORD=.*/PB_WORKER_PASSWORD=$(rnd)/" \
      -e "s/^EDITORIAL_SERVICE_TOKEN=.*/EDITORIAL_SERVICE_TOKEN=$(rnd)/" \
      -e "s/^LOCAL_DEMO_PASSWORD=.*/LOCAL_DEMO_PASSWORD=pv-$(openssl rand -hex 8)/" \
      "$ROOT/.env.example" > "$TARGET"
  chmod 600 "$TARGET"
  echo "Created $TARGET with generated secrets (values not printed)."
fi
ENV_FILE="$TARGET"; load_env
mkdir -p "$PALAVVA_DATA_DIR"/{pb_data,analytics,mail-sink,logs,run} "$ROOT/backups"
"$PB_BIN" migrate up --dir="$PALAVVA_DATA_DIR/pb_data" --migrationsDir="$ROOT/services/pocketbase/pb_migrations" >/dev/null
"$PB_BIN" superuser upsert "$PB_SERVICE_EMAIL" "$PB_SERVICE_PASSWORD" --dir="$PALAVVA_DATA_DIR/pb_data" >/dev/null
"$PB_BIN" superuser upsert "$PB_WORKER_EMAIL" "$PB_WORKER_PASSWORD" --dir="$PALAVVA_DATA_DIR/pb_data" >/dev/null
echo "Migrations applied and service accounts ensured in $PALAVVA_DATA_DIR/pb_data"

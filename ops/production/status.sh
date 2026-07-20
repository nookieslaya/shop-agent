#!/bin/sh
set -eu
root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root_dir"
dc(){ docker compose --env-file .env.production -f docker-compose.production.yml -p shop-agent "$@"; }
dc ps
printf "\n=== READY ===\n"
port=$(sed -n 's/^APP_PORT=//p' .env.production | tail -n 1)
wget -qO- "http://127.0.0.1:${port:-20137}/ready" || true
printf "\n\n=== RECENT LOGS ===\n"
dc logs --tail=40 api worker backup

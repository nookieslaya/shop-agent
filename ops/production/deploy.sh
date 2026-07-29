#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root_dir"
test -f .env.production || { echo "Run: sh ops/production/bootstrap-env.sh" >&2; exit 1; }
if ! git diff --quiet || ! git diff --cached --quiet; then echo "Tracked files contain local changes; deployment stopped." >&2; exit 1; fi
if [ "${SKIP_PULL:-false}" != "true" ]; then
  deploy_branch=$(git branch --show-current)
  test -n "$deploy_branch" || { echo "Deployment requires a named git branch." >&2; exit 1; }
  git fetch origin "$deploy_branch"
  git merge --ff-only "origin/$deploy_branch"
fi
dc(){ docker compose --env-file .env.production -f docker-compose.production.yml -p shop-agent "$@"; }
echo "[1/6] Validating production configuration"
dc config --quiet
echo "[2/6] Building immutable application images"
dc build api backup
echo "[3/6] Starting private database"
dc up -d postgres
echo "[4/6] Applying database migrations"
dc run --rm migrate
echo "[5/6] Starting API, worker and backup"
dc up -d api worker backup
echo "[6/6] Waiting for readiness"
port=$(sed -n 's/^APP_PORT=//p' .env.production | tail -n 1)
ready=false
for attempt in $(seq 1 30); do
  if wget -qO- "http://127.0.0.1:${port:-20137}/ready" >/dev/null 2>&1; then ready=true; break; fi
  sleep 3
done
dc ps
if [ "$ready" != "true" ]; then
  echo "Deployment started, but readiness did not pass. Inspect: sh ops/production/status.sh" >&2
  exit 1
fi
echo "Deployment ready on http://127.0.0.1:${port:-20137}"

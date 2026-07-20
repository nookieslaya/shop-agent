#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
target="$root_dir/.env.production"
if [ -e "$target" ]; then
  echo ".env.production already exists; refusing to overwrite it." >&2
  exit 1
fi
command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }
printf "Wklej OPENAI_API_KEY (znaki nie będą widoczne): "
stty -echo
IFS= read -r openai_key
stty echo
printf "\n"
if [ "${#openai_key}" -lt 20 ]; then echo "OPENAI_API_KEY is too short." >&2; exit 1; fi
postgres_password=$(openssl rand -hex 24)
admin_session_secret=$(openssl rand -hex 32)
umask 077
cat > "$target" <<EOF
POSTGRES_PASSWORD=$postgres_password
ADMIN_SESSION_SECRET=$admin_session_secret
OPENAI_API_KEY=$openai_key
APP_PORT=20137
APP_IMAGE_TAG=production
NORTBERG_FEED_URL=https://nortberg.pl/xml,google,32dycf1j4906.xml
OPENAI_INTENT_MODEL=gpt-5-nano
OPENAI_ANSWER_MODEL=gpt-5-nano
SCRAPE_CONCURRENCY=1
REQUEST_DELAY_MS=700
SYNC_WORKER_POLL_MS=3000
SYNC_STALE_MINUTES=10
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_DAYS=14
ENRICH_LIMIT=0
EOF
chmod 600 "$target"
echo "Created $target with mode 600. Secrets were not printed."

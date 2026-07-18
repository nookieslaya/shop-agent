#!/bin/sh
set -eu
: "${PGHOST:?PGHOST is required}" "${PGUSER:?PGUSER is required}" "${PGPASSWORD:?PGPASSWORD is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
file="${1:-}"
case "$file" in ''|*/*|*..*) echo "Usage: verify-backup.sh BACKUP_FILE.dump" >&2; exit 2;; esac
case "$file" in *.dump) :;; *) echo "Backup file must end with .dump" >&2; exit 2;; esac
archive="$BACKUP_DIR/$file"
test -f "$archive" || { echo "Backup not found: $file" >&2; exit 2; }
test -f "$archive.sha256" && (cd "$BACKUP_DIR" && sha256sum -c "$file.sha256")
pg_restore --list "$archive" >/dev/null
verify_db="shop_agent_verify_$(date -u +%s)_$$"
cleanup(){ dropdb --if-exists "$verify_db" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
createdb "$verify_db"
pg_restore --exit-on-error --no-owner --no-acl --dbname="$verify_db" "$archive"
psql --dbname="$verify_db" --set=ON_ERROR_STOP=1 --tuples-only --command="SELECT COUNT(*) FROM stores;" >/dev/null
psql --dbname="${PGDATABASE:-shop_agent}" --set=ON_ERROR_STOP=1 <<SQL
UPDATE runtime_heartbeats SET metadata=metadata || jsonb_build_object('verified',true,'verifiedAt',now())
WHERE component='postgres-backup' AND metadata->>'file'='$file';
SQL
echo "Backup verified successfully: $file"

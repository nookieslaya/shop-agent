#!/bin/sh
set -eu
: "${PGHOST:?PGHOST is required}" "${PGUSER:?PGUSER is required}" "${PGPASSWORD:?PGPASSWORD is required}" "${PGDATABASE:?PGDATABASE is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
file="${1:-}"
confirmation="${2:-}"
case "$file" in ''|*/*|*..*) echo "Usage: restore-backup.sh BACKUP_FILE.dump RESTORE-$PGDATABASE" >&2; exit 2;; esac
case "$file" in *.dump) :;; *) echo "Backup file must end with .dump" >&2; exit 2;; esac
test "$confirmation" = "RESTORE-$PGDATABASE" || { echo "Exact confirmation RESTORE-$PGDATABASE is required" >&2; exit 2; }
archive="$BACKUP_DIR/$file"
test -f "$archive" || { echo "Backup not found: $file" >&2; exit 2; }
test -f "$archive.sha256" && (cd "$BACKUP_DIR" && sha256sum -c "$file.sha256")
pg_restore --list "$archive" >/dev/null
psql --dbname=postgres --set=ON_ERROR_STOP=1 --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$PGDATABASE' AND pid<>pg_backend_pid();"
dropdb --if-exists "$PGDATABASE"
createdb "$PGDATABASE"
pg_restore --exit-on-error --no-owner --no-acl --dbname="$PGDATABASE" "$archive"
psql --dbname="$PGDATABASE" --set=ON_ERROR_STOP=1 --command="SELECT COUNT(*) AS stores FROM stores;"
echo "Database restored successfully from: $file"

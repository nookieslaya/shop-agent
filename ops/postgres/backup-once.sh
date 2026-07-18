#!/bin/sh
set -eu

: "${PGHOST:?PGHOST is required}" "${PGUSER:?PGUSER is required}" "${PGDATABASE:?PGDATABASE is required}" "${PGPASSWORD:?PGPASSWORD is required}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="${PGDATABASE}_${timestamp}"
temporary="$BACKUP_DIR/.${name}.dump.tmp"
archive="$BACKUP_DIR/${name}.dump"

cleanup() { rm -f "$temporary"; }
trap cleanup EXIT INT TERM
pg_dump --format=custom --compress=9 --no-owner --no-acl --file="$temporary" "$PGDATABASE"
pg_restore --list "$temporary" >/dev/null
mv "$temporary" "$archive"
checksum="$(sha256sum "$archive" | awk '{print $1}')"
size="$(wc -c < "$archive" | tr -d ' ')"
printf '%s  %s\n' "$checksum" "$(basename "$archive")" > "$archive.sha256"
printf '{"database":"%s","file":"%s","createdAt":"%s","sizeBytes":%s,"sha256":"%s"}\n' "$PGDATABASE" "$(basename "$archive")" "$timestamp" "$size" "$checksum" > "$archive.json"

psql --dbname="$PGDATABASE" --set=ON_ERROR_STOP=1 <<SQL
INSERT INTO runtime_heartbeats(component, instance_id, metadata, heartbeat_at)
VALUES ('postgres-backup', '$(hostname)', jsonb_build_object('file','$(basename "$archive")','sizeBytes',$size,'sha256','$checksum','verified',false), now())
ON CONFLICT (component) DO UPDATE SET instance_id=excluded.instance_id, metadata=excluded.metadata, heartbeat_at=now();
SQL

find "$BACKUP_DIR" -type f \( -name '*.dump' -o -name '*.dump.sha256' -o -name '*.dump.json' \) -mtime "+$RETENTION_DAYS" -delete
echo "Backup completed: $archive ($size bytes)"

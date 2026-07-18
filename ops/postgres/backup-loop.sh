#!/bin/sh
set -eu
interval_hours="${BACKUP_INTERVAL_HOURS:-24}"
case "$interval_hours" in *[!0-9]*|'') echo "BACKUP_INTERVAL_HOURS must be an integer" >&2; exit 1;; esac
while true; do
  if ! sh /scripts/backup-once.sh; then echo "Backup attempt failed" >&2; fi
  sleep "$((interval_hours * 3600))"
done

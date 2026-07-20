#!/bin/sh
set -eu
root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root_dir"
printf "Nazwa użytkownika administratora: "
IFS= read -r username
case "$username" in ''|*[!a-zA-Z0-9._-]*) echo "Nieprawidłowa nazwa użytkownika." >&2; exit 1;; esac
printf "Hasło administratora (minimum 12 znaków, niewidoczne): "
stty -echo
IFS= read -r password
stty echo
printf "\n"
if [ "${#password}" -lt 12 ]; then echo "Hasło jest za krótkie." >&2; exit 1; fi
dc(){ docker compose --env-file .env.production -f docker-compose.production.yml -p shop-agent "$@"; }
export ADMIN_NEW_PASSWORD="$password"
dc run --rm -e ADMIN_NEW_PASSWORD app npm run admin:user -- --action=create --username="$username" --role=owner
unset ADMIN_NEW_PASSWORD
unset password
echo "Konto owner zostało utworzone."

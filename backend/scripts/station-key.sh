#!/usr/bin/env bash
# Registers a station's key: prints the SQL that adds the station to public.devices.
# Only the key's SHA-256 goes to the database; the key itself stays in the station.
#
#   backend/scripts/station-key.sh new <device_id> "<name>"
#       Creates a random key and prints it once. Put it in the station, never in git.
#   backend/scripts/station-key.sh existing <device_id> "<name>"
#       Asks for a key the station already uses (typing is not shown).
#
# Run the printed SQL in the Supabase dashboard (SQL Editor).
set -euo pipefail

usage() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

[ $# -eq 3 ] || usage
mode=$1
device_id=$2
name=$3

# Same rule as the devices table: lowercase letters, digits and dashes.
if ! [[ $device_id =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]]; then
  echo "device_id must be lowercase letters, digits and dashes, e.g. meteo-station-pueblo" >&2
  exit 1
fi

case $mode in
  new)
    key=$(openssl rand -hex 32)
    echo "Key for $device_id (shown only now, keep it safe):"
    echo
    echo "  $key"
    echo
    ;;
  existing)
    read -rsp "Key of $device_id: " key || true
    echo
    [ -n "$key" ] || { echo "empty key" >&2; exit 1; }
    ;;
  *)
    usage
    ;;
esac

hash=$(printf '%s' "$key" | shasum -a 256 | cut -d ' ' -f 1)
# SQL string: double any single quote in the name.
sql_name=${name//\'/\'\'}

echo "SQL to run in Supabase (SQL Editor):"
echo
echo "insert into public.devices (device_id, name, key_sha256)"
echo "values ('$device_id', '$sql_name', '$hash');"

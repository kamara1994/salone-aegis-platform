#!/bin/sh
# Check "app-still-works" for sec-db-firewall-rule: APP01 still reaches DB01:5432
# Runs on APP01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
set -u
out() { printf '{"passed":%s,"output":"%s"}\n' "$1" "$(printf '%s' "$2" | sed 's/"/\\"/g')"; [ "$1" = true ] && exit 0 || exit 1; }
if command -v pg_isready >/dev/null 2>&1; then
  pg_isready -h 10.10.40.10 -p 5432 -t 5 >/dev/null 2>&1 && out true "APP01 still reaches DB01:5432" || out false "SalonePay can no longer reach its database: the fix broke production"
else
  timeout 5 sh -c 'cat < /dev/null > /dev/tcp/10.10.40.10/5432' 2>/dev/null && out true "APP01 still reaches DB01:5432" || out false "SalonePay can no longer reach its database: the fix broke production"
fi

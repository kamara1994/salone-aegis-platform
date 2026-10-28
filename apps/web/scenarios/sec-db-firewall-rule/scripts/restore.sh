#!/bin/sh
# Cleanup: remove every rule tagged INC-0917 and re-apply the baseline rule set.
# Runs on FW01 through the scenario runner (SSH). Contract: scenarios/README.md
set -eu
# OPNsense API credentials come from the runner's vault, never from this file.
API="https://127.0.0.1/api/firewall/filter"
opn() { curl -sk -u "$AEGIS_OPN_KEY:$AEGIS_OPN_SECRET" -H 'Content-Type: application/json' "$@"; }
for uuid in $(opn "$API/searchRule?searchPhrase=INC-0917" | sed -n 's/.*"uuid":"\([^"]*\)".*/\1/p'); do
  opn -X POST "$API/delRule/$uuid" >/dev/null
done
opn -X POST "$API/apply" >/dev/null
echo "baseline restored"

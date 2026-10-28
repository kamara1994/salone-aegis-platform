#!/bin/sh
# Setup: a "temporary" allow-any rule from VLAN 20 to VLAN 40 left behind after INC-0917.
# Runs on FW01 through the scenario runner (SSH). Contract: scenarios/README.md
set -eu
# OPNsense API credentials come from the runner's vault, never from this file.
API="https://127.0.0.1/api/firewall/filter"
opn() { curl -sk -u "$AEGIS_OPN_KEY:$AEGIS_OPN_SECRET" -H 'Content-Type: application/json' "$@"; }
opn -X POST "$API/addRule" -d '{"rule":{"enabled":"1","action":"pass","interface":"opt2","direction":"in","ipprotocol":"inet","protocol":"any","source_net":"opt2","destination_net":"opt4","log":"0","sequence":"14","description":"TEMP troubleshooting - remove after INC-0917"}}' >/dev/null
opn -X POST "$API/apply" >/dev/null
echo "fault injected"

#!/bin/sh
# Check "no-broad-rule" for sec-db-firewall-rule: No rule allows VLAN 20 to reach VLAN 40
# Runs on FW01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
set -u
out() { printf '{"passed":%s,"output":"%s"}\n' "$1" "$(printf '%s' "$2" | sed 's/"/\\"/g')"; [ "$1" = true ] && exit 0 || exit 1; }
# Inspect the loaded ruleset (what is actually enforced), not the staged config.
bad=$(pfctl -sr 2>/dev/null | grep -E '^pass .* on (vtnet2|opt2)' | grep -E 'from (10\.10\.20\.0/24|\(opt2:network\)) to (10\.10\.40\.0/24|\(opt4:network\)|any)' || true)
[ -z "$bad" ] && out true "No running rule lets VLAN 20 reach VLAN 40" || out false "A running rule still allows VLAN 20 to VLAN 40: $(echo "$bad" | head -1)"

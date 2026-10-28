#!/bin/sh
# Check "classified" for soc-password-spray-triage: Alert classified as benign true positive with rationale
# Runs on WAZUH01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
set -u
out() { printf '{"passed":%s,"output":"%s"}\n' "$1" "$(printf '%s' "$2" | sed 's/"/\\"/g')"; [ "$1" = true ] && exit 0 || exit 1; }
# The verdict lives in the platform, not on the SIEM: ask the API for this run's linked alert.
v=$(curl -s -H "Authorization: Bearer $AEGIS_RUN_TOKEN" "$AEGIS_API/scenario-runs/$AEGIS_RUN_ID" | sed -n 's/.*"alert_verdict":"\([a-z_]*\)".*/\1/p')
[ "$v" = "benign_true_positive" ] && out true "Alert classified as benign true positive" || out false "Alert classified as ${v:-nothing yet}; the activity was real but not malicious"

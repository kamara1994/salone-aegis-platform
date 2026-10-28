# Setup: nothing changes in the lab; the attack is the conversation. Snapshot the MFA state for the check.
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
# Record the CFO's registered MFA devices at the start of the run so the check can detect a reset.
$state = Invoke-RestMethod -Uri "$env:AEGIS_IDP/users/abangura/mfa" -Headers @{ Authorization = "Bearer $env:AEGIS_IDP_TOKEN" }
$state | ConvertTo-Json -Compress | Set-Content -Path "C:\Aegis\runs\$env:AEGIS_RUN_ID-mfa.json"
"MFA state recorded"

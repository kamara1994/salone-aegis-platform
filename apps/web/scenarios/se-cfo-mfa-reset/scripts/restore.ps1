# Cleanup: put the CFO's MFA devices back to the recorded state.
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
$path = "C:\Aegis\runs\$env:AEGIS_RUN_ID-mfa.json"
if (Test-Path $path) {
  Invoke-RestMethod -Method Put -Uri "$env:AEGIS_IDP/users/abangura/mfa" -Headers @{ Authorization = "Bearer $env:AEGIS_IDP_TOKEN" } -ContentType 'application/json' -Body (Get-Content $path -Raw) | Out-Null
  Remove-Item $path
}
"baseline restored"

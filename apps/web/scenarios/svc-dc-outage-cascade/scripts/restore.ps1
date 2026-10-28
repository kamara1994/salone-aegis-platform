# Cleanup: services back on DC01 (the runner powers DC02 on).
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
Set-Service -Name 'DNS' -StartupType Automatic
Set-Service -Name 'Netlogon' -StartupType Automatic
Start-Service -Name 'DNS'
Start-Service -Name 'Netlogon'
"baseline restored"

# Cleanup: option 006 back to both domain controllers.
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
Set-DhcpServerv4OptionValue -ScopeId 10.10.20.0 -OptionId 6 -Value 10.10.10.10, 10.10.10.11 -Force
"baseline restored"

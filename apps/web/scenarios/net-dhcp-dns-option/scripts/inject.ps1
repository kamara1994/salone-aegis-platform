# Setup: someone typed a dead DNS server into scope 10.10.20.0 option 006.
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
Set-DhcpServerv4OptionValue -ScopeId 10.10.20.0 -OptionId 6 -Value 10.10.10.99 -Force
"fault injected; clients pick it up at their next renew"

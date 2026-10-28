# Setup: DC02 was shut down for patching and never came back; then DNS and Netlogon stop on DC01.
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
# DC02 power-off is done by the runner through Proxmox before this runs.
Stop-Service -Name 'DNS' -Force
Stop-Service -Name 'Netlogon' -Force
"fault injected"

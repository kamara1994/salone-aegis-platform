# Setup: make sure the new hire does not exist yet (the ticket asks you to create her).
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
Import-Module ActiveDirectory
$u = Get-ADUser -Filter "SamAccountName -eq 'akoroma'" -ErrorAction SilentlyContinue
if ($u) { Remove-ADUser -Identity $u -Confirm:$false }
"akoroma absent; ticket ready"

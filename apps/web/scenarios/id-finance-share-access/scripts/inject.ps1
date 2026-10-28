# Setup: Ibrahim was promoted to Finance Lead but his group was moved to Operations by mistake.
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
Import-Module ActiveDirectory
Remove-ADGroupMember -Identity 'GG-Finance' -Members 'iconteh' -Confirm:$false -ErrorAction SilentlyContinue
Add-ADGroupMember -Identity 'GG-Operations' -Members 'iconteh'
Set-ADUser -Identity 'iconteh' -Title 'Finance Lead'
"fault injected"

# Cleanup: put iconteh back to his baseline groups and title.
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
Import-Module ActiveDirectory
Remove-ADGroupMember -Identity 'GG-Operations' -Members 'iconteh' -Confirm:$false -ErrorAction SilentlyContinue
Add-ADGroupMember -Identity 'GG-Finance' -Members 'iconteh'
Set-ADUser -Identity 'iconteh' -Title 'Senior Accountant'
"baseline restored"

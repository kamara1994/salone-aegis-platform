# Reference solution (used by the content test, never shown to the operator during a run).
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
Import-Module ActiveDirectory
$pw = ConvertTo-SecureString ([guid]::NewGuid().ToString() + 'Aa1!') -AsPlainText -Force
New-ADUser -Name 'Aminata Koroma' -GivenName 'Aminata' -Surname 'Koroma' -SamAccountName 'akoroma' `
  -UserPrincipalName 'akoroma@corp.salonemutual.lab' -Path 'OU=Finance,OU=Staff,DC=corp,DC=salonemutual,DC=lab' `
  -Title 'Accounts Clerk' -Department 'Finance' -AccountPassword $pw -ChangePasswordAtLogon $true -Enabled $true
Add-ADGroupMember -Identity 'GG-Finance' -Members 'akoroma'
Add-ADGroupMember -Identity 'GG-MFA-Enroll' -Members 'akoroma'
"solved"

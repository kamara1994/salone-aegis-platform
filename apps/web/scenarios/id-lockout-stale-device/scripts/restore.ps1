# Cleanup: stop the stale device and unlock the account.
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
Import-Module ActiveDirectory
Invoke-Command -ComputerName 'TRAFFICGEN01' -ScriptBlock { Disable-ScheduledTask -TaskName 'Aegis\MBL-JDAVIES-sync' | Out-Null }
Unlock-ADAccount -Identity 'jdavies'
Set-ADAccountPassword -Identity 'jdavies' -Reset -NewPassword (ConvertTo-SecureString $env:AEGIS_SECRET_JDAVIES_BASE -AsPlainText -Force)
"baseline restored"

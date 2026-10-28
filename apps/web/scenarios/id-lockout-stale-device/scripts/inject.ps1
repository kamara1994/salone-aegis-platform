# Setup: jdavies changed his password; his phone (MBL-JDAVIES) keeps retrying the old one.
# Runs on DC01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
# The phone is simulated by a scheduled task on the lab traffic generator that binds as jdavies with the old password every 20 s.
Import-Module ActiveDirectory
Set-ADAccountPassword -Identity 'jdavies' -Reset -NewPassword (ConvertTo-SecureString $env:AEGIS_SECRET_JDAVIES_NEW -AsPlainText -Force)
Invoke-Command -ComputerName 'TRAFFICGEN01' -ScriptBlock { Enable-ScheduledTask -TaskName 'Aegis\MBL-JDAVIES-sync' | Out-Null }
"fault injected; lockouts start within a minute"

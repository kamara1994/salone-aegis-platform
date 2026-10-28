# Cleanup: give BackupAgent the current svc-backup credential.
# Runs on BKP01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
$cred = New-Object System.Management.Automation.PSCredential('CORP\svc-backup', (ConvertTo-SecureString $env:AEGIS_SECRET_SVC_BACKUP_BASE -AsPlainText -Force))
$svc = Get-CimInstance Win32_Service -Filter "Name='BackupAgent'"
Invoke-CimMethod -InputObject $svc -MethodName Change -Arguments @{ StartName = $cred.UserName; StartPassword = $cred.GetNetworkCredential().Password } | Out-Null
Restart-Service -Name 'BackupAgent' -Force
"baseline restored"

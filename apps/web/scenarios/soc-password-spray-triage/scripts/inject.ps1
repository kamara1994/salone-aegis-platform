# Setup: svc-backup password rotated on the DC, BackupAgent on BKP01 still holds the old one.
# Runs on BKP01 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
# The DC side rotation is done by the runner on DC01 first (AEGIS_SECRET_SVC_BACKUP_NEW); here the service keeps the old credential.
Restart-Service -Name 'BackupAgent' -Force
"fault injected; Kerberos pre-auth failures (4771) from 10.10.70.15 start at the next job"

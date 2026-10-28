# Check "share-access" for id-finance-share-access: iconteh can read \\FS01\Finance
# Runs on FS01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  # Effective access as the user, evaluated on the file server (share + NTFS), without needing his password.
  $acl = Get-Acl -Path 'D:\Shares\Finance'
  $groups = (Get-ADUser 'iconteh' -Properties MemberOf).MemberOf | ForEach-Object { (Get-ADGroup $_).Name }
  $allowed = $acl.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and ($groups -contains ($_.IdentityReference.Value -replace '^CORP\\', '')) -and ($_.FileSystemRights -match 'Read|Modify|FullControl') }
  if (-not $allowed) { Out-Check $false 'Access denied on \\FS01\Finance' }
  # The logon token only picks up the new group after sign-out: look for a fresh Kerberos logon on WS-FIN-02 since the run began.
  $since = [datetime]$env:AEGIS_RUN_STARTED_AT
  $logon = Get-WinEvent -ComputerName DC01 -FilterHashtable @{ LogName = 'Security'; Id = 4768; StartTime = $since } -ErrorAction SilentlyContinue |
    Where-Object { $_.Properties[0].Value -eq 'iconteh' } | Select-Object -First 1
  Out-Check ([bool]$logon) $(if ($logon) { 'Opened \\FS01\Finance as iconteh' } else { 'Group change made, but his logon token is old: he must sign out and back in (or reboot) to pick it up' })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

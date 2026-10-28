# Check "failures-stopped" for soc-password-spray-triage: No new 4771 events from BKP01 for 5 minutes
# Runs on DC01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  $since = (Get-Date).AddMinutes(-5)
  $n = @(Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4771; StartTime = $since } -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match '10\.10\.70\.15' }).Count
  Out-Check ($n -eq 0) $(if ($n -eq 0) { 'No new 4771 events from BKP01' } else { "BKP01 caused $n pre-auth failures in the last 5 minutes (BackupAgent still uses the old svc-backup password)" })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

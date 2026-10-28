# Check "source-fixed" for id-lockout-stale-device: No bad-password attempts from MBL-JDAVIES for 5 minutes
# Runs on DC01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  $since = (Get-Date).AddMinutes(-5)
  $hits = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4771, 4625; StartTime = $since } -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match 'jdavies' -and $_.Message -match 'MBL-JDAVIES|10\.10\.60\.' }
  $n = @($hits).Count
  Out-Check ($n -eq 0) $(if ($n -eq 0) { 'MBL-JDAVIES now uses the new password' } else { "MBL-JDAVIES sent the old password $n times in the last 5 minutes. The user has to update it on the phone." })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

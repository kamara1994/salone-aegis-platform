# Check "unlocked" for id-lockout-stale-device: jdavies is not locked out
# Runs on DC01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  Import-Module ActiveDirectory
  $u = Get-ADUser 'jdavies' -Properties LockedOut
  Out-Check (-not $u.LockedOut) $(if ($u.LockedOut) { 'jdavies is locked out' } else { 'jdavies is not locked out' })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

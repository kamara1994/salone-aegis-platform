# Check "mfa-enrolled" for onb-new-hire-finance: MFA enrollment is required at first sign-in
# Runs on DC01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  # The lab enforces MFA enrollment through membership of GG-MFA-Enroll (synced to the lab IdP).
  Import-Module ActiveDirectory
  $m = Get-ADGroupMember -Identity 'GG-MFA-Enroll' -Recursive | Where-Object SamAccountName -eq 'akoroma'
  Out-Check ([bool]$m) $(if ($m) { 'MFA required at first sign-in' } else { 'MFA is not required for akoroma (not in GG-MFA-Enroll)' })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

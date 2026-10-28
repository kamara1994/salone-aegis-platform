# Check "user-exists" for onb-new-hire-finance: Account akoroma exists and is enabled
# Runs on DC01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  Import-Module ActiveDirectory
  $u = Get-ADUser -Filter "SamAccountName -eq 'akoroma'" -Properties Enabled, DistinguishedName
  if (-not $u) { Out-Check $false 'No account named akoroma' }
  if (-not $u.Enabled) { Out-Check $false 'akoroma exists but is disabled' }
  if ($u.DistinguishedName -notmatch 'OU=Finance') { Out-Check $false "akoroma is in $($u.DistinguishedName), expected OU=Finance" }
  Out-Check $true "akoroma exists in OU=Finance and is enabled"
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

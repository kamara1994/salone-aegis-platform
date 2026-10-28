# Check "in-finance-group" for onb-new-hire-finance: akoroma is in GG-Finance
# Runs on DC01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  Import-Module ActiveDirectory
  $m = Get-ADGroupMember -Identity 'GG-Finance' -Recursive | Where-Object SamAccountName -eq 'akoroma'
  Out-Check ([bool]$m) $(if ($m) { 'Member of GG-Finance' } else { 'Not a member of GG-Finance' })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

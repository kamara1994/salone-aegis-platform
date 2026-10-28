# Check "dc2-up" for svc-dc-outage-cascade: DC02 is running for redundancy
# Runs on DC02. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  $dns = Get-Service -Name 'DNS' -ErrorAction SilentlyContinue
  $ok = $dns -and $dns.Status -eq 'Running'
  Out-Check $ok $(if ($ok) { 'DC02 is running with DNS' } else { 'DC02 DNS is not running: you still have a single point of failure' })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

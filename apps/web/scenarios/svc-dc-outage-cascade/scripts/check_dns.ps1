# Check "dns-up" for svc-dc-outage-cascade: corp.salonemutual.lab resolves from clients
# Runs on WS-FIN-02. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  Clear-DnsClientCache
  $r = Resolve-DnsName -Name 'corp.salonemutual.lab' -ErrorAction SilentlyContinue
  Out-Check ([bool]$r) $(if ($r) { 'corp.salonemutual.lab resolves' } else { 'No DNS server answers for corp.salonemutual.lab' })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

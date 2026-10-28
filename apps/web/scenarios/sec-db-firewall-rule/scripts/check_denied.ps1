# Check "db-blocked" for sec-db-firewall-rule: WS-FIN-02 to DB01:5432 is denied and logged
# Runs on WS-FIN-02. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  $t = Test-NetConnection -ComputerName 10.10.40.10 -Port 5432 -WarningAction SilentlyContinue
  if ($t.TcpTestSucceeded) { Out-Check $false 'WS-FIN-02 still connects to DB01:5432' }
  # The runner asks the firewall for a logged block of this flow in the last 2 minutes and passes the count in.
  $logged = [int]$env:AEGIS_FW_DENY_HITS
  Out-Check ($logged -gt 0) $(if ($logged -gt 0) { 'WS-FIN-02 to DB01:5432 blocked and logged' } else { 'Blocked, but not by a logged deny rule' })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

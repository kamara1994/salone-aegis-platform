# Check "reaches-salonepay" for net-gateway-wrong: WS-FIN-02 reaches SalonePay over HTTPS
# Runs on WS-FIN-02. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  $t = Test-NetConnection -ComputerName 10.10.30.20 -Port 443 -WarningAction SilentlyContinue
  Out-Check $t.TcpTestSucceeded $(if ($t.TcpTestSucceeded) { 'HTTPS to SalonePay succeeded' } else { 'HTTPS to SalonePay failed' })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

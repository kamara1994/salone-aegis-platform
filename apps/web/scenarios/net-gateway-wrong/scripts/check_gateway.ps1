# Check "gw-correct" for net-gateway-wrong: Default gateway is 10.10.20.1
# Runs on WS-FIN-02. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  $gw = (Get-NetIPConfiguration -InterfaceAlias 'Ethernet').IPv4DefaultGateway.NextHop
  Out-Check ($gw -eq '10.10.20.1') $(if ($gw -eq '10.10.20.1') { 'Default gateway 10.10.20.1' } else { "Default gateway is $(if ($gw) { $gw } else { 'empty' })" })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

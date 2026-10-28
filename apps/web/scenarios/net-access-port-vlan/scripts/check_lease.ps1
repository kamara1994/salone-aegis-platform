# Check "client-dhcp" for net-access-port-vlan: WS-OPS-03 has a 10.10.20.x lease
# Runs on WS-OPS-03. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  $ip = (Get-NetIPAddress -InterfaceAlias 'Ethernet' -AddressFamily IPv4).IPAddress
  if ($ip -like '10.10.20.*') { Out-Check $true "WS-OPS-03 lease $ip" }
  Out-Check $false "WS-OPS-03 still has $ip. The PC needs a new lease (ipconfig /renew or a restart)."
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

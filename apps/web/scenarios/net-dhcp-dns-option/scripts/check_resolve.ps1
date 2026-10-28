# Check "client-resolves" for net-dhcp-dns-option: WS-FIN-02 resolves salonepay.corp.salonemutual.lab
# Runs on WS-FIN-02. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  Clear-DnsClientCache
  $r = Resolve-DnsName -Name 'salonepay.corp.salonemutual.lab' -Type A -ErrorAction SilentlyContinue
  if ($r) { Out-Check $true "Resolved to $($r[0].IPAddress)" }
  $dns = (Get-DnsClientServerAddress -InterfaceAlias 'Ethernet' -AddressFamily IPv4).ServerAddresses -join ', '
  Out-Check $false "WS-FIN-02 cannot resolve the name (DNS $dns). Renew its lease after fixing the scope."
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

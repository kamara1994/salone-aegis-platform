# Setup: a technician "fixed the printer" and left a static IP with a wrong gateway.
# Runs on WS-FIN-02 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
$if = 'Ethernet'
$dns = (Get-DnsClientServerAddress -InterfaceAlias $if -AddressFamily IPv4).ServerAddresses
Remove-NetRoute -InterfaceAlias $if -DestinationPrefix '0.0.0.0/0' -Confirm:$false -ErrorAction SilentlyContinue
Get-NetIPAddress -InterfaceAlias $if -AddressFamily IPv4 | Remove-NetIPAddress -Confirm:$false
Set-NetIPInterface -InterfaceAlias $if -Dhcp Disabled
New-NetIPAddress -InterfaceAlias $if -IPAddress 10.10.20.45 -PrefixLength 24 -DefaultGateway 10.10.20.254 | Out-Null
Set-DnsClientServerAddress -InterfaceAlias $if -ServerAddresses $(if ($dns) { $dns } else { @('10.10.10.10', '10.10.10.11') })
"fault injected"

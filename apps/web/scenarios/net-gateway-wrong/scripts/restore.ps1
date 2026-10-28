# Cleanup: NIC back to DHCP for address and DNS.
# Runs on WS-FIN-02 through the scenario runner (WinRM). Contract: scenarios/README.md
$ErrorActionPreference = 'Stop'
$if = 'Ethernet'
Remove-NetRoute -InterfaceAlias $if -DestinationPrefix '0.0.0.0/0' -Confirm:$false -ErrorAction SilentlyContinue
Set-NetIPInterface -InterfaceAlias $if -Dhcp Enabled
Set-DnsClientServerAddress -InterfaceAlias $if -ResetServerAddresses
ipconfig /renew | Out-Null
"baseline restored"

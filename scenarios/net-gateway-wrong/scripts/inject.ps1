param([Parameter(Mandatory=$true)][string]$InterfaceAlias,
      [Parameter(Mandatory=$true)][string]$BaselineFile,
      [string]$FaultGateway = '10.10.20.254')
$ErrorActionPreference = 'Stop'
# Runner must verify lab tag, scenario scope and durable backup path before execution.
if (-not (Test-Path $BaselineFile)) {
  $routes = @(Get-NetRoute -InterfaceAlias $InterfaceAlias -DestinationPrefix '0.0.0.0/0')
  if ($routes.Count -ne 1) { throw 'Exactly one baseline default route is required' }
  $routes | Select-Object NextHop, RouteMetric | ConvertTo-Json | Set-Content $BaselineFile
}
Get-NetRoute -InterfaceAlias $InterfaceAlias -DestinationPrefix '0.0.0.0/0' | Remove-NetRoute -Confirm:$false
New-NetRoute -InterfaceAlias $InterfaceAlias -DestinationPrefix '0.0.0.0/0' -NextHop $FaultGateway

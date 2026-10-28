param([Parameter(Mandatory=$true)][string]$InterfaceAlias,
      [Parameter(Mandatory=$true)][string]$BaselineFile)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $BaselineFile)) { throw 'Baseline backup missing; refusing to guess' }
$route = Get-Content $BaselineFile | ConvertFrom-Json
Get-NetRoute -InterfaceAlias $InterfaceAlias -DestinationPrefix '0.0.0.0/0' | Remove-NetRoute -Confirm:$false
New-NetRoute -InterfaceAlias $InterfaceAlias -DestinationPrefix '0.0.0.0/0' -NextHop $route.NextHop -RouteMetric $route.RouteMetric

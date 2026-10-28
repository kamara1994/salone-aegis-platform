param([Parameter(Mandatory=$true)][string]$InterfaceAlias,
      [Parameter(Mandatory=$true)][string]$ExpectedGateway)
$ErrorActionPreference = 'Stop'
$route = @(Get-NetRoute -InterfaceAlias $InterfaceAlias -DestinationPrefix '0.0.0.0/0')
if ($route.Count -ne 1 -or $route[0].NextHop -ne $ExpectedGateway) { throw 'Incorrect default gateway' }
Write-Output 'Gateway matches baseline'

param([Parameter(Mandatory=$true)][uri]$TargetUrl)
$ErrorActionPreference = 'Stop'
$response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 10
if ($response.StatusCode -ne 200) { throw 'Application unreachable' }
Write-Output 'Application reachable'

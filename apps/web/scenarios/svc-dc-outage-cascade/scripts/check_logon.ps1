# Check "logon-up" for svc-dc-outage-cascade: Domain logons succeed
# Runs on WS-FIN-02. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  $out = nltest /dsgetdc:corp.salonemutual.lab /force 2>&1
  $ok = $LASTEXITCODE -eq 0
  $dc = ($out | Select-String 'DC: \\\\(\S+)').Matches.Groups[1].Value
  Out-Check $ok $(if ($ok) { "Logons served by $dc" } else { 'There are currently no logon servers available' })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

# Check "verified" for se-cfo-mfa-reset: Identity check recorded through a trusted channel
# Runs on DC01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  # Identity checks are recorded by the platform (POST /tickets/{id}/chat/verify-identity); read them back for this run.
  $run = Invoke-RestMethod -Uri "$env:AEGIS_API/scenario-runs/$env:AEGIS_RUN_ID" -Headers @{ Authorization = "Bearer $env:AEGIS_RUN_TOKEN" }
  $trusted = @($run.identity_checks | Where-Object { $_.method -in @('callback_known_number', 'manager_confirmation') })
  Out-Check ($trusted.Count -gt 0) $(if ($trusted.Count -gt 0) { "Verified through $($trusted[0].method -replace '_', ' ')" } else { 'No identity check through a trusted channel was recorded' })
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

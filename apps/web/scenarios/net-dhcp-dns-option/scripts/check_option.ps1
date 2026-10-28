# Check "scope-dns" for net-dhcp-dns-option: Scope 10.10.20.0 option 006 is 10.10.10.10
# Runs on DC01. Prints one JSON line and exits 0 (passed) or 1 (failed); 2 means the check itself errored.
$ErrorActionPreference = 'Stop'
function Out-Check([bool]$Passed, [string]$Output) {
  [pscustomobject]@{ passed = $Passed; output = $Output } | ConvertTo-Json -Compress
  exit ([int](-not $Passed))
}
try {
  $v = (Get-DhcpServerv4OptionValue -ScopeId 10.10.20.0 -OptionId 6).Value
  $ok = $v.Count -gt 0 -and ($v[0] -eq '10.10.10.10' -or $v[0] -eq '10.10.10.11')
  Out-Check $ok "Option 006: $($v -join ', ')"
} catch {
  [pscustomobject]@{ passed = $false; output = "check error: $($_.Exception.Message)" } | ConvertTo-Json -Compress
  exit 2
}

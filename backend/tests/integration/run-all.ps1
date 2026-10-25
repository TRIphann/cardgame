# Master test orchestrator - runs ALL integration suites in order (serially).
#
# Usage:
#   pwsh -File run-all.ps1
#   pwsh -File run-all.ps1 -Only card-future,card-shuffle
#   pwsh -File run-all.ps1 -Skip card-bomb
#   pwsh -File run-all.ps1 -OnlySlow        # run only the long suites
#   pwsh -File run-all.ps1 -List             # list suites and exit
#
# Each suite is independent - a failure does NOT stop the remaining suites,
# so a single run reports the full picture. The exit code reflects the
# overall pass/fail count.
#
# The suite list lives in _suites.ps1 and is shared with run-all-parallel.ps1
# so the two orchestrators can never drift apart.

param(
  [string[]] $Only = @(),
  [string[]] $Skip = @(),
  [switch]    $OnlySlow,
  [switch]    $List
)

$ErrorActionPreference = "Continue"
$here = $PSScriptRoot

. "$here\_suites.ps1"

if ($List) {
  Write-Output ""
  Write-Output ("{0,-20} {1,-9} {2,-8} {3}" -f "SUITE", "FAMILY", "EXPECT", "DESCRIPTION")
  Write-Output ("-" * 100)
  foreach ($s in $suites) {
    Write-Output ("{0,-20} {1,-9} {2,-8} {3}" -f $s.Name, $s.Family, "$($s.Timeout)s", $s.Desc)
  }
  Write-Output ""
  Write-Output "Total: $($suites.Count) suites"
  exit 0
}

$selected = Select-Suites -All $suites -Only $Only -Skip $Skip
if ($OnlySlow) {
  $selected = @($selected | Where-Object { $_.Timeout -ge $script:slowSuiteThresholdSec })
}

if ($selected.Count -eq 0) {
  Write-Output "No suites to run."
  exit 0
}

Write-Output "============================================="
Write-Output "Arcana - Card Battle: INTEGRATION TEST RUN"
Write-Output "============================================="
Write-Output "Backend:  $env:ARCANA_API_BASE_URL"
Write-Output "Date:     $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Output "Suites:   $($selected.Count)"
Write-Output ""

$results = @()
foreach ($suite in $selected) {
  $path = Get-SuiteFilePath -Suite $suite -Root $here
  if (-not (Test-Path $path)) {
    Write-Output "[SKIP] $($suite.Name) - file not found: $path"
    $results += [PSCustomObject]@{ Suite = $suite.Name; ExitCode = 2; Duration = "0s" }
    continue
  }

  Write-Output ""
  Write-Output "#############################################"
  Write-Output "# Suite: $($suite.Name)"
  Write-Output "# Desc:  $($suite.Desc)"
  Write-Output "# File:  $($suite.File)"
  Write-Output "#############################################"

  $start = Get-Date
  & pwsh -NoProfile -File $path
  $exitCode = $LASTEXITCODE
  $duration = (Get-Date) - $start

  $results += [PSCustomObject]@{
    Suite    = $suite.Name
    ExitCode = $exitCode
    Duration = "$([int]$duration.TotalSeconds)s"
  }
}

Write-Output ""
Write-Output "============================================="
Write-Output "SUMMARY"
Write-Output "============================================="
$passed = @($results | Where-Object { $_.ExitCode -eq 0 }).Count
$failed = @($results | Where-Object { $_.ExitCode -ne 0 }).Count
foreach ($r in $results) {
  $status = if ($r.ExitCode -eq 0) { "PASS" } else { "FAIL($($r.ExitCode))" }
  Write-Output ("  {0,-20} {1,-10} {2,8}" -f $r.Suite, $status, $r.Duration)
}
Write-Output ""
Write-Output "Passed: $passed  Failed: $failed"

if ($failed -gt 0) { exit 1 } else { exit 0 }

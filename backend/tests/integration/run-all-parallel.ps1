# Master parallel orchestrator - runs integration suites in parallel.
#
# Usage:
#   pwsh -File run-all-parallel.ps1
#   pwsh -File run-all-parallel.ps1 -Only card-future,card-shuffle
#   pwsh -File run-all-parallel.ps1 -Skip card-bomb
#   pwsh -File run-all-parallel.ps1 -Throttle 4      # max parallel jobs
#   pwsh -File run-all-parallel.ps1 -NoIsolate        # ignore state isolation
#
# Suites with state-isolation requirements (use distinct host names) run safely
# in parallel. The Test Lobby /api/test/room/current endpoint is shared, so we
# serialize just that family of suites by default. Pass -NoIsolate to ignore.
#
# The suite list lives in _suites.ps1 and is shared with run-all.ps1 so the two
# orchestrators can never drift apart.

param(
  [string[]] $Only = @(),
  [string[]] $Skip = @(),
  [int]      $Throttle = 6,
  [switch]   $NoIsolate
)

$ErrorActionPreference = "Continue"
$here = $PSScriptRoot

. "$here\_suites.ps1"

$suites = Select-Suites -All $suites -Only $Only -Skip $Skip

Write-Output "============================================="
Write-Output "Arcana - Card Battle: PARALLEL INTEGRATION TEST RUN"
Write-Output "============================================="
Write-Output "Throttle:   $Throttle parallel jobs"
Write-Output "Isolate:    $(if ($NoIsolate) { 'OFF - all parallel' } else { 'ON - test/normal split' })"
Write-Output "Date:       $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Output "Suites:     $($suites.Count)"
Write-Output ""

if ($suites.Count -eq 0) {
  Write-Output "No suites to run."
  exit 0
}

# Group by family. Suites in the "test" family all mutate the SAME in-memory
# test room (GET/DELETE /api/test/room/current) so they MUST run sequentially.
# The "normal" family creates its own rooms via /api/rooms, so it can go wide.
$groups = @{}
foreach ($s in $suites) {
  $fam = if ($NoIsolate) { "all" } else { $s.Family }
  if (-not $groups.ContainsKey($fam)) { $groups[$fam] = @() }
  $groups[$fam] += $s
}

$results = @()
$logDir = Join-Path $here "_logs"

function Invoke-SuiteJob {
  param($Suite, $OutPath)
  $path = Get-SuiteFilePath -Suite $Suite -Root $here
  if (-not (Test-Path $path)) {
    Set-Content -Path $OutPath -Value "[SKIP] $($Suite.Name) - file not found: $path"
    return @{ Suite = $Suite.Name; ExitCode = 2; Duration = "0s"; OutPath = $OutPath }
  }

  $start = Get-Date
  $proc = Start-Process -FilePath "pwsh" `
    -ArgumentList @("-NoProfile","-File", $path) `
    -RedirectStandardOutput $OutPath `
    -RedirectStandardError ($OutPath + ".err") `
    -NoNewWindow -PassThru -Wait
  $duration = (Get-Date) - $start

  return @{
    Suite    = $Suite.Name
    ExitCode = $proc.ExitCode
    Duration = "$([int]$duration.TotalSeconds)s"
    OutPath  = $OutPath
  }
}

# Run each family. The two families run concurrently with each other:
#   - normal family -> one ThreadJob per suite (parallel)
#   - test family   -> inline, strictly sequential
$familyOrder = @("normal", "test")
if ($NoIsolate) { $familyOrder = @("all") }

$pendingJobs = @()

foreach ($fam in $familyOrder) {
  $group = $groups[$fam]
  if (-not $group -or $group.Count -eq 0) { continue }

  Write-Output ""
  Write-Output "############################################"
  Write-Output "# Family: $fam  ($($group.Count) suites)"
  Write-Output "############################################"

  if ($fam -eq "test" -or $NoIsolate) {
    # Shared-state family -> run sequentially, inline.
    foreach ($suite in $group) {
      $outPath = Join-Path $logDir "$($suite.Name).log"
      New-Item -ItemType Directory -Path $logDir -Force | Out-Null
      Write-Output "  Running: $($suite.Name)"
      $r = Invoke-SuiteJob -Suite $suite -OutPath $outPath
      $results += [PSCustomObject]$r
      $status = if ($r.ExitCode -eq 0) { "PASS" } else { "FAIL($($r.ExitCode))" }
      Write-Output ("    {0,-18} {1,-12} {2,8}" -f $r.Suite, $status, $r.Duration)
    }
  } else {
    # Independent-state family -> run in parallel via ThreadJobs.
    foreach ($suite in $group) {
      $outPath = Join-Path $logDir "$($suite.Name).log"
      New-Item -ItemType Directory -Path $logDir -Force | Out-Null

      $job = Start-ThreadJob -ScriptBlock {
        param($here, $suite, $outPath)
        # NOTE: a ThreadJob runs in its OWN runspace, so functions defined in
        # the parent session (e.g. Get-SuiteFilePath from _suites.ps1) are
        # NOT visible here. Dot-source the registry inside the job so the
        # helper is available — otherwise every parallel suite dies with
        # "The term 'Get-SuiteFilePath' is not recognized".
        . (Join-Path $here "_suites.ps1")
        $path = Get-SuiteFilePath -Suite $suite -Root $here
        if (-not (Test-Path $path)) {
          Set-Content -Path $outPath -Value "[SKIP] $($suite.Name) - file not found: $path"
          return @{ Suite = $suite.Name; ExitCode = 2; Duration = "0s"; OutPath = $outPath }
        }
        $start = Get-Date
        $proc = Start-Process -FilePath "pwsh" `
          -ArgumentList @("-NoProfile","-File", $path) `
          -RedirectStandardOutput $outPath `
          -RedirectStandardError ($OutPath + ".err") `
          -NoNewWindow -PassThru -Wait
        $duration = (Get-Date) - $start
        return @{
          Suite    = $suite.Name
          ExitCode = $proc.ExitCode
          Duration = "$([int]$duration.TotalSeconds)s"
          OutPath  = $outPath
        }
      } -ArgumentList $here, $suite, $outPath

      $pendingJobs += [PSCustomObject]@{
        Suite = $suite.Name
        Job   = $job
      }
      Write-Output "  Started (parallel): $($suite.Name)"
    }
  }
}

if ($pendingJobs.Count -gt 0) {
  Write-Output ""
  Write-Output "  Waiting for $($pendingJobs.Count) parallel job(s)..."
  foreach ($pj in $pendingJobs) {
    $out = Receive-Job -Job $pj.Job -Wait -AutoRemoveJob
    $results += [PSCustomObject]$out
    $status = if ($out.ExitCode -eq 0) { "PASS" } else { "FAIL($($out.ExitCode))" }
    Write-Output ("    {0,-18} {1,-12} {2,8}" -f $out.Suite, $status, $out.Duration)
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
  Write-Output ("  {0,-22} {1,-12} {2,8}" -f $r.Suite, $status, $r.Duration)
}
Write-Output ""
Write-Output "Passed: $passed  Failed: $failed"
Write-Output "Logs:   $logDir"

if ($failed -gt 0) { exit 1 } else { exit 0 }

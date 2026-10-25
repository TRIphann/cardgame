# Shared suite registry for the Arcana backend integration tests.
#
# Sourced by run-all.ps1 (serial) and run-all-parallel.ps1 (parallel) so both
# orchestrators always agree on WHICH suites exist. Previously the two
# orchestrators maintained separate hardcoded lists and drifted apart — the
# serial runner silently omitted `timer`, so that suite never ran in CI.
#
# Usage:
#   . "$PSScriptRoot\_suites.ps1"
#   $suites | ForEach-Object { $_.Name }
#
# Fields per suite:
#   Name    - short id used by -Only / -Skip
#   File    - path relative to the integration/ root
#   Desc    - human readable description
#   Family  - "test"  = mutates the shared in-memory test room (/api/test/room/current)
#             "normal"= creates its own rooms via /api/rooms (independent state)
#   Timeout - expected wall-clock budget in seconds (informational)

$suites = @(
  # ── Card mechanic suites (shared test room) ───────────────────────────
  @{ Name = "card-future";      File = "cards\card-future-test.ps1";    Desc = "Future card - peek 3, multi-nope, 10s timer"; Family = "test"; Timeout = 20 },
  @{ Name = "card-shuffle";     File = "cards\card-shuffle-test.ps1";   Desc = "Shuffle card - deck reorder, double shuffle"; Family = "test"; Timeout = 15 },
  @{ Name = "card-attack";      File = "cards\card-attack-test.ps1";    Desc = "Attack card - stack, chain, nope, timer reset"; Family = "test"; Timeout = 35 },
  @{ Name = "card-skip";        File = "cards\card-skip-test.ps1";      Desc = "Skip card - turn advance, bot play, nope"; Family = "test"; Timeout = 20 },
  @{ Name = "card-nope";        File = "cards\card-nope-test.ps1";      Desc = "Nope card - cancel each action, multi-nope"; Family = "test"; Timeout = 25 },
  @{ Name = "card-favor";       File = "cards\card-favor-test.ps1";     Desc = "Favor card - user/bot targets, empty hand"; Family = "test"; Timeout = 25 },
  @{ Name = "card-defuse";      File = "cards\card-defuse-test.ps1";    Desc = "Defuse card - bomb placement, no-defuse death"; Family = "test"; Timeout = 45 },
  @{ Name = "card-combo";       File = "cards\card-combo-test.ps1";     Desc = "Combo cards - 2-same, 5-any, cancel"; Family = "test"; Timeout = 25 },
  @{ Name = "card-bomb";        File = "cards\card-bomb-test.ps1";      Desc = "Bomb card - draw, placement, game over"; Family = "test"; Timeout = 70 },

  # ── Game flow / turn / bot suites ─────────────────────────────────────
  @{ Name = "game-flow";        File = "flow\game-flow-test.ps1";        Desc = "Game flow - start, turn, winner, restart"; Family = "test"; Timeout = 100 },
  @{ Name = "timer";            File = "flow\timer-test.ps1";            Desc = "10s turn timer rule (TC-T1..T12)"; Family = "test"; Timeout = 60 },
  @{ Name = "bot-modes";        File = "flow\bot-modes-test.ps1";        Desc = "Bot modes - draw-only / play-cards / one-card"; Family = "test"; Timeout = 30 },
  @{ Name = "normal-game-flow"; File = "flow\normal-game-flow.ps1";     Desc = "Room lifecycle - create/join/ready/start/leave"; Family = "normal"; Timeout = 20 },

  # ── Lobby suites ──────────────────────────────────────────────────────
  @{ Name = "lobby-normal";     File = "lobby\lobby-normal-test.ps1";     Desc = "Normal lobby multi-tab flow (TC13)"; Family = "normal"; Timeout = 25 },
  @{ Name = "lobby-test-bot";   File = "lobby\lobby-test-bot-test.ps1";   Desc = "Test lobby bot modes + timer + defuse (TC14)"; Family = "test"; Timeout = 70 }
)

# Suites whose expected duration exceeds this threshold are considered "slow".
# CI splits them into a separate step so fast suites give feedback quickly.
$script:slowSuiteThresholdSec = 45

function Get-SuiteFilePath {
  param([Parameter(Mandatory)] $Suite, [string] $Root)
  return (Join-Path $Root $Suite.File)
}

function Select-Suites {
  <#
    Filters the shared $suites list by -Only / -Skip.
    Returns the filtered list. Unknown names are reported but do not abort.
  #>
  param(
    $All,
    [string[]] $Only = @(),
    [string[]] $Skip = @()
  )
  $selected = @($All)
  if ($Only.Count -gt 0) {
    $selected = @($selected | Where-Object { $Only -contains $_.Name })
    $unknown = @($Only | Where-Object { $n = $_; -not ($All | Where-Object { $_.Name -eq $n }) })
    foreach ($u in $unknown) { Write-Output "WARNING: unknown suite '$u' (ignored)" }
  }
  if ($Skip.Count -gt 0) {
    $selected = @($selected | Where-Object { $Skip -notcontains $_.Name })
  }
  return $selected
}

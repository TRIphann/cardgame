# Normal Game Flow Integration Test
# Tests the PRODUCTION `/api/rooms/*` endpoints (NOT the test/bot endpoints).
# This is the workflow real human players use: create → join → start → play.
#
# Prerequisites:
#   - Backend API running on http://localhost:5000
#   - Firestore (or in-memory repo) configured for production rooms

$api = "http://localhost:5000"
$passed = 0
$failed = 0

function Get-PropVal($obj, $key) {
  if ($null -eq $obj) { return $null }
  $prop = $obj.PSObject.Properties[$key]
  if ($prop) { return $prop.Value } else { return $null }
}

function Run-Test {
  param($name, $script)
  Write-Host ""
  Write-Host "== $name =="
  try {
    & $script
    $global:passed++
    Write-Host "  PASS"
  } catch {
    $global:failed++
    Write-Host "  FAIL: $_"
    if ($_.Exception) { Write-Host "    $($_.Exception.Message)" }
  }
}

function Invalidate-Cache($roomId, $memberId) {
  Invoke-WebRequest -Uri "$api/api/rooms/$roomId/heartbeat" -Method Post `
    -Body (@{ memberId = $memberId } | ConvertTo-Json) `
    -ContentType "application/json" -TimeoutSec 5 -UseBasicParsing | Out-Null
}

function Get-Snapshot($roomId, [string]$memberId = "") {
  $qs = if ($memberId) { "?memberId=$memberId" } else { "" }
  return Invoke-RestMethod -Uri "$api/api/rooms/$roomId/snapshot$qs" -Method Get -TimeoutSec 5
}

function Wait-ForSnapshot($roomId, $predicate, $memberId, [int]$timeoutSec = 8) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  $snap = $null
  while ((Get-Date) -lt $deadline) {
    Invalidate-Cache $roomId $memberId
    $snap = Get-Snapshot $roomId
    if (& $predicate $snap) { return $snap }
    Start-Sleep -Milliseconds 300
  }
  return $snap
}

# ─────────────────────────────────────────────────────────────────────
Run-Test "1.1 Host creates room with POST /api/rooms" {
  $body = @{ hostName = "Host" } | ConvertTo-Json
  $res = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  if (-not $res.id) { throw "no room id returned" }
  if ($res.code.Length -ne 6) { throw "code should be 6 chars, got: $($res.code)" }
  if ($res.status -ne "waiting") { throw "status should be 'waiting', got: $($res.status)" }
  if ($res.hostName -ne "Host") { throw "hostName mismatch" }
  if ($res.members.Count -ne 1) { throw "expected 1 member (host), got $($res.members.Count)" }
  if (-not $res.members[0].isHost) { throw "first member should be host" }
}

Run-Test "2.1 Second player joins via code" {
  $body = @{ hostName = "H1" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id

  $join = Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Player2" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
  if ($join.members.Count -lt 2) { throw "join response should show 2 members, got $($join.members.Count)" }
  if ($join.members[1].name -ne "Player2") { throw "second member should be Player2" }
  if ($join.members[1].isHost) { throw "Player2 should not be host" }
}

Run-Test "2.2 Three players in room after three joins" {
  $body = @{ hostName = "H2" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId

  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="P2" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="P3" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null

  $snap = Wait-ForSnapshot $roomId { param($s) $s.members.Count -eq 3 } $hostId
  if ($snap.members.Count -ne 3) { throw "expected 3 members, got $($snap.members.Count)" }
}

Run-Test "2.3 Join with invalid code returns 4xx" {
  try {
    Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code="ZZZZZZ"; playerName="X" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
    throw "should have failed with invalid code"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -lt 400 -or $code -ge 500) { throw "expected 4xx, got $code" }
  }
}

Run-Test "2.4 Empty player name rejected" {
  $body = @{ hostName = "H2_4" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  try {
    Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
    throw "should have failed with empty name"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -lt 400 -or $code -ge 500) { throw "expected 4xx, got $code" }
  }
}

Run-Test "3.1 SetReady endpoint toggles isReady" {
  $body = @{ hostName = "H3" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Bob" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null

  $bobId = (Wait-ForSnapshot $roomId { param($s) $true } $hostId).members |
    Where-Object { $_.name -eq "Bob" } | Select-Object -First 1 -ExpandProperty id

  $ready = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/ready" -Method Post -Body (@{ memberId=$bobId; isReady=$true } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
  if (-not $ready.isReady) { throw "Bob should be ready, got $($ready.isReady)" }

  $notReady = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/ready" -Method Post -Body (@{ memberId=$bobId; isReady=$false } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
  if ($notReady.isReady) { throw "Bob should not be ready, got $($notReady.isReady)" }
}

Run-Test "4.1 Host kicks a member" {
  $body = @{ hostName = "H4" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="KickMe" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  $victim = (Wait-ForSnapshot $roomId { param($s) $true } $hostId).members |
    Where-Object { $_.name -eq "KickMe" } | Select-Object -First 1 -ExpandProperty id

  $after = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/kick" -Method Post -Body (@{ hostId=$hostId; targetMemberId=$victim } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
  $remaining = @($after.members | Where-Object { $_.name -eq "KickMe" }).Count
  if ($remaining -ne 0) { throw "victim should be removed, found $remaining copies" }
}

Run-Test "4.2 Non-host cannot kick" {
  $body = @{ hostName = "H5" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Bob" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  $bobId = (Wait-ForSnapshot $roomId { param($s) $true } $hostId).members |
    Where-Object { $_.name -eq "Bob" } | Select-Object -First 1 -ExpandProperty id

  try {
    Invoke-RestMethod -Uri "$api/api/rooms/$roomId/kick" -Method Post -Body (@{ hostId=$bobId; targetMemberId=$hostId } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
    throw "should have failed"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -lt 400 -or $code -ge 500) { throw "expected 4xx for non-host kick, got $code" }
  }
}

Run-Test "5.1 Start game with 3 players transitions to 'playing'" {
  $body = @{ hostName = "H6" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Bob" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Carol" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  $snap = Wait-ForSnapshot $roomId { param($s) $s.members.Count -ge 3 } $hostId

  $started = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/start" -Method Post -Body (@{ hostId=$hostId } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
  if ($started.status -ne "playing") { throw "status should be 'playing', got: $($started.status)" }
  if (-not $started.gameState) { throw "gameState should exist after start" }
  if (-not $started.gameState.currentTurnMemberId) { throw "currentTurnMemberId should be set" }
  if ($started.gameState.discardCount -ne 0) { throw "discard pile should be empty at start" }
}

Run-Test "5.2 Cannot start with only 1 player" {
  $body = @{ hostName = "H7" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  try {
    Invoke-RestMethod -Uri "$api/api/rooms/$($r.id)/start" -Method Post -Body (@{ hostId=$r.hostId } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
    throw "should have failed with too few players"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -lt 400 -or $code -ge 500) { throw "expected 4xx, got $code" }
  }
}

Run-Test "5.3 Non-host cannot start" {
  $body = @{ hostName = "H8" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Bob" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Carol" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  $bobId = (Wait-ForSnapshot $roomId { param($s) $true } $hostId).members |
    Where-Object { $_.name -eq "Bob" } | Select-Object -First 1 -ExpandProperty id

  try {
    Invoke-RestMethod -Uri "$api/api/rooms/$roomId/start" -Method Post -Body (@{ hostId=$bobId } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
    throw "should have failed"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -lt 400 -or $code -ge 500) { throw "expected 4xx, got $code" }
  }
}

Run-Test "6.1 Player on turn can draw (advances turn or triggers effect)" {
  $body = @{ hostName = "H9" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Bob" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Carol" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Wait-ForSnapshot $roomId { param($s) $s.members.Count -ge 3 } $hostId | Out-Null

  $started = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/start" -Method Post -Body (@{ hostId=$hostId } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
  $firstTurn = $started.gameState.currentTurnMemberId
  $firstHand = (Get-PropVal $started.gameState.handCounts $firstTurn)
  if ($null -eq $firstHand) { throw "first player should start with cards (handCounts missing)" }
  if ($firstHand -lt 1) { throw "first player should start with >=1 card, got $firstHand" }

  $draw = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/game/draw-card" -Method Post -Body (@{ memberId=$firstTurn } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
  if ([string]::IsNullOrEmpty($draw.toast)) { throw "draw should return a toast describing the card drawn" }
  # The draw response shape varies based on what was drawn (defuse prompt,
  # favor pick, future peek, normal turn advance). Any of those is a valid
  # outcome - the post-state is verified through the snapshot endpoint below.
  $snap = Wait-ForSnapshot $roomId { param($s) ($s.gameState -ne $null) -and ($s.status -eq "playing") } $firstTurn
  if ($snap.gameState -eq $null) { throw "snapshot should include gameState after draw" }
  # Either turn advanced OR a special-effect flag is set (defuse/favor/future).
  $advanced = $snap.gameState.currentTurnMemberId -ne $firstTurn
  $requiresDefuse = $draw.requiresDefuse -eq $true
  $requiresFavor = $draw.requiresFavorTargetPick -eq $true
  $hasFuturePeek = ($draw.futurePeek -ne $null) -and ($draw.futurePeek.Count -gt 0)
  if (-not $advanced -and -not $requiresDefuse -and -not $requiresFavor -and -not $hasFuturePeek) {
    throw "draw should either advance turn or trigger a special effect"
  }
}

Run-Test "6.2 Player NOT on turn cannot draw" {
  $body = @{ hostName = "H10" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Bob" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Carol" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Wait-ForSnapshot $roomId { param($s) $s.members.Count -ge 3 } $hostId | Out-Null
  $started = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/start" -Method Post -Body (@{ hostId=$hostId } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
  $firstTurn = $started.gameState.currentTurnMemberId
  $other = ($started.members | Where-Object { $_.id -ne $firstTurn })[0].id
  try {
    Invoke-RestMethod -Uri "$api/api/rooms/$roomId/game/draw-card" -Method Post -Body (@{ memberId=$other } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
    throw "should have failed for non-turn draw"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -lt 400 -or $code -ge 500) { throw "expected 4xx, got $code" }
  }
}

Run-Test "7.1 Heartbeat returns 204" {
  $body = @{ hostName = "H11" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $res = Invoke-WebRequest -Uri "$api/api/rooms/$($r.id)/heartbeat" -Method Post -Body (@{ memberId=$r.hostId } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 -UseBasicParsing
  if ($res.StatusCode -ne 204) { throw "expected 204, got $($res.StatusCode)" }
}

Run-Test "8.1 Player can concede mid-game" {
  $body = @{ hostName = "H12" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Bob" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Carol" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Wait-ForSnapshot $roomId { param($s) $s.members.Count -ge 3 } $hostId | Out-Null
  Invoke-RestMethod -Uri "$api/api/rooms/$roomId/start" -Method Post -Body (@{ hostId=$hostId } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null

  $concede = Invoke-RestMethod -Uri "$api/api/rooms/$roomId/game/concede" -Method Post -Body (@{ memberId=$hostId } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
  $alive = (Get-PropVal $concede.gameState.alive $hostId)
  if ($alive) { throw "conceded player should be marked dead" }
}

Run-Test "9.1 Non-host member can leave" {
  $body = @{ hostName = "H13" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Bob" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  $bobId = (Wait-ForSnapshot $roomId { param($s) $true } $hostId).members |
    Where-Object { $_.name -eq "Bob" } | Select-Object -First 1 -ExpandProperty id

  $res = Invoke-WebRequest -Uri "$api/api/rooms/$roomId/members/$bobId/leave" -Method Post -TimeoutSec 5 -UseBasicParsing
  if ($res.StatusCode -ne 204) { throw "expected 204, got $($res.StatusCode)" }

  $snap = Wait-ForSnapshot $roomId { param($s) $true } $hostId
  $bobRemaining = @($snap.members | Where-Object { $_.name -eq "Bob" }).Count
  if ($bobRemaining -ne 0) { throw "Bob should be gone, found $bobRemaining" }
}

Run-Test "10.1 Rotate requires finished game (waiting -> 4xx)" {
  $body = @{ hostName = "H14" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Bob" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="Carol" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Wait-ForSnapshot $roomId { param($s) $s.members.Count -ge 3 } $hostId | Out-Null

  try {
    Invoke-RestMethod -Uri "$api/api/rooms/$roomId/rotate" -Method Post -Body (@{ hostId=$hostId } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
    throw "should have failed in waiting state"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -lt 400 -or $code -ge 500) { throw "expected 4xx in waiting state, got $code" }
  }
}

Run-Test "11.1 Snapshot reflects room state after heartbeat" {
  $body = @{ hostName = "H15" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/rooms" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
  $roomId = $r.id
  $hostId = $r.hostId

  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="P1" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Invalidate-Cache $roomId $hostId
  $snap = Get-Snapshot $roomId
  if ($snap.members.Count -ne 2) { throw "expected 2 after first join, got $($snap.members.Count)" }

  Invoke-RestMethod -Uri "$api/api/rooms/join" -Method Post -Body (@{ code=$r.code; playerName="P2" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 | Out-Null
  Invalidate-Cache $roomId $hostId
  $snap = Get-Snapshot $roomId
  if ($snap.members.Count -ne 3) { throw "expected 3 after second join, got $($snap.members.Count)" }
}

Write-Host ""
Write-Host "=========================================="
Write-Host "NORMAL GAME FLOW TEST SUMMARY"
Write-Host "  Passed: $passed"
Write-Host "  Failed: $failed"
Write-Host "=========================================="
if ($failed -gt 0) { exit 1 } else { exit 0 }
